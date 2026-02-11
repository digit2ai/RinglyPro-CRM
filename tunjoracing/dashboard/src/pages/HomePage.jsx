import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Calendar, Mail, Phone } from 'lucide-react';

export default function HomePage() {
  const [upcomingRaces, setUpcomingRaces] = useState([]);
  const [email, setEmail] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', company: '', message: '' });

  useEffect(() => {
    fetch('/tunjoracing/api/v1/races?limit=5')
      .then(res => res.json())
      .then(data => {
        if (data.success) setUpcomingRaces(data.data);
      })
      .catch(console.error);
  }, []);

  const handleFanSignup = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/tunjoracing/api/v1/fans/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Welcome to the TunjoRacing fan community!');
        setEmail('');
      } else {
        alert(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) { console.error(err); }
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/tunjoracing/api/v1/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: formData.company,
          contact_name: formData.name,
          email: formData.email,
          message: formData.message
        })
      });
      if (res.ok) {
        alert('Thank you! Our team will contact you soon.');
        setFormData({ name: '', email: '', company: '', message: '' });
      }
    } catch (err) { console.error(err); }
  };

  const stats = [
    { num: '50+', label: 'Career Wins & Podiums' },
    { num: '15+', label: 'Pro Seasons' },
    { num: '540M', label: 'Global Viewers' },
    { num: '156', label: 'Countries Reached' },
  ];

  const benefits = [
    {
      title: 'International Brand Visibility',
      items: ['Logo on racing suit and helmet', 'Logo on team apparel', 'Digital content and media assets', 'Exposure at major racing circuits']
    },
    {
      title: 'Digital & Social Media Exposure',
      items: ['Branded content on Instagram, Facebook, LinkedIn', 'Race-week training and preparation content', 'Behind-the-scenes access', 'Bilingual reach (English & Spanish)']
    },
    {
      title: 'Content for Marketing',
      items: ['Professional photo & video assets', 'Training sessions and race footage', 'Brand integration in posts & stories', 'VIP hospitality opportunities']
    }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-16">
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(90deg, rgba(0,0,0,.9) 0%, rgba(0,0,0,.7) 40%, rgba(0,0,0,.3) 100%), url("https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/696cf718439b6bf938457268.png") center/cover no-repeat'
        }} />

        <div className="container mx-auto relative z-10 py-16 px-4 md:px-8">
          <div className="max-w-2xl ml-0">
            <div className="p-6 rounded-2xl" style={{ backgroundColor: 'rgba(0,0,0,.85)', border: '1px solid #333', boxShadow: '0 24px 80px rgba(0,0,0,.7)' }}>
              <span className="pill">2025 Sponsorship & Partnership Program</span>

              <h1 className="text-4xl md:text-5xl font-bold mt-4 mb-4 leading-tight">
                Accelerate Your Brand with{' '}
                <span style={{ color: '#e31837', textDecoration: 'underline', textUnderlineOffset: '6px' }}>TUNJO RACING</span>
              </h1>

              <p style={{ color: '#666' }} className="text-lg mb-6">
                Through passion, performance, and global visibility at every race, your company will connect with motorsport fans worldwide.
              </p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="proof-item"><span className="proof-kpi">50+</span><span className="proof-label">Wins & Podiums</span></div>
                <div className="proof-item"><span className="proof-kpi">15+</span><span className="proof-label">Pro Seasons</span></div>
                <div className="proof-item"><span className="proof-kpi">540M</span><span className="proof-label">Global Viewers</span></div>
              </div>

              <div className="flex flex-wrap gap-3">
                <a href="#contact" className="btn">Become a Partner</a>
                <Link to="/store" className="btn btn-ghost">Shop Merchandise</Link>
              </div>

              <p className="text-xs mt-4" style={{ color: '#555' }}>Media kit + deliverables available upon request.</p>

              {/* Fan Signup - Inline in Hero */}
              <div className="mt-6 pt-6" style={{ borderTop: '1px solid #333' }}>
                <h3 className="text-white font-bold mb-2">Join the Fan Community</h3>
                <p style={{ color: '#888' }} className="text-sm mb-3">Get race updates, exclusive content, and shop discounts.</p>
                <form onSubmit={handleFanSignup} className="flex gap-2 mb-4">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="flex-1 px-4 py-3 rounded-full text-white text-sm"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  />
                  <button type="submit" className="btn">Subscribe</button>
                </form>
                <ul className="grid grid-cols-2 gap-2 text-sm" style={{ color: '#888' }}>
                  <li className="flex items-center gap-2">
                    <span style={{ color: '#e31837' }}>✓</span> Basic email newsletter
                  </li>
                  <li className="flex items-center gap-2">
                    <span style={{ color: '#e31837' }}>✓</span> 10% discount on merchandise
                  </li>
                  <li className="flex items-center gap-2">
                    <span style={{ color: '#e31837' }}>✓</span> Exclusive behind-the-scenes
                  </li>
                  <li className="flex items-center gap-2">
                    <span style={{ color: '#e31837' }}>✓</span> Direct Q&A with driver
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="section" style={{ backgroundColor: '#111', borderTop: '1px solid #333', borderBottom: '1px solid #333' }}>
        <div className="container mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Live Race Broadcast Metrics</h2>
            <p style={{ color: '#888' }}>Global reach across 156 countries through TV, broadcast, and streaming platforms.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <div key={i} className="stat"><div className="stat-num">{stat.num}</div><div className="stat-label">{stat.label}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="section">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div>
              <h2 className="text-3xl font-bold mb-4">About TunjoRacing</h2>
              <p style={{ color: '#888' }} className="mb-4">TunjoRacing represents professional international motorsport at the highest level. With years of experience competing across multiple racing series and countries, we bring passion, precision, and performance to every race.</p>
              <p style={{ color: '#888' }} className="mb-6">At the heart of our racing program are three core values: <strong className="text-white">performance, dedication, and passion</strong>.</p>
              <ul className="space-y-2 mb-6" style={{ color: '#888' }}>
                <li className="flex items-start gap-2"><span style={{ color: '#e31837' }}>•</span><span><strong className="text-white">2024:</strong> Multiple podium finishes across European circuits</span></li>
                <li className="flex items-start gap-2"><span style={{ color: '#e31837' }}>•</span><span><strong className="text-white">Series:</strong> Formula 4 Spain Championship</span></li>
                <li className="flex items-start gap-2"><span style={{ color: '#e31837' }}>•</span><span><strong className="text-white">Car:</strong> Formula 4 Single-Seater</span></li>
              </ul>
            </div>
            <div className="card">
              <img src="https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800" alt="Racing" className="rounded-xl mb-4" style={{ width: '100%', height: '300px', objectFit: 'cover' }} />
              <p style={{ color: '#888' }} className="text-sm">TunjoRacing • Professional Motorsport • Excellence in Racing</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="section" style={{ backgroundColor: '#111', borderTop: '1px solid #333', borderBottom: '1px solid #333' }}>
        <div className="container mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Partner Benefits</h2>
            <p style={{ color: '#888' }}>Comprehensive sponsorship deliverables across visibility, content, and experiences.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {benefits.map((benefit, i) => (
              <div key={i} className="card">
                <h3 className="text-lg font-bold mb-3">{benefit.title}</h3>
                <ul className="checklist">{benefit.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="cta-band mt-8">
            <div>
              <h3 className="font-bold mb-1">Ready to Accelerate Your Brand?</h3>
              <p style={{ color: '#888' }} className="text-sm">Custom sponsorship packages available. Contact us today.</p>
            </div>
            <a href="#contact" className="btn">Request Media Kit</a>
          </div>
        </div>
      </section>

      {/* Race Calendar */}
      <section id="calendar" className="section">
        <div className="container mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">2025 Race Calendar</h2>
            <p style={{ color: '#888' }}>Follow our championship journey across premier racing circuits.</p>
          </div>
          {upcomingRaces.length > 0 ? (
            <div className="card overflow-hidden p-0">
              <div className="grid grid-cols-4 gap-3 p-4 text-sm font-bold" style={{ background: '#1a1a1a', color: '#e31837', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <span>Date</span><span>Event</span><span>Track</span><span>Location</span>
              </div>
              {upcomingRaces.map((race, i) => (
                <div key={i} className="grid grid-cols-4 gap-3 p-4 border-t border-[#333]" style={{ color: '#888' }}>
                  <span className="text-white font-medium">{new Date(race.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>{race.name}</span><span>{race.track_name}</span><span>{race.city}, {race.country}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <Calendar className="h-12 w-12 mx-auto mb-4" style={{ color: '#888' }} />
              <p style={{ color: '#888' }}>Race calendar coming soon</p>
            </div>
          )}
          <div className="text-center mt-6"><Link to="/schedule" className="btn btn-ghost">View Full Schedule</Link></div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="section" style={{ backgroundColor: '#111', borderTop: '1px solid #333', borderBottom: '1px solid #333' }}>
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-3xl font-bold mb-4">Become a Partner</h2>
              <p style={{ color: '#888' }} className="mb-6">Join the TunjoRacing family and connect your brand with the excitement of professional motorsport.</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="card"><Mail className="h-6 w-6 mb-2" style={{ color: '#e31837' }} /><p className="text-sm font-bold">Email</p><p style={{ color: '#888' }} className="text-sm">sponsors@tunjoracing.com</p></div>
                <div className="card"><Phone className="h-6 w-6 mb-2" style={{ color: '#e31837' }} /><p className="text-sm font-bold">Phone</p><p style={{ color: '#888' }} className="text-sm">Contact via form</p></div>
              </div>
              <div className="flex gap-3">
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-sm">Instagram</a>
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-sm">Facebook</a>
              </div>
            </div>
            <div className="card">
              <h3 className="font-bold mb-4">Contact Us</h3>
              <form onSubmit={handleContactSubmit}>
                <div className="mb-4"><label className="block text-sm mb-2" style={{ color: '#ccc' }}>Name *</label><input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Your name" /></div>
                <div className="mb-4"><label className="block text-sm mb-2" style={{ color: '#ccc' }}>Email *</label><input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="your@email.com" /></div>
                <div className="mb-4"><label className="block text-sm mb-2" style={{ color: '#ccc' }}>Company</label><input type="text" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} placeholder="Your company" /></div>
                <div className="mb-4"><label className="block text-sm mb-2" style={{ color: '#ccc' }}>Message *</label><textarea required rows="4" value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} placeholder="Tell us about your partnership interests..." /></div>
                <button type="submit" className="btn w-full">Send Message</button>
              </form>
            </div>
          </div>
        </div>
      </section>


      <Footer />
    </div>
  );
}
