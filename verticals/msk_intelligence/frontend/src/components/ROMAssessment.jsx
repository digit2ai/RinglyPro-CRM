import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';

// 3D joint angle calculation using world coordinates (meters)
// This is the TRUE anatomical angle, not a 2D screen projection.
// Uses the dot product / arc cosine formula for the angle at vertex `b`
// formed by vectors b→a and b→c.
function calcAngle3D(a, b, c) {
  if (!a || !b || !c) return null;
  // Vector from b to a
  const ba = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  // Vector from b to c
  const bc = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
  // Dot product
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  // Magnitudes
  const magBa = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
  const magBc = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);
  if (magBa === 0 || magBc === 0) return null;
  // Clamp to [-1, 1] to avoid NaN from floating-point errors
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
  const angle = (Math.acos(cosAngle) * 180) / Math.PI;
  return Math.round(angle * 10) / 10;
}

// Minimum visibility score for a landmark to be trusted (0-1)
// MediaPipe's visibility scores are conservative — 0.3 is "clearly visible"
const MIN_VISIBILITY = 0.3;

// Number of samples for the moving average smoothing buffer
const SMOOTHING_WINDOW = 8;

// Normal ROM ranges by assessment type
const ROM_NORMALS = {
  knee_flexion: { min: 0, max: 135, label: 'Knee Flexion' },
  knee_extension: { min: 0, max: 0, label: 'Knee Extension' },
  shoulder_abduction: { min: 0, max: 180, label: 'Shoulder Abduction' },
  shoulder_flexion: { min: 0, max: 180, label: 'Shoulder Flexion' },
  shoulder_external_rotation: { min: 0, max: 90, label: 'Shoulder External Rotation' },
  hip_flexion: { min: 0, max: 120, label: 'Hip Flexion' },
  cervical_rotation: { min: 0, max: 80, label: 'Cervical Rotation' },
  elbow_flexion: { min: 0, max: 145, label: 'Elbow Flexion' },
  lumbar_flexion: { min: 0, max: 80, label: 'Lumbar Flexion' },
};

const ASSESSMENT_TYPES = Object.entries(ROM_NORMALS).map(([key, val]) => ({ value: key, label: val.label }));

