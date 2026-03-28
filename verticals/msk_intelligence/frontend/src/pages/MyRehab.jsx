import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function MyRehab() {
  const [program, setProgram] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [logging, setLogging] = useState(false);
  const [sessionLog, setSessionLog] = useState({});
  const [painScore, setPainScore] = useState(3);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { loadProgram(); }, []);

  const loadProgram = async () => {
    try {
      const data = await api.get('/rehab/my-program');
      if (data.data) {
        setProgram(data.data);
        setExercises(data.data.exercises || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const toggleExercise = (exId) => {
    setSessionLog(prev => {
      const existing = prev[exId];
      if (existing) {
        const copy = { ...prev };
        delete copy[exId];
        return copy;
      }
      const ex = exercises.find(e => e.exercise_id === exId || e.id === exId);
      return { ...prev, [exId]: { exerciseId: exId, setsDone: ex?.sets || 3, repsDone: ex?.reps || 10, painScore: 0 } };
    });
  };

  const submitSession = async () => {
    if (Object.keys(sessionLog).length === 0) return;
    setLogging(true);
    try {
      await api.post('/rehab/sessions', {
        programId: program.id,
        exercisesCompleted: Object.values(sessionLog),
        overallPainScore: painScore,
        durationMinutes: Object.keys(sessionLog).length * 5
      });
      setSubmitted(true);
      setSessionLog({});
    } catch (err) { console.error(err); }
    finally { setLogging(false); }
  };

  if (loading) return <div className="text-center py-12 text-dark-400">Loading your program...</div>;

  if (!program) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🏋️</div>
        <h1 className="text-2xl font-bold text-white mb-2">Home Exercise Program</h1>
        <p className="text-dark-400">No active exercise program assigned yet.</p>
        <p className="text-dark-500 text-sm mt-1">Your provider will prescribe exercises as part of your recovery plan.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Session Logged!</h2>
        <p className="text-dark-400 mb-6">Great work! Keep up the consistency.</p>
        <button onClick={() => setSubmitted(false)} className="btn-primary">Back to Program</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{program.name || 'My Exercise Program'}</h1>
          <p className="text-dark-400 text-sm mt-1">
            {program.start_date && `Started ${new Date(program.start_date).toLocaleDateString()}`}
            {program.status && ` · ${program.status}`}
          </p>
        </div>
        <span className={`badge ${program.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-dark-700 text-dark-400'}`}>
          {program.status}
        </span>
      </div>

      {/* Exercise List */}
      <div className="space-y-3 mb-8">
        {exercises.map(ex => {
          const isChecked = !!sessionLog[ex.exercise_id || ex.id];
          return (
            <div
              key={ex.id}
              onClick={() => toggleExercise(ex.exercise_id || ex.id)}
              className={`card cursor-pointer transition-all ${isChecked ? 'border-green-500/50 bg-green-500/5' : 'hover:border-dark-500'}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${isChecked ? 'border-green-500 bg-green-500' : 'border-dark-500'}`}>
                  {isChecked && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold ${isChecked ? 'text-green-400' : 'text-white'}`}>
                    {ex.exercise_name || ex.name}
                  </h3>
                  <p className="text-dark-400 text-sm mt-1">{ex.instructions || ex.description}</p>
                  <div className="flex gap-4 mt-2 text-xs text-dark-400">
                    <span>{ex.sets || ex.sets_default} sets</span>
                    <span>{ex.reps || ex.reps_default} reps</span>
                    {(ex.hold_seconds || ex.hold_seconds_default) && <span>{ex.hold_seconds || ex.hold_seconds_default}s hold</span>}
                    <span className="capitalize">{ex.difficulty || 'moderate'}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Session Submit */}
      <div className="card">
        <h3 className="text-white font-semibold mb-4">Log Today's Session</h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-dark-300 mb-2">Overall Pain Level: {painScore}/10</label>
          <input type="range" min={0} max={10} value={painScore} onChange={e => setPainScore(parseInt(e.target.value))} className="w-full" />
          <div className="flex justify-between text-xs text-dark-500 mt-1">
            <span>No pain</span><span>Moderate</span><span>Worst</span>
          </div>
        </div>
        <button
          onClick={submitSession}
          disabled={logging || Object.keys(sessionLog).length === 0}
          className="btn-primary w-full"
        >
          {logging ? 'Logging...' : `Log Session (${Object.keys(sessionLog).length} exercises)`}
        </button>
      </div>
    </div>
  );
}
