import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

export default function CreateHEP() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');
  const patientId = searchParams.get('patientId');
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [programName, setProgramName] = useState('Recovery Program');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadExercises(); }, []);

  const loadExercises = async () => {
    try {
      const data = await api.get('/rehab/exercises');
      setExerciseLibrary(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const addExercise = (ex) => {
    if (selectedExercises.find(s => s.exerciseId === ex.id)) return;
    setSelectedExercises(prev => [...prev, {
      exerciseId: ex.id,
      name: ex.name,
      sets: ex.sets_default,
      reps: ex.reps_default,
      holdSeconds: ex.hold_seconds_default,
      frequencyPerWeek: ex.frequency_per_week,
      notes: '',
      sortOrder: prev.length + 1
    }]);
  };

  const removeExercise = (idx) => {
    setSelectedExercises(prev => prev.filter((_, i) => i !== idx));
  };

  const updateExercise = (idx, field, value) => {
    setSelectedExercises(prev => prev.map((ex, i) => i === idx ? { ...ex, [field]: value } : ex));
  };

  const saveProgram = async () => {
    if (selectedExercises.length === 0) return setError('Add at least one exercise');
    if (!caseId || !patientId) return setError('Case and patient ID required');
    setSaving(true);
    setError('');
    try {
      await api.post('/rehab/programs', {
        caseId: parseInt(caseId),
        patientId: parseInt(patientId),
        name: programName,
        startDate,
        endDate: endDate || null,
        exercises: selectedExercises
      });
      navigate(`/cases/${caseId}`);
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  };

  const filtered = exerciseLibrary.filter(ex =>
    !filter || ex.body_region === filter || ex.category === filter
  );

  const regions = [...new Set(exerciseLibrary.map(e => e.body_region).filter(Boolean))];

  if (loading) return <div className="text-center py-12 text-dark-400">Loading exercise library...</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Create Exercise Program</h1>
      <p className="text-dark-400 mb-6">Prescribe a home exercise program for your patient</p>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-6">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Exercise Library */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Exercise Library</h2>
            <select value={filter} onChange={e => setFilter(e.target.value)} className="input-field w-auto text-sm">
              <option value="">All Regions</option>
              {regions.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filtered.map(ex => (
              <div key={ex.id} className="card hover:border-msk-500/50 cursor-pointer transition-all py-3" onClick={() => addExercise(ex)}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium text-sm">{ex.name}</p>
                    <p className="text-dark-400 text-xs">{ex.body_region} · {ex.category} · {ex.difficulty}</p>
                  </div>
                  <span className="text-msk-400 text-xl">+</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prescription */}
        <div>
          <h2 className="text-white font-semibold mb-4">Prescription ({selectedExercises.length})</h2>

          <div className="card mb-4 space-y-3">
            <input type="text" value={programName} onChange={e => setProgramName(e.target.value)} className="input-field" placeholder="Program name" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-dark-400 mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs text-dark-400 mb-1">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field" />
              </div>
            </div>
          </div>

          {selectedExercises.length === 0 ? (
            <div className="card text-center py-8 text-dark-400 text-sm">
              Click exercises from the library to add them
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {selectedExercises.map((ex, idx) => (
                <div key={idx} className="card py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white font-medium text-sm">{ex.name}</p>
                    <button onClick={() => removeExercise(idx)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-dark-500">Sets</label>
                      <input type="number" value={ex.sets} onChange={e => updateExercise(idx, 'sets', parseInt(e.target.value))} className="input-field text-sm py-1" min={1} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-dark-500">Reps</label>
                      <input type="number" value={ex.reps} onChange={e => updateExercise(idx, 'reps', parseInt(e.target.value))} className="input-field text-sm py-1" min={1} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-dark-500">Freq/wk</label>
                      <input type="number" value={ex.frequencyPerWeek} onChange={e => updateExercise(idx, 'frequencyPerWeek', parseInt(e.target.value))} className="input-field text-sm py-1" min={1} max={7} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={saveProgram} disabled={saving || selectedExercises.length === 0} className="btn-primary w-full mt-4">
            {saving ? 'Saving...' : 'Save Exercise Program'}
          </button>
        </div>
      </div>
    </div>
  );
}