export default function ROMAssessment({ caseId, consultationId, onMeasurementSaved }) {
  const [active, setActive] = useState(false);
  const [assessmentType, setAssessmentType] = useState('knee_flexion');
  const [bodySide, setBodySide] = useState('right');
  const [currentAngle, setCurrentAngle] = useState(null);
  const [confidence, setConfidence] = useState(0); // 0-100, average visibility of joints used
  const [measurements, setMeasurements] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [modelStatus, setModelStatus] = useState('idle'); // idle | loading | ready | failed
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [useBackCamera, setUseBackCamera] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  // Smoothing buffer — moving average of last N angle samples
  const angleBufferRef = useRef([]);

  const cleanup = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    angleBufferRef.current = [];
    setActive(false);
    setCurrentAngle(null);
    setConfidence(0);
  }, []);

  // Reset smoothing buffer when switching joint or side mid-session
  useEffect(() => {
    angleBufferRef.current = [];
    setCurrentAngle(null);
  }, [assessmentType, bodySide]);

  useEffect(() => cleanup, [cleanup]);

  // Once active + video element exists, attach the stream
  useEffect(() => {
    if (!active || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().then(() => {
      detectLoop();
    }).catch(() => {
      // autoplay may handle it
      detectLoop();
    });
  }, [active]);

  const startAssessment = async () => {
    setError(null);
    setModelStatus('idle');
    try {
      // Detect mobile — on mobile we want portrait (taller than wide) to capture full body
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
      // Pick camera: back camera ('environment') captures wider field, ideal for full body
      const facingMode = useBackCamera ? { exact: 'environment' } : 'user';

      // Request portrait dimensions on mobile, landscape on desktop
      const videoConstraints = isMobile
        ? {
            // Portrait: height > width — captures full body when phone is held vertically
            width: { ideal: 1080, min: 720 },
            height: { ideal: 1920, min: 1280 },
            facingMode,
            aspectRatio: { ideal: 9/16 }
          }
        : {
            // Landscape: standard webcam orientation
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            facingMode
          };

      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      streamRef.current = stream;

      // Show camera immediately, load AI model in background
      setActive(true);

      // Load MediaPipe in background (don't block camera)
      loadMediaPipe();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera access.');
      } else {
        setError('Failed to start assessment: ' + err.message);
      }
    }
  };

  const loadMediaPipe = async () => {
    setModelStatus('loading');
    try {
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1
      });
      setModelStatus('ready');
      console.log('[MSK ROM] MediaPipe loaded successfully');
    } catch (mpErr) {
      console.warn('[MSK ROM] MediaPipe not available:', mpErr.message);
      poseLandmarkerRef.current = null;
      setModelStatus('failed');
    }
  };

  const detectLoop = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;

    const detect = () => {
      if (!streamRef.current) return;

      // Sync canvas internal resolution with video — CSS handles display size
      if (ctx && video.videoWidth > 0 && canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Run MediaPipe pose detection if available
      if (poseLandmarkerRef.current && video.videoWidth > 0) {
        try {
          const result = poseLandmarkerRef.current.detectForVideo(video, performance.now());
          if (result.landmarks && result.landmarks.length > 0) {
            const lm2D = result.landmarks[0]; // 2D screen coordinates for drawing
            const lm3D = result.worldLandmarks && result.worldLandmarks[0]; // 3D world coordinates for accurate angle math

            // Get the 3 joint indices relevant to the selected measurement
            const jointIndices = getJointIndices(assessmentType, bodySide);

            // Draw ONLY the goniometer for the selected joint (not all 33 landmarks)
            if (ctx && jointIndices) {
              drawGoniometer(ctx, lm2D, jointIndices, currentAngle);
            }

            // Use 3D world landmarks if available — these are TRUE anatomical
            // coordinates in meters relative to the hip center, not 2D screen projections.
            const sourceLandmarks = lm3D || lm2D;
            const result2 = calculateROMAngleWithConfidence(sourceLandmarks, lm2D, assessmentType, bodySide);
            if (result2.angle !== null) {
              // Smoothing: moving average of last N samples
              angleBufferRef.current.push(result2.angle);
              if (angleBufferRef.current.length > SMOOTHING_WINDOW) {
                angleBufferRef.current.shift();
              }
              const smoothed = angleBufferRef.current.reduce((s, v) => s + v, 0) / angleBufferRef.current.length;
              setCurrentAngle(Math.round(smoothed * 10) / 10);
              setConfidence(Math.round(result2.confidence * 100));
            }
          }
        } catch (e) {
          // Detection frame error, continue
        }
      }

      animRef.current = requestAnimationFrame(detect);
    };
    detect();
  };

  // Returns the {a, b, c} landmark indices for the selected joint measurement
  // b is the vertex of the angle (the actual joint)
  const getJointIndices = (type, side) => {
    const L = {
      LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
      LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
      LEFT_WRIST: 15, RIGHT_WRIST: 16,
      LEFT_HIP: 23, RIGHT_HIP: 24,
      LEFT_KNEE: 25, RIGHT_KNEE: 26,
      LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
    };
    const s = side === 'left' ? 'LEFT' : 'RIGHT';
    switch (type) {
      case 'knee_flexion':
      case 'knee_extension':
        return { a: L[`${s}_HIP`], b: L[`${s}_KNEE`], c: L[`${s}_ANKLE`], jointName: 'Knee' };
      case 'shoulder_abduction':
      case 'shoulder_flexion':
        return { a: L[`${s}_HIP`], b: L[`${s}_SHOULDER`], c: L[`${s}_ELBOW`], jointName: 'Shoulder' };
      case 'shoulder_external_rotation':
        return { a: L[`${s}_SHOULDER`], b: L[`${s}_ELBOW`], c: L[`${s}_WRIST`], jointName: 'Shoulder Rot' };
      case 'hip_flexion':
        return { a: L[`${s}_SHOULDER`], b: L[`${s}_HIP`], c: L[`${s}_KNEE`], jointName: 'Hip' };
      case 'elbow_flexion':
        return { a: L[`${s}_SHOULDER`], b: L[`${s}_ELBOW`], c: L[`${s}_WRIST`], jointName: 'Elbow' };
      default:
        return null;
    }
  };

  // Draw a real goniometer overlay: 3 joints + 2 arms + angle arc at vertex
  const drawGoniometer = (ctx, landmarks, indices, angle) => {
    const { a, b, c, jointName } = indices;
    const lmA = landmarks[a];
    const lmB = landmarks[b];
    const lmC = landmarks[c];
    if (!lmA || !lmB || !lmC) return;

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const ax = lmA.x * W, ay = lmA.y * H;
    const bx = lmB.x * W, by = lmB.y * H;
    const cx = lmC.x * W, cy = lmC.y * H;

    // === Goniometer arms (the two lines pivoting around the joint vertex) ===
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.9)'; // bright blue
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    // Arm 1: vertex (b) to point (a)
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    // Arm 2: vertex (b) to point (c)
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // === Angle arc at the vertex (the goniometer's protractor) ===
    if (angle !== null && angle !== undefined) {
      const angleA = Math.atan2(ay - by, ax - bx);
      const angleC = Math.atan2(cy - by, cx - bx);
      const radius = 50;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)'; // amber/gold for the arc
      ctx.lineWidth = 4;
      ctx.beginPath();
      // Draw the shorter arc between the two arms
      let startAngle = angleA;
      let endAngle = angleC;
      let diff = endAngle - startAngle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      ctx.arc(bx, by, radius, startAngle, startAngle + diff, diff < 0);
      ctx.stroke();
    }

    // === Endpoint joint dots (proximal and distal) ===
    ctx.fillStyle = 'rgba(14, 165, 233, 0.95)';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    [{ x: ax, y: ay }, { x: cx, y: cy }].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    });

    // === Vertex (the actual joint being measured) — large highlighted dot ===
    ctx.fillStyle = '#f59e0b'; // gold to match the arc
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(bx, by, 14, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // === Joint name label next to the vertex ===
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px -apple-system, system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(jointName, bx + 22, by - 10);
    ctx.shadowBlur = 0;
  };

  // Returns { angle, confidence } where confidence is the average visibility (0-1)
  // of the 3 landmarks used. Confidence comes from the 2D landmarks because
  // worldLandmarks don't carry visibility scores.
  const calculateROMAngleWithConfidence = (landmarks3D, landmarks2D, type, side) => {
    // MediaPipe Pose landmark indices
    const L = {
      LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
      LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
      LEFT_WRIST: 15, RIGHT_WRIST: 16,
      LEFT_HIP: 23, RIGHT_HIP: 24,
      LEFT_KNEE: 25, RIGHT_KNEE: 26,
      LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
    };

    const s = side === 'left' ? 'LEFT' : 'RIGHT';
    let aIdx, bIdx, cIdx;
    try {
      switch (type) {
        case 'knee_flexion':
        case 'knee_extension':
          aIdx = L[`${s}_HIP`]; bIdx = L[`${s}_KNEE`]; cIdx = L[`${s}_ANKLE`];
          break;
        case 'shoulder_abduction':
        case 'shoulder_flexion':
          aIdx = L[`${s}_HIP`]; bIdx = L[`${s}_SHOULDER`]; cIdx = L[`${s}_ELBOW`];
          break;
        case 'shoulder_external_rotation':
          aIdx = L[`${s}_SHOULDER`]; bIdx = L[`${s}_ELBOW`]; cIdx = L[`${s}_WRIST`];
          break;
        case 'hip_flexion':
          aIdx = L[`${s}_SHOULDER`]; bIdx = L[`${s}_HIP`]; cIdx = L[`${s}_KNEE`];
          break;
        case 'elbow_flexion':
          aIdx = L[`${s}_SHOULDER`]; bIdx = L[`${s}_ELBOW`]; cIdx = L[`${s}_WRIST`];
          break;
        default:
          return { angle: null, confidence: 0 };
      }

      // Visibility scoring — always return angle, just report confidence
      const visA = landmarks2D[aIdx]?.visibility || 0;
      const visB = landmarks2D[bIdx]?.visibility || 0;
      const visC = landmarks2D[cIdx]?.visibility || 0;
      const avgVisibility = (visA + visB + visC) / 3;

      // Only reject if landmarks are completely missing (almost zero visibility)
      if (visA < MIN_VISIBILITY && visB < MIN_VISIBILITY && visC < MIN_VISIBILITY) {
        return { angle: null, confidence: avgVisibility };
      }

      // Calculate angle: prefer 3D world landmarks, fall back to 2D if unavailable
      let angle = null;
      if (landmarks3D && landmarks3D[aIdx] && landmarks3D[bIdx] && landmarks3D[cIdx]) {
        angle = calcAngle3D(landmarks3D[aIdx], landmarks3D[bIdx], landmarks3D[cIdx]);
      }
      // Fallback to 2D if 3D failed
      if (angle === null) {
        angle = calcAngle3D(landmarks2D[aIdx], landmarks2D[bIdx], landmarks2D[cIdx]);
      }
      return { angle, confidence: avgVisibility };
    } catch {
      return { angle: null, confidence: 0 };
    }
  };

  const captureMeasurement = async () => {
    if (currentAngle === null) return;
    // Allow capture at any confidence — confidence is stored with the measurement
    setSaving(true);
    const normal = ROM_NORMALS[assessmentType];
    try {
      await api.post('/rom/measurements', {
        caseId,
        consultationId,
        assessmentType,
        bodySide,
        angleDegrees: currentAngle,
        normalRangeMin: normal.min,
        normalRangeMax: normal.max,
        confidenceScore: confidence,
        collectionPoint: 'follow_up'
      });
      setMeasurements(prev => [...prev, {
        type: assessmentType,
        side: bodySide,
        angle: currentAngle,
        confidence,
        time: new Date().toLocaleTimeString()
      }]);
      if (onMeasurementSaved) onMeasurementSaved();
    } catch (err) {
      setError('Failed to save measurement');
    } finally {
      setSaving(false);
    }
  };

  const manualCapture = () => {
    const angle = prompt('Enter measured angle in degrees:');
    if (angle && !isNaN(parseFloat(angle))) {
      setCurrentAngle(parseFloat(angle));
    }
  };

  if (!active) {
    return (
      <div className="card">
        <h3 className="text-lg font-bold text-white mb-4">ROM Assessment</h3>
        <p className="text-dark-400 text-sm mb-4">
          Measure joint range of motion using your camera with AI pose detection.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Assessment Type</label>
            <select value={assessmentType} onChange={e => setAssessmentType(e.target.value)} className="input-field">
              {ASSESSMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Body Side</label>
            <select value={bodySide} onChange={e => setBodySide(e.target.value)} className="input-field">
              <option value="right">Right</option>
              <option value="left">Left</option>
              <option value="both">Bilateral</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-dark-300 mb-2">Camera</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setUseBackCamera(false)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${!useBackCamera ? 'bg-msk-600/20 border-msk-500 text-msk-400' : 'bg-dark-800 border-dark-600 text-dark-300'}`}
            >
              Front (Selfie)
            </button>
            <button
              type="button"
              onClick={() => setUseBackCamera(true)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${useBackCamera ? 'bg-msk-600/20 border-msk-500 text-msk-400' : 'bg-dark-800 border-dark-600 text-dark-300'}`}
            >
              Back (Wider)
            </button>
          </div>
          <p className="text-xs text-dark-400 mt-2">
            {useBackCamera
              ? 'Back camera is wider — best for full-body shots when phone is propped up.'
              : 'Front camera lets you see yourself while moving — best when alone.'}
          </p>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <button onClick={startAssessment} className="btn-primary w-full">
          Start ROM Assessment
        </button>

        {measurements.length > 0 && (
          <div className="mt-4 border-t border-dark-700 pt-4">
            <h4 className="text-white text-sm font-bold mb-2">Captured Measurements</h4>
            <div className="space-y-1">
              {measurements.map((m, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-dark-300">{ROM_NORMALS[m.type]?.label} ({m.side})</span>
                  <span className="text-msk-400 font-bold">{m.angle}°</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Mirror only when using the front (selfie) camera
  const mirrorTransform = useBackCamera ? 'none' : 'scaleX(-1)';

  return (
    <div className="card p-0 overflow-hidden">
      {/* Video feed with overlay — fills width, height matches video aspect */}
      <div className="relative bg-black" style={{ width: '100%' }}>
        {/* Live video feed — block layout, natural aspect ratio */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            maxHeight: '85vh',
            transform: mirrorTransform
          }}
        />
        {/* Canvas overlay for landmarks — perfectly aligned with video */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: '100%',
            height: '100%',
            transform: mirrorTransform
          }}
        />

        {/* AI Model Status Banner */}
        {modelStatus === 'loading' && (
          <div className="absolute top-4 left-4 right-4 z-10">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-3 flex items-center gap-3">
              <svg className="w-5 h-5 text-msk-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div>
                <p className="text-white text-sm font-medium">Loading AI pose model...</p>
                <p className="text-dark-400 text-xs">Downloading ~4MB model for joint detection. First load only.</p>
              </div>
            </div>
          </div>
        )}
        {modelStatus === 'ready' && currentAngle === null && (
          <div className="absolute top-4 left-4 right-4 z-10">
            <div className="bg-green-500/20 backdrop-blur-sm border border-green-500/30 rounded-lg px-4 py-2">
              <p className="text-green-400 text-sm font-medium">AI pose model ready — hold phone vertically and prop it up so your full body fits in frame</p>
            </div>
          </div>
        )}
        {modelStatus === 'failed' && (
          <div className="absolute top-4 left-4 right-4 z-10">
            <div className="bg-yellow-500/10 backdrop-blur-sm border border-yellow-500/20 rounded-lg px-4 py-2">
              <p className="text-yellow-400 text-sm font-medium">AI model unavailable — use Manual Entry to record measurements</p>
            </div>
          </div>
        )}

        {/* Angle readout overlay */}
        {currentAngle !== null && (
          <div className="absolute top-4 left-4 z-10">
            <div className={`text-5xl font-black font-mono ${confidence >= 85 ? 'text-green-400' : confidence >= 70 ? 'text-yellow-400' : 'text-red-400'}`}
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              {currentAngle}°
            </div>
            <div className="text-white text-xs font-medium mt-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              Normal: {ROM_NORMALS[assessmentType]?.min || 0}° — {ROM_NORMALS[assessmentType]?.max || 180}°
            </div>
            {/* Confidence indicator */}
            <div className="mt-2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 inline-flex">
              <div className="w-20 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${confidence >= 85 ? 'bg-green-400' : confidence >= 70 ? 'bg-yellow-400' : 'bg-red-400'}`}
                  style={{ width: confidence + '%' }}
                />
              </div>
              <span className={`text-xs font-bold ${confidence >= 85 ? 'text-green-400' : confidence >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                {confidence}% confidence
              </span>
            </div>
            {calibrationMode && (
              <div className="mt-2 bg-blue-500/20 border border-blue-500/40 backdrop-blur-sm rounded-md px-2 py-1 inline-block">
                <p className="text-blue-300 text-xs font-medium">Calibration Mode — hold a 90° reference (book corner / paper edge) to verify</p>
              </div>
            )}
          </div>
        )}

        {/* Low confidence warning when no angle yet */}
        {currentAngle === null && modelStatus === 'ready' && confidence > 0 && confidence < 70 && (
          <div className="absolute top-20 left-4 right-4 z-10">
            <div className="bg-yellow-500/20 backdrop-blur-sm border border-yellow-500/30 rounded-lg px-4 py-2">
              <p className="text-yellow-400 text-sm font-medium">Low joint visibility ({confidence}%) — improve lighting or step back so the joint is clearly visible</p>
            </div>
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">{ROM_NORMALS[assessmentType]?.label} — {bodySide}</p>
              <p className="text-dark-300 text-xs">
                {currentAngle !== null ? `Current: ${currentAngle}°` : 'Position yourself in frame'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCalibrationMode(c => !c)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${calibrationMode ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-dark-800 border-dark-600 text-dark-300'}`}
              >
                {calibrationMode ? 'Exit Calibrate' : 'Calibrate'}
              </button>
              <button onClick={manualCapture} className="btn-secondary text-xs px-3 py-1.5">
                Manual Entry
              </button>
              <button onClick={captureMeasurement} disabled={saving || currentAngle === null} className="btn-primary text-sm px-4 disabled:opacity-40 disabled:cursor-not-allowed">
                {saving ? '...' : 'Capture'}
              </button>
              <button onClick={cleanup} className="bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-2 rounded-lg">
                Stop
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Measurements */}
      {measurements.length > 0 && (
        <div className="p-4 border-t border-dark-700">
          <h4 className="text-white text-sm font-bold mb-2">Session Measurements</h4>
          <div className="space-y-1">
            {measurements.map((m, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-dark-300">{ROM_NORMALS[m.type]?.label} ({m.side}) — {m.time}</span>
                <span className="text-msk-400 font-bold">{m.angle}°</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
