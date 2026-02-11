import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, DollarSign, Package, MessageSquare, LogOut, BarChart3, Calendar, ShoppingBag, Settings } from 'lucide-react';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tunjo_admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }

    fetch('/tunjoracing/api/v1/admin/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStats(data.data);
        } else {
          navigate('/admin/login');
        }
        setLoading(false);
      })
      .catch(() => {
        navigate('/admin/login');
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('tunjo_admin_token');
    navigate('/admin/login');
  };

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
            <Link to="/" className="font-racing font-bold text-xl">
              <span className="gradient-text">TUNJO</span>
              <span className="text-white">RACING</span>
            </Link>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">Admin Dashboard</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </header>

      <div className="p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={Users}
            title="Total Fans"
            value={stats?.fans?.total || 0}
            subtitle={`+${stats?.fans?.new_this_month || 0} this month`}
            color="blue"
          />
          <StatCard
            icon={Package}
            title="Active Sponsors"
            value={stats?.sponsors?.active || 0}
            subtitle={`${stats?.sponsors?.total || 0} total`}
            color="amber"
          />
          <StatCard
            icon={ShoppingBag}
            title="Total Orders"
            value={stats?.orders?.total || 0}
            color="green"
          />
          <StatCard
            icon={DollarSign}
            title="Total Revenue"
            value={`$${(stats?.orders?.revenue || 0).toLocaleString()}`}
            color="purple"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <QuickAction icon={Users} title="Manage Fans" description="View and export fan database" />
          <QuickAction icon={Package} title="Manage Sponsors" description="Add and edit sponsors" />
          <QuickAction icon={ShoppingBag} title="View Orders" description="Process and fulfill orders" />
          <QuickAction icon={Calendar} title="Manage Races" description="Update race calendar" />
        </div>

        {/* New Inquiries Alert */}
        {stats?.inquiries?.new > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-6 w-6 text-amber-400" />
              <div>
                <h3 className="text-white font-semibold">New Sponsor Inquiries</h3>
                <p className="text-slate-300">You have {stats.inquiries.new} new sponsorship inquiries to review.</p>
              </div>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Platform Overview</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-4 bg-slate-900/50 rounded-lg">
              <h3 className="text-slate-400 text-sm mb-2">Fan Growth</h3>
              <BarChart3 className="h-20 w-full text-slate-600" />
              <p className="text-slate-500 text-xs mt-2">Chart visualization coming soon</p>
            </div>
            <div className="p-4 bg-slate-900/50 rounded-lg">
              <h3 className="text-slate-400 text-sm mb-2">Store Performance</h3>
              <BarChart3 className="h-20 w-full text-slate-600" />
              <p className="text-slate-500 text-xs mt-2">Chart visualization coming soon</p>
            </div>
            <div className="p-4 bg-slate-900/50 rounded-lg">
              <h3 className="text-slate-400 text-sm mb-2">Media Analytics</h3>
              <BarChart3 className="h-20 w-full text-slate-600" />
              <p className="text-slate-500 text-xs mt-2">Chart visualization coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, subtitle, color }) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400',
    amber: 'bg-amber-500/20 text-amber-400',
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
          {subtitle && <p className="text-slate-500 text-xs">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, title, description }) {
  return (
    <button className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 text-left hover:border-amber-500/30 transition-colors group">
      <Icon className="h-8 w-8 text-slate-500 group-hover:text-amber-400 mb-3 transition-colors" />
      <h3 className="text-white font-medium mb-1">{title}</h3>
      <p className="text-slate-400 text-sm">{description}</p>
    </button>
  );
}
