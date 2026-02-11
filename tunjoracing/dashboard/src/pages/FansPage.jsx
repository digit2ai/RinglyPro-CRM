import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Mail, Globe, Download, Search, ArrowLeft, UserPlus, TrendingUp } from 'lucide-react';

export default function FansPage() {
  const navigate = useNavigate();
  const [fans, setFans] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('tunjo_admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }

    // Fetch fans and stats
    Promise.all([
      fetch('/tunjoracing/api/v1/fans', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()),
      fetch('/tunjoracing/api/v1/fans/stats', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json())
    ]).then(([fansData, statsData]) => {
      if (fansData.success) setFans(fansData.data);
      if (statsData.success) setStats(statsData.stats);
      setLoading(false);
    }).catch(() => {
      navigate('/admin/login');
    });
  }, [navigate]);

  const handleExport = () => {
    const token = localStorage.getItem('tunjo_admin_token');
    window.open(`/tunjoracing/api/v1/fans/export?token=${token}`, '_blank');
  };

  const filteredFans = fans.filter(f =>
    f.email?.toLowerCase().includes(search.toLowerCase()) ||
    f.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    f.last_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-slate-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Link to="/" className="font-racing font-bold text-xl">
              <span className="gradient-text">TUNJO</span>
              <span className="text-white">RACING</span>
            </Link>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">Fan Management</span>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-600 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </header>

      <div className="p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={Users}
            title="Total Fans"
            value={stats?.total_fans || 0}
            color="blue"
          />
          <StatCard
            icon={Mail}
            title="Subscribed"
            value={stats?.subscribed_fans || 0}
            color="green"
          />
          <StatCard
            icon={TrendingUp}
            title="New This Month"
            value={stats?.new_this_month || 0}
            color="amber"
          />
          <StatCard
            icon={Globe}
            title="Countries"
            value={stats?.by_country?.length || 0}
            color="purple"
          />
        </div>

        {/* Country Breakdown */}
        {stats?.by_country?.length > 0 && (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Fans by Country</h2>
            <div className="flex flex-wrap gap-3">
              {stats.by_country.map((c, i) => (
                <span key={i} className="px-3 py-1 bg-slate-700 rounded-full text-slate-300 text-sm">
                  {c.country || 'Unknown'}: {c.count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search & Fan List */}
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Fan Database</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search fans..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {filteredFans.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Email</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Name</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Country</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Tier</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Subscribed</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFans.map((fan) => (
                    <tr key={fan.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="py-3 px-4 text-white">{fan.email}</td>
                      <td className="py-3 px-4 text-slate-300">
                        {fan.first_name || fan.last_name
                          ? `${fan.first_name || ''} ${fan.last_name || ''}`.trim()
                          : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-300">{fan.country || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          fan.membership_tier === 'vip' ? 'bg-amber-500/20 text-amber-400' :
                          fan.membership_tier === 'premium' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-slate-600/50 text-slate-400'
                        }`}>
                          {fan.membership_tier}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          fan.email_subscribed
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {fan.email_subscribed ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-sm">
                        {new Date(fan.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <UserPlus className="h-12 w-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No fans found</p>
              <p className="text-slate-500 text-sm mt-2">Fans will appear here when they sign up on the website</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, color }) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-green-500/20 text-green-400',
    amber: 'bg-amber-500/20 text-amber-400',
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
