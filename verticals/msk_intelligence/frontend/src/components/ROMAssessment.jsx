import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';

// Joint angle calculation from 3 landmarks
function calcAngle(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return Math.round(angle * 10) / 10;
}

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
  const [measurements, setMeasurements] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const poseLandmarkerRef = useRef(null);

  const cleanup = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setActive(false);
    setCurrentAngle(null);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startAssessment = async () => {
    setError(null);
    try {
      // Get camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Try to load MediaPipe (graceful fallback if not available)
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
      } catch (mpErr) {
        console.warn('[MSK ROM] MediaPipe not available, using manual mode:', mpErr.message);
        poseLandmarkerRef.current = null;
      }

      setActive(true);
      // Wait for video to be ready before starting detection
      videoRef.current.onloadedmetadata = () => {
        detectLoop();
      };
      // Fallback if already loaded
      if (videoRef.current.videoWidth > 0) detectLoop();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera access.');
      } else {
        setError('Failed to start assessment: ' + err.message);
      }
    }
  };

  const detectLoop = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;

    const detect = () => {
      if (!streamRef.current) return;

      // Sync canvas size with video for landmark overlay
      if (ctx && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // Run MediaPipe pose detection if available
      if (poseLandmarkerRef.current && video.videoWidth > 0) {
        try {
          const result = poseLandmarkerRef.current.detectForVideo(video, performance.now());
          if (result.landmarks && result.landmarks.length > 0) {
            const lm = result.landmarks[0];
            if (ctx) drawLandmarks(ctx, lm);
            const angle = calculateROMAngle(lm, assessmentType, bodySide);
            if (angle !== null) setCurrentAngle(angle);
          }
        } catch (e) {
          // Detection frame error, continue
        }
      }

      animRef.current = requestAnimationFrame(detect);
    };
    detect();
  };

  const drawLandmarks = (ctx, landmarks) => {
    ctx.fillStyle = '#0ea5e9';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const calculateROMAngle = (landmarks, type, side) => {
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
    try {
      switch (type) {
        case 'knee_flexion':
        case 'knee_extension':
          return calcAngle(landmarks[L[`${s}_HIP`]], landmarks[L[`${s}_KNEE`]], landmarks[L[`${s}_ANKLE`]]);
        case 'shoulder_abduction':
        case 'shoulder_flexion':
          return calcAngle(landmarks[L[`${s}_HIP`]], landmarks[L[`${s}_SHOULDER`]], landmarks[L[`${s}_ELBOW`]]);
        case 'shoulder_external_rotation':
          return calcAngle(landmarks[L[`${s}_SHOULDER`]], landmarks[L[`${s}_ELBOW`]], landmarks[L[`${s}_WRIST`]]);
        case 'hip_flexion':
          return calcAngle(landmarks[L[`${s}_SHOULDER`]], landmarks[L[`${s}_HIP`]], landmarks[L[`${s}_KNEE`]]);
        case 'elbow_flexion':
          return calcAngle(landmarks[L[`${s}_SHOULDER`]], landmarks[L[`${s}_ELBOW`]], landmarks[L[`${s}_WRIST`]]);
        default:
          return null;
      }
    } catch {
      return null;
    }
  };

  const captureMeasurement = async () => {
    if (currentAngle === null) return;
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
        collectionPoint: 'follow_up'
      });
      setMeasurements(prev => [...prev, {
        type: assessmentType,
        side: bodySide,
        angle: currentAngle,
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

  return (
    <div className="card p-0 overflow-hidden">
      {/* Video feed with overlay */}
      <div className="relative bg-black" style={{ minHeight: '320px' }}>
        {/* Live video feed — visible */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full"
          style={{ maxHeight: '480px', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        {/* Canvas overlay for landmarks (positioned on top of video) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ objectFit: 'cover' }}
        />

        {/* Angle readout overlay */}
        {currentAngle !== null && (
          <div className="absolute top-4 left-4 z-10">
            <div className={`text-5xl font-black font-mono ${currentAngle <= (ROM_NORMALS[assessmentType]?.max || 180) * 1.1 ? 'text-green-400' : 'text-red-400'}`}
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              {currentAngle}°
            </div>
            <div className="text-white text-xs font-medium mt-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              Normal: {ROM_NORMALS[assessmentType]?.min || 0}° — {ROM_NORMALS[assessmentType]?.max || 180}°
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
            <div className="flex gap-2">
              <button onClick={manualCapture} className="btn-secondary text-xs px-3 py-1.5">
                Manual Entry
              </button>
              <button onClick={captureMeasurement} disabled={saving || currentAngle === null} className="btn-primary text-sm px-4">
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
