import React, { useState } from 'react';
import { Link } from 'react-router-dom';
const mskLogo = 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69d97bc215a505b6793950c0.png';

export default function MFAChallenge({ tempToken, onSuccess, onCancel }) {
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = useBackup
        ? '/msk/api/v1/auth/mfa/backup'
        : '/msk/api/v1/auth/mfa/challenge';

      const body = useBackup
        ? { tempToken, backupCode: code }
        : { tempToken, code };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-5 mb-6">
            <img src={mskLogo} alt="Digit2AI" className="h-24 w-auto object-contain drop-shadow-2xl" />
            <div className="text-left ml-1">
              <h1 className="text-2xl font-bold text-white">ImagingMind</h1>
              <p className="text-sm text-msk-400">Diagnostics Platform</p>
            </div>
          </Link>
          <h2 className="text-2xl font-bold text-white">Two-Factor Authentication</h2>
          <p className="text-dark-400 mt-2">
            {useBackup
              ? 'Enter one of your backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                {useBackup ? 'Backup Code' : 'Authentication Code'}
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="input-field text-center text-2xl tracking-widest font-mono"
                placeholder={useBackup ? 'XXXXXXXX' : '000000'}
                maxLength={useBackup ? 8 : 6}
                autoFocus
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          <div className="mt-6 flex justify-between items-center">
            <button
              onClick={() => { setUseBackup(!useBackup); setCode(''); setError(''); }}
              className="text-msk-400 hover:text-msk-300 text-sm font-medium"
            >
              {useBackup ? 'Use authenticator app' : 'Use backup code'}
            </button>
            <button
              onClick={onCancel}
              className="text-dark-400 hover:text-dark-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
