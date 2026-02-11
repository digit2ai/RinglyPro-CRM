import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BarChart3, Eye, Heart, DollarSign, LogOut, Download, Calendar, Image, Video } from 'lucide-react';

export default function SponsorDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [sponsorInfo, setSponsorInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tunjo_sponsor_token');
    const info = localStorage.getItem('tunjo_sponsor_info');

    if (!token) {
      navigate('/sponsor/login');
      return;
    }

    if (info) {
      setSponsorInfo(JSON.parse(info));
    }

    fetch('/tunjoracing/api/v1/sponsors/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDashboard(data.data);
        } else {
          navigate('/sponsor/login');
        }
        setLoading(false);
      })
      .catch(() => {
        navigate('/sponsor/login');
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('tunjo_sponsor_token');
    localStorage.removeItem('tunjo_sponsor_info');
    navigate('/sponsor/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const metrics = dashboard?.metrics || {};
  const sponsor = dashboard?.sponsor || sponsorInfo || {};

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="font-racing font-bold text-xl">
              <span className="gradient-text">TUNJO</span>
              <span className="text-white">RACING</span>
            </Link>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">Sponsor Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">{sponsor.company_name}</span>
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

      <div className="p-6">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-amber-900/50 to-red-900/50 rounded-lg p-6 mb-8 border border-amber-500/30">
          <h1 className="text-2xl font-bold text-white mb-2">
            Welcome back, {sponsor.company_name}!
          </h1>
          <p className="text-slate-300">
            {sponsor.sponsorship_level?.charAt(0).toUpperCase() + sponsor.sponsorship_level?.slice(1)} Partner
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={Eye}
            title="Total Exposure"
            value={metrics.total_exposure?.toLocaleString() || '0'}
            color="blue"
          />
          <StatCard
            icon={Heart}
            title="Total Engagements"
            value={metrics.total_engagements?.toLocaleString() || '0'}
            color="pink"
          />
          <StatCard
            icon={DollarSign}
            title="Est. Media Value"
            value={`$${(metrics.estimated_media_value || 0).toLocaleString()}`}
            color="green"
          />
          <StatCard
            icon={Image}
            title="Content Pieces"
            value={metrics.content_pieces || '0'}
            color="purple"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Content */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Recent Content</h2>
              <button className="text-amber-400 text-sm hover:text-amber-300">View All</button>
            </div>

            {dashboard?.recent_content?.length > 0 ? (
              <div className="space-y-4">
                {dashboard.recent_content.slice(0, 5).map((content) => (
                  <div key={content.id} className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg">
                    <div className="w-12 h-12 bg-slate-700 rounded flex items-center justify-center">
                      {content.content_type === 'video' ? (
                        <Video className="h-6 w-6 text-slate-500" />
                      ) : (
                        <Image className="h-6 w-6 text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{content.title}</p>
                      <p className="text-slate-500 text-sm">{content.platform} • {new Date(content.published_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-medium">{content.reach?.toLocaleString()}</p>
                      <p className="text-slate-500 text-xs">reach</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No content data yet</p>
              </div>
            )}
          </div>

          {/* Reports & Assets */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-4">
                <button className="p-4 bg-slate-900/50 rounded-lg text-left hover:bg-slate-900 transition-colors">
                  <Download className="h-6 w-6 text-amber-400 mb-2" />
                  <p className="text-white font-medium">Download Report</p>
                  <p className="text-slate-500 text-sm">Monthly summary</p>
                </button>
                <button className="p-4 bg-slate-900/50 rounded-lg text-left hover:bg-slate-900 transition-colors">
                  <Image className="h-6 w-6 text-amber-400 mb-2" />
                  <p className="text-white font-medium">Brand Assets</p>
                  <p className="text-slate-500 text-sm">Logos & photos</p>
                </button>
              </div>
            </div>

            {/* Contract Info */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Contract Details</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Sponsorship Level</span>
                  <span className="text-white capitalize">{sponsor.sponsorship_level || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Contract Start</span>
                  <span className="text-white">{sponsor.contract_start_date || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Contract End</span>
                  <span className="text-white">{sponsor.contract_end_date || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, color }) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400',
    pink: 'bg-pink-500/20 text-pink-400',
    green: 'bg-green-500/20 text-green-400',
    purple: 'bg-purple-500/20 text-purple-400',
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-slate-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}
