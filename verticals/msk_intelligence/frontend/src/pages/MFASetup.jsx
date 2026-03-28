import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function MFASetup() {
  const navigate = useNavigate();
  const user = api.getUser();
  const [step, setStep] = useState('start'); // start | scan | verify | done | disable
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const startSetup = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/auth/mfa/setup', {});
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep('scan');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifySetup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/auth/mfa/verify-setup', { code });
      setBackupCodes(data.backupCodes);
      // Update local user state
      const u = api.getUser();
      if (u) {
        u.mfaEnabled = true;
        localStorage.setItem('msk_user', JSON.stringify(u));
      }
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const disableMfa = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/mfa/disable', { code });
      const u = api.getUser();
      if (u) {
        u.mfaEnabled = false;
        localStorage.setItem('msk_user', JSON.stringify(u));
      }
      setStep('start');
      setCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const mfaEnabled = user?.mfaEnabled;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Two-Factor Authentication</h1>
      <p className="text-dark-400 mb-8">
        Add an extra layer of security to your account using an authenticator app.
      </p>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-6">{error}</div>
      )}

      {/* Start / Status */}
      {step === 'start' && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-white font-semibold">MFA Status</h3>
              <p className={`text-sm mt-1 ${mfaEnabled ? 'text-green-400' : 'text-yellow-400'}`}>
                {mfaEnabled ? 'Enabled' : 'Not enabled'}
              </p>
            </div>
            <div className={`w-3 h-3 rounded-full ${mfaEnabled ? 'bg-green-500' : 'bg-yellow-500'}`} />
          </div>

          {mfaEnabled ? (
            <div>
              <p className="text-dark-400 text-sm mb-4">
                MFA is active on your account. You can disable it by entering a current code.
              </p>
              <button onClick={() => setStep('disable')} className="btn-secondary w-full">
                Disable MFA
              </button>
            </div>
          ) : (
            <div>
              <p className="text-dark-400 text-sm mb-4">
                {['radiologist', 'admin', 'staff', 'b2b_manager'].includes(user?.role)
                  ? 'MFA is recommended for your role. Set it up now to secure your account.'
                  : 'Protect your medical data with two-factor authentication.'}
              </p>
              <button onClick={startSetup} disabled={loading} className="btn-primary w-full">
                {loading ? 'Setting up...' : 'Set Up MFA'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scan QR */}
      {step === 'scan' && (
        <div className="card">
          <h3 className="text-white font-semibold mb-4">1. Scan QR Code</h3>
          <p className="text-dark-400 text-sm mb-4">
            Scan this code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
          </p>
          <div className="bg-white rounded-xl p-4 w-fit mx-auto mb-6">
            <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
          </div>
          <details className="mb-6">
            <summary className="text-dark-400 text-xs cursor-pointer hover:text-dark-300">
              Can't scan? Enter manual key
            </summary>
            <code className="block mt-2 p-3 bg-dark-800 rounded-lg text-msk-400 text-sm font-mono break-all">
              {secret}
            </code>
          </details>

          <h3 className="text-white font-semibold mb-4">2. Enter Verification Code</h3>
          <form onSubmit={verifySetup} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="input-field text-center text-2xl tracking-widest font-mono"
              placeholder="000000"
              maxLength={6}
              autoFocus
              required
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep('start')} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Done — show backup codes */}
      {step === 'done' && (
        <div className="card">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">MFA Enabled</h3>
            <p className="text-dark-400 text-sm mt-2">Your account is now protected with two-factor authentication.</p>
          </div>

          <div className="bg-dark-800 rounded-lg p-4 mb-6">
            <h4 className="text-white font-semibold text-sm mb-3">Backup Codes</h4>
            <p className="text-dark-400 text-xs mb-3">
              Save these codes in a safe place. Each can be used once if you lose access to your authenticator.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((c, i) => (
                <code key={i} className="bg-dark-900 rounded px-3 py-2 text-msk-400 font-mono text-sm text-center">
                  {c}
                </code>
              ))}
            </div>
          </div>

          <button onClick={() => navigate('/dashboard')} className="btn-primary w-full">
            Done
          </button>
        </div>
      )}

      {/* Disable */}
      {step === 'disable' && (
        <div className="card">
          <h3 className="text-white font-semibold mb-4">Disable MFA</h3>
          <p className="text-dark-400 text-sm mb-4">
            Enter a current authenticator code to disable MFA.
          </p>
          <form onSubmit={disableMfa} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="input-field text-center text-2xl tracking-widest font-mono"
              placeholder="000000"
              maxLength={6}
              autoFocus
              required
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => { setStep('start'); setCode(''); }} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 !bg-red-600 hover:!bg-red-500">
                {loading ? 'Disabling...' : 'Disable MFA'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
