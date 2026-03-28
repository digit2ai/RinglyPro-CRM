import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

export default function ScheduleAppointment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadProviders(); }, []);
  useEffect(() => {
    if (selectedProvider && selectedDate) loadSlots();
  }, [selectedProvider, selectedDate]);

  const loadProviders = async () => {
    try {
      const data = await api.get('/admin/users?role=radiologist&limit=50');
      setProviders(data.data || []);
      if (data.data?.length > 0) setSelectedProvider(data.data[0].id);
    } catch (err) { console.error(err); }
  };

  const loadSlots = async () => {
    setSlotsLoading(true);
    try {
      const data = await api.get(`/scheduling/availability/${selectedProvider}?date=${selectedDate}`);
      setSlots(data.data || []);
    } catch (err) { setSlots([]); }
    finally { setSlotsLoading(false); }
  };

  const bookAppointment = async () => {
    if (!selectedSlot || !caseId) return setError('Please select a time slot');
    setLoading(true);
    setError('');
    try {
      const user = api.getUser();
      await api.post('/scheduling/book', {
        caseId: parseInt(caseId),
        patientId: user.id,
        providerId: parseInt(selectedProvider),
        scheduledAt: selectedSlot,
        durationMinutes: 30
      });
      navigate(`/cases/${caseId}`);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Schedule Consultation</h1>
      <p className="text-dark-400 mb-8">Book a video consultation with a specialist</p>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-6">{error}</div>}

      <div className="card space-y-6">
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Specialist</label>
          <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="input-field">
            {providers.map(p => (
              <option key={p.id} value={p.id}>Dr. {p.first_name} {p.last_name} — {p.specialty || 'MSK Radiology'}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Date</label>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} min={today} className="input-field" />
        </div>

        {selectedDate && (
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Available Time Slots</label>
            {slotsLoading ? (
              <p className="text-dark-400 text-sm">Loading slots...</p>
            ) : slots.length === 0 ? (
              <p className="text-dark-400 text-sm">No available slots on this date. Try another day.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      selectedSlot === slot
                        ? 'bg-msk-600 text-white ring-2 ring-msk-400'
                        : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                    }`}
                  >
                    {new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={bookAppointment} disabled={loading || !selectedSlot} className="btn-primary w-full">
          {loading ? 'Booking...' : 'Confirm Appointment'}
        </button>
      </div>
    </div>
  );
}
