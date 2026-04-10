import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
const mskLogo = 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69d97bc215a505b6793950c0.png';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

const POLL_INTERVAL = 1000;

export default function VideoRoom() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const user = api.getUser();

  const [phase, setPhase] = useState('lobby'); // lobby | connecting | connected | ended
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pollTimerRef = useRef(null);
  const lastPollRef = useRef(0);
  const durationTimerRef = useRef(null);
  const isInitiatorRef = useRef(false);

  // Load meeting info
  useEffect(() => {
    loadMeetingInfo();
    return () => {
      cleanup();
    };
  }, [meetingId]);

  const loadMeetingInfo = async () => {
    try {
      const res = await fetch(`/msk/api/v1/video/info/${meetingId}`);
      const data = await res.json();
      if (data.success) {
        setMeetingInfo(data.data);
      } else {
        setError('Meeting not found');
      }
    } catch (err) {
      setError('Failed to load meeting info');
    }
  };

  const cleanup = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
  }, []);

  const joinMeeting = async () => {
    setPhase('connecting');
    setError(null);

    try {
      // Get media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Join room
      const joinRes = await fetch('/msk/api/v1/video/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          userId: user?.id || `anon-${Date.now()}`,
          displayName: user ? `${user.firstName} ${user.lastName}` : 'Guest',
          role: user?.role || 'patient'
        })
      });

      const joinData = await joinRes.json();
      if (!joinData.success) throw new Error(joinData.error);

      const myId = joinData.data.participantId;
      setParticipantId(myId);
      isInitiatorRef.current = joinData.data.isInitiator;

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote stream
      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setRemoteConnected(true);
        }
      };

      // Send ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch('/msk/api/v1/video/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meetingId,
              fromId: myId,
              type: 'candidate',
              data: event.candidate
            })
          }).catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setPhase('connected');
          // Start duration timer
          const start = Date.now();
          durationTimerRef.current = setInterval(() => {
            setDuration(Math.floor((Date.now() - start) / 1000));
          }, 1000);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setRemoteConnected(false);
        }
      };

      // If we're the initiator, create offer
      if (joinData.data.isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await fetch('/msk/api/v1/video/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId,
            fromId: myId,
            type: 'offer',
            data: pc.localDescription
          })
        });
      }

      // Start polling for signals
      lastPollRef.current = Date.now() - 5000;
      pollTimerRef.current = setInterval(() => pollSignals(myId, pc), POLL_INTERVAL);

      setPhase('connected');

    } catch (err) {
      console.error('[MSK Video] Join error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera/microphone access denied. Please allow access and try again.');
      } else {
        setError(err.message);
      }
      setPhase('lobby');
      cleanup();
    }
  };

  const pollSignals = async (myId, pc) => {
    try {
      const res = await fetch(`/msk/api/v1/video/poll?meetingId=${meetingId}&participantId=${myId}&since=${lastPollRef.current}`);
      const data = await res.json();

      if (!data.success || !data.data.signals.length) return;

      for (const signal of data.data.signals) {
        if (signal.type === 'offer' && !isInitiatorRef.current) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await fetch('/msk/api/v1/video/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meetingId,
              fromId: myId,
              type: 'answer',
              data: pc.localDescription
            })
          });
        } else if (signal.type === 'answer' && isInitiatorRef.current) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
        } else if (signal.type === 'candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(signal.data));
        }

        lastPollRef.current = Math.max(lastPollRef.current, signal.timestamp);
      }

      // Update participant count
      const otherCount = data.data.participants.filter(p => p.participantId !== myId).length;
      setRemoteConnected(otherCount > 0 && pc.connectionState === 'connected');

    } catch (err) {
      // Polling errors are non-fatal
    }
  };

  const leaveMeeting = async () => {
    if (participantId) {
      await fetch('/msk/api/v1/video/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, participantId })
      }).catch(() => {});
    }
    cleanup();
    setPhase('ended');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Lobby / Pre-join screen
  if (phase === 'lobby') {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="card bg-dark-900 p-8">
            <div className="text-center mb-8">
              <img src={mskLogo} alt="Digit2AI" className="h-28 w-auto object-contain mx-auto mb-4 drop-shadow-2xl" />
              <h1 className="text-2xl font-bold text-white">Video Consultation</h1>
              <p className="text-dark-400 text-sm mt-2">MSK Intelligence Secure Video</p>
            </div>

            {meetingInfo && (
              <div className="bg-dark-800 rounded-lg p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-dark-400">Case</span>
                  <span className="text-white font-medium">{meetingInfo.case_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Patient</span>
                  <span className="text-white">{meetingInfo.patient_first_name} {meetingInfo.patient_last_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Radiologist</span>
                  <span className="text-white">Dr. {meetingInfo.radiologist_first_name} {meetingInfo.radiologist_last_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Scheduled</span>
                  <span className="text-white">{meetingInfo.scheduled_at ? new Date(meetingInfo.scheduled_at).toLocaleString() : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Duration</span>
                  <span className="text-white">{meetingInfo.duration_minutes || 30} min</span>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={joinMeeting}
              disabled={!meetingInfo}
              className="btn-primary w-full text-lg py-4"
            >
              Join Consultation
            </button>

            <p className="text-dark-500 text-xs text-center mt-4">
              HIPAA-compliant encrypted video. Your camera and microphone will be requested.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Ended screen
  if (phase === 'ended') {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
        <div className="card bg-dark-900 p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Consultation Ended</h2>
          <p className="text-dark-400 text-sm mb-2">Duration: {formatDuration(duration)}</p>
          <p className="text-dark-400 text-sm mb-6">
            Your radiologist will update your case with findings and recommendations.
          </p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Video room (connecting / connected)
  return (
    <div className="h-screen bg-black flex flex-col">
      {/* Header bar */}
      <div className="bg-dark-900/90 backdrop-blur-sm border-b border-dark-800 px-4 py-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <img src={mskLogo} alt="Digit2AI" className="h-14 w-auto object-contain" />
          <div>
            <p className="text-white text-sm font-medium">
              {meetingInfo?.case_number || 'Video Consultation'}
            </p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${remoteConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-dark-400 text-xs">
                {remoteConnected ? 'Connected' : 'Waiting for other participant...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-dark-300 text-sm font-mono">{formatDuration(duration)}</span>
          <div className={`w-2 h-2 rounded-full ${phase === 'connected' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 relative">
        {/* Remote video (full screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Placeholder when no remote */}
        {!remoteConnected && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-dark-400 text-sm">Waiting for the other participant to join...</p>
              <p className="text-dark-500 text-xs mt-1">Share this meeting link with your specialist</p>
            </div>
          </div>
        )}

        {/* Local video (picture-in-picture) */}
        <div className="absolute bottom-24 right-4 w-48 h-36 rounded-xl overflow-hidden border-2 border-dark-700 shadow-2xl bg-dark-900">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
          />
          {isVideoOff && (
            <div className="w-full h-full flex items-center justify-center bg-dark-800">
              <svg className="w-8 h-8 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
          <div className="absolute bottom-1 left-2 text-[10px] text-white/70 font-medium">You</div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="bg-dark-900/90 backdrop-blur-sm border-t border-dark-800 px-6 py-4 flex items-center justify-center gap-4">
        {/* Mute */}
        <button
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            isMuted ? 'bg-red-500 hover:bg-red-400' : 'bg-dark-700 hover:bg-dark-600'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* Video toggle */}
        <button
          onClick={toggleVideo}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            isVideoOff ? 'bg-red-500 hover:bg-red-400' : 'bg-dark-700 hover:bg-dark-600'
          }`}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>

        {/* End call */}
        <button
          onClick={leaveMeeting}
          className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-all"
          title="End call"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
