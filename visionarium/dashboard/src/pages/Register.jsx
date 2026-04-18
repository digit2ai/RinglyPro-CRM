import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../api';

export default function Register({ lang }) {
  const [form, setForm] = useState({ email:'', password:'', first_name:'', last_name:'', age:'', country:'', city:'', language_pref: lang || 'en', phone:'', school_or_university:'', field_of_interest:'', geo_detected_country:'', geo_detected_city:'' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('https://ipapi.co/json/').then(r => r.json()).then(geo => {
      setForm(f => ({...f, geo_detected_country: geo.country_name || '', geo_detected_city: geo.city || '', country: f.country || geo.country_name || '', city: f.city || geo.city || '' }));
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await auth.register({ ...form, age: form.age ? parseInt(form.age) : null, registration_source: 'web' });
      if (data.token) {
        localStorage.setItem('visionarium_token', data.token);
        localStorage.setItem('visionarium_user', JSON.stringify(data.user));
        navigate('/fellow');
      }
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const set = (k) => (e) => setForm(f => ({...f, [k]: e.target.value}));

  const isES = lang === 'es';

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="glass-card w-full max-w-lg">
        <div className="flex justify-center mb-6">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69dfd39cfcac588c6b2329f9.png" alt="Visionarium" className="h-24" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 text-center">{isES ? 'Registro - Comunidad Abierta' : 'Register - Open Community'}</h1>
        <p className="text-white/50 text-sm mb-6 text-center">{isES ? 'Gratis. Sin aplicacion. Sin limite.' : 'Free. No application. No cap.'}</p>
        {error && <div className="bg-coral/20 border border-coral text-coral px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder={isES ? 'Nombre' : 'First Name'} value={form.first_name} onChange={set('first_name')} className="input-field" required />
            <input placeholder={isES ? 'Apellido' : 'Last Name'} value={form.last_name} onChange={set('last_name')} className="input-field" required />
          </div>
          <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className="input-field" required />
          <input type="password" placeholder={isES ? 'Contrasena' : 'Password'} value={form.password} onChange={set('password')} className="input-field" required minLength={6} />
          <div className="grid grid-cols-3 gap-4">
            <input type="number" placeholder={isES ? 'Edad' : 'Age'} value={form.age} onChange={set('age')} className="input-field" min={14} max={30} />
            <input placeholder={isES ? 'Pais' : 'Country'} value={form.country} onChange={set('country')} className="input-field" />
            <input placeholder={isES ? 'Ciudad' : 'City'} value={form.city} onChange={set('city')} className="input-field" />
          </div>
          <input placeholder={isES ? 'Telefono' : 'Phone'} value={form.phone} onChange={set('phone')} className="input-field" />
          <input placeholder={isES ? 'Escuela / Universidad' : 'School / University'} value={form.school_or_university} onChange={set('school_or_university')} className="input-field" />
          <input placeholder={isES ? 'Area de interes' : 'Field of Interest'} value={form.field_of_interest} onChange={set('field_of_interest')} className="input-field" />
          <select value={form.language_pref} onChange={set('language_pref')} className="input-field">
            <option value="en">English</option>
            <option value="es">Espanol</option>
          </select>
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? '...' : isES ? 'Registrarse' : 'Register'}</button>
        </form>
        <p className="text-white/40 text-sm mt-4 text-center">
          {isES ? 'Ya tienes cuenta?' : 'Already registered?'} <Link to="/login" className="text-teal-neon hover:underline">{isES ? 'Iniciar sesion' : 'Login'}</Link>
        </p>
      </div>
    </div>
  );
}
