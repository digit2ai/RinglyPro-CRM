import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShoppingBag, Mail, Video, Calendar, LogOut, Star, Percent, Play, MessageCircle, Trophy, Heart } from 'lucide-react';

export default function FanDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [fanInfo, setFanInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tunjo_fan_token');
    const info = localStorage.getItem('tunjo_fan_info');

    if (!token) {
      navigate('/fan/login');
      return;
    }

    if (info) {
      setFanInfo(JSON.parse(info));
    }

    fetch('/tunjoracing/api/v1/fans/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDashboard(data.data);
        } else {
          navigate('/fan/login');
        }
        setLoading(false);
      })
      .catch(() => {
        navigate('/fan/login');
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('tunjo_fan_token');
    localStorage.removeItem('tunjo_fan_info');
    navigate('/fan/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const fan = dashboard?.fan || fanInfo || {};
  const benefits = dashboard?.benefits || {};
  const exclusiveContent = dashboard?.exclusive_content || [];
  const upcomingRaces = dashboard?.upcoming_races || [];
  const featuredProducts = dashboard?.featured_products || [];

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <a href="https://tunjoracing.com" className="font-racing font-bold text-xl">
              <span className="gradient-text">TUNJO</span>
              <span className="text-white">RACING</span>
            </a>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">Fan Community</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">Welcome, {fan.first_name || 'Fan'}!</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-red-900/50 to-slate-900/50 rounded-lg p-6 mb-8 border border-red-500/30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Welcome to the Fan Community, {fan.first_name || 'Racing Fan'}!
              </h1>
              <p className="text-slate-300 flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                {fan.membership_tier?.charAt(0).toUpperCase() + fan.membership_tier?.slice(1) || 'Free'} Member
              </p>
            </div>
            <div className="text-right">
              <div className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-lg">
                {benefits.discount_percent || 10}% OFF
              </div>
              <p className="text-slate-400 text-sm mt-1">Your member discount</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Link to="/store" className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-red-500 transition-colors group">
            <ShoppingBag className="h-8 w-8 text-red-500 mb-2 group-hover:scale-110 transition-transform" />
            <h3 className="text-white font-semibold">Shop Store</h3>
            <p className="text-slate-400 text-sm">{benefits.discount_percent}% member discount</p>
          </Link>
          <Link to="/schedule" className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-red-500 transition-colors group">
            <Calendar className="h-8 w-8 text-red-500 mb-2 group-hover:scale-110 transition-transform" />
            <h3 className="text-white font-semibold">Race Schedule</h3>
            <p className="text-slate-400 text-sm">Upcoming events</p>
          </Link>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-red-500 transition-colors group cursor-pointer">
            <Video className="h-8 w-8 text-red-500 mb-2 group-hover:scale-110 transition-transform" />
            <h3 className="text-white font-semibold">Exclusive Content</h3>
            <p className="text-slate-400 text-sm">Behind-the-scenes</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-red-500 transition-colors group cursor-pointer">
            <MessageCircle className="h-8 w-8 text-red-500 mb-2 group-hover:scale-110 transition-transform" />
            <h3 className="text-white font-semibold">Driver Q&A</h3>
            <p className="text-slate-400 text-sm">Ask Oscar</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Exclusive Content */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Video className="h-5 w-5 text-red-500" />
                  Exclusive Content
                </h2>
                <span className="text-xs bg-red-600 text-white px-2 py-1 rounded">MEMBERS ONLY</span>
              </div>

              {exclusiveContent.length > 0 ? (
                <div className="grid md:grid-cols-3 gap-4">
                  {exclusiveContent.map((content) => (
                    <div key={content.id} className="group cursor-pointer">
                      <div className="relative rounded-lg overflow-hidden mb-2">
                        <img
                          src={content.thumbnail}
                          alt={content.title}
                          className="w-full aspect-video object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="h-12 w-12 text-white" />
                        </div>
                        <span className="absolute top-2 right-2 text-xs bg-black/70 text-white px-2 py-1 rounded">
                          {content.type}
                        </span>
                      </div>
                      <h3 className="text-white font-medium text-sm">{content.title}</h3>
                      <p className="text-slate-500 text-xs mt-1 line-clamp-2">{content.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Video className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>New exclusive content coming soon!</p>
                </div>
              )}
            </div>

            {/* Featured Products */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-red-500" />
                  Featured Merchandise
                </h2>
                <Link to="/store" className="text-red-400 text-sm hover:text-red-300">View All</Link>
              </div>

              {featuredProducts.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {featuredProducts.map((product) => (
                    <Link
                      key={product.id}
                      to={`/store/product/${product.slug}`}
                      className="group"
                    >
                      <div className="relative rounded-lg overflow-hidden mb-2 bg-slate-900">
                        <img
                          src={product.images?.[0] || 'https://via.placeholder.com/200'}
                          alt={product.name}
                          className="w-full aspect-square object-cover group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute top-2 left-2 text-xs bg-red-600 text-white px-2 py-1 rounded font-bold">
                          {benefits.discount_percent}% OFF
                        </span>
                      </div>
                      <h3 className="text-white text-sm font-medium truncate">{product.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-red-500 font-bold">
                          ${(product.price * (1 - benefits.discount_percent / 100)).toFixed(2)}
                        </span>
                        <span className="text-slate-500 text-sm line-through">${product.price}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Visit our store for exclusive merchandise!</p>
                  <Link to="/store" className="inline-block mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                    Browse Store
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Member Benefits */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Your Benefits
              </h2>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <Percent className="h-5 w-5 text-green-500" />
                  <span className="text-slate-300">{benefits.discount_percent}% store discount</span>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-blue-500" />
                  <span className="text-slate-300">Newsletter access</span>
                </li>
                <li className="flex items-center gap-3">
                  <Video className="h-5 w-5 text-purple-500" />
                  <span className="text-slate-300">Behind-the-scenes</span>
                </li>
                <li className="flex items-center gap-3">
                  <MessageCircle className={`h-5 w-5 ${benefits.driver_qa_access ? 'text-red-500' : 'text-slate-600'}`} />
                  <span className={benefits.driver_qa_access ? 'text-slate-300' : 'text-slate-500'}>
                    Driver Q&A {!benefits.driver_qa_access && '(Premium)'}
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <Star className={`h-5 w-5 ${benefits.vip_experiences ? 'text-yellow-500' : 'text-slate-600'}`} />
                  <span className={benefits.vip_experiences ? 'text-slate-300' : 'text-slate-500'}>
                    VIP Experiences {!benefits.vip_experiences && '(VIP)'}
                  </span>
                </li>
              </ul>

              {fan.membership_tier === 'free' && (
                <button className="w-full mt-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-semibold rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-colors">
                  Upgrade to Premium
                </button>
              )}
            </div>

            {/* Upcoming Races */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-red-500" />
                Upcoming Races
              </h2>

              {upcomingRaces.length > 0 ? (
                <div className="space-y-3">
                  {upcomingRaces.map((race) => (
                    <div key={race.id} className="p-3 bg-slate-900/50 rounded-lg">
                      <p className="text-white font-medium">{race.circuit}</p>
                      <p className="text-slate-400 text-sm">{race.series}</p>
                      <p className="text-red-400 text-sm">
                        {new Date(race.race_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Check back for race updates!</p>
                </div>
              )}

              <Link
                to="/schedule"
                className="block text-center text-red-400 text-sm mt-4 hover:text-red-300"
              >
                View Full Schedule
              </Link>
            </div>

            {/* Social Links */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                Follow Oscar
              </h2>
              <div className="flex gap-3">
                <a
                  href="https://www.instagram.com/oscartunjo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-center rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                >
                  Instagram
                </a>
                <a
                  href="https://www.facebook.com/OscarAndresTunjo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Facebook
                </a>
                <a
                  href="https://x.com/oscartunjo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 bg-slate-700 text-white text-center rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium"
                >
                  X
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
