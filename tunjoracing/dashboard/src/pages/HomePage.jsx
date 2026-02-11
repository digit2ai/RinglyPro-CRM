import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Trophy, Users, Globe, ChevronRight, Calendar, Zap, Target } from 'lucide-react';

export default function HomePage() {
  const [upcomingRaces, setUpcomingRaces] = useState([]);

  useEffect(() => {
    fetch('/tunjoracing/api/v1/races/upcoming?limit=3')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setUpcomingRaces(data.data);
        }
      })
      .catch(console.error);
  }, []);

  const stats = [
    { icon: Trophy, value: '15+', label: 'Podium Finishes' },
    { icon: Globe, value: '8', label: 'Countries Raced' },
    { icon: Users, value: '50K+', label: 'Social Followers' },
    { icon: Target, value: '3M+', label: 'Media Impressions' },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-900"></div>
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-transparent to-transparent"></div>
        </div>

        <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-racing font-bold mb-6">
            <span className="gradient-text">TUNJO</span>
            <span className="text-white">RACING</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 mb-8 max-w-3xl mx-auto">
            Professional International Motorsport. Pushing limits on tracks around the world.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/sponsorship" className="btn-gold inline-flex items-center justify-center">
              Become a Partner
              <ChevronRight className="ml-2 h-5 w-5" />
            </Link>
            <Link to="/store" className="btn-primary inline-flex items-center justify-center">
              Shop Merchandise
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-slate-400 rounded-full flex items-start justify-center p-1">
            <div className="w-1.5 h-3 bg-amber-400 rounded-full"></div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <stat.icon className="h-8 w-8 text-amber-400 mx-auto mb-4" />
                <div className="text-3xl md:text-4xl font-racing font-bold text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-slate-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-racing font-bold text-white mb-6">
                Racing Toward <span className="gradient-text">Excellence</span>
              </h2>
              <p className="text-slate-300 mb-6 leading-relaxed">
                TunjoRacing represents the pinnacle of determination and skill in international motorsport.
                With a proven track record of success across multiple racing series and countries,
                we bring passion, precision, and performance to every race.
              </p>
              <p className="text-slate-300 mb-8 leading-relaxed">
                Our mission is to compete at the highest level while building meaningful partnerships
                that deliver exceptional value and visibility for our sponsors.
              </p>
              <Link to="/sponsorship" className="text-amber-400 hover:text-amber-300 font-medium inline-flex items-center">
                Learn About Sponsorship
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
            <div className="relative">
              <div className="aspect-video bg-slate-800 rounded-lg overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <Zap className="h-16 w-16 text-amber-400 mx-auto mb-4" />
                    <p className="text-slate-400">Racing Highlights</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Races */}
      <section className="py-20 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-racing font-bold text-white mb-2">
                Upcoming <span className="gradient-text">Races</span>
              </h2>
              <p className="text-slate-400">Follow our journey around the world</p>
            </div>
            <Link to="/schedule" className="text-amber-400 hover:text-amber-300 font-medium inline-flex items-center">
              View Full Schedule
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {upcomingRaces.length > 0 ? upcomingRaces.map((race, i) => (
              <div key={race.id} className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 card-hover">
                <div className="flex items-center space-x-2 text-amber-400 text-sm mb-4">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(race.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{race.name}</h3>
                <p className="text-slate-400">{race.track_name}</p>
                <p className="text-slate-500 text-sm">{race.city}, {race.country}</p>
              </div>
            )) : (
              <>
                <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                  <div className="flex items-center space-x-2 text-amber-400 text-sm mb-4">
                    <Calendar className="h-4 w-4" />
                    <span>Mar 15, 2024</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Imola F4 Round 1</h3>
                  <p className="text-slate-400">Autodromo Enzo e Dino Ferrari</p>
                  <p className="text-slate-500 text-sm">Imola, Italy</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                  <div className="flex items-center space-x-2 text-amber-400 text-sm mb-4">
                    <Calendar className="h-4 w-4" />
                    <span>Apr 5, 2024</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Spa F4 Championship</h3>
                  <p className="text-slate-400">Circuit de Spa-Francorchamps</p>
                  <p className="text-slate-500 text-sm">Stavelot, Belgium</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                  <div className="flex items-center space-x-2 text-amber-400 text-sm mb-4">
                    <Calendar className="h-4 w-4" />
                    <span>May 10, 2024</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Monaco Historic</h3>
                  <p className="text-slate-400">Circuit de Monaco</p>
                  <p className="text-slate-500 text-sm">Monte Carlo, Monaco</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Fan Signup CTA */}
      <section className="py-20 bg-gradient-to-r from-red-900 to-amber-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-racing font-bold text-white mb-4">
            Join the TunjoRacing Community
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Get exclusive content, race updates, and special offers delivered to your inbox.
          </p>
          <FanSignupForm />
        </div>
      </section>

      {/* Sponsorship CTA */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-slate-800 to-slate-800/50 rounded-2xl p-8 md:p-12 border border-slate-700">
            <div className="md:flex items-center justify-between">
              <div className="mb-6 md:mb-0">
                <h2 className="text-2xl md:text-3xl font-racing font-bold text-white mb-2">
                  Partner With <span className="gradient-text">TunjoRacing</span>
                </h2>
                <p className="text-slate-300">
                  Reach millions of motorsport fans worldwide. Get measurable ROI.
                </p>
              </div>
              <Link to="/sponsorship" className="btn-gold inline-flex items-center whitespace-nowrap">
                Explore Sponsorship
                <ChevronRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FanSignupForm() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/tunjoracing/api/v1/fans/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, first_name: firstName, source: 'homepage' })
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      }
    } catch (error) {
      console.error('Signup error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-white/10 rounded-lg p-6 max-w-md mx-auto">
        <p className="text-white font-semibold">Welcome to the team! 🏎️</p>
        <p className="text-white/80 text-sm mt-2">Check your inbox for a welcome message.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
      <input
        type="text"
        placeholder="First Name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <input
        type="email"
        placeholder="Email Address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <button
        type="submit"
        disabled={loading}
        className="px-6 py-3 bg-white text-slate-900 font-semibold rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
      >
        {loading ? 'Joining...' : 'Join Now'}
      </button>
    </form>
  );
}
