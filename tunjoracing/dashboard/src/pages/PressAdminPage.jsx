import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, Users, FileText, Clock, CheckCircle, XCircle,
  Plus, Edit2, Trash2, Eye, Copy, UserCheck, UserX, Send, Newspaper, BarChart3
} from 'lucide-react';

export default function PressAdminPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('requests');
  const [stats, setStats] = useState(null);
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [copied, setCopied] = useState(null);

  // Post form state
  const [showPostForm, setShowPostForm] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [postForm, setPostForm] = useState({
    title: '', race_date: '', race_location: '', season: '', series: '',
    summary: '', press_release_text: '', championship_highlights: '',
    cover_image_url: '', status: 'draft'
  });

  useEffect(() => {
    const token = localStorage.getItem('tunjo_admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    fetchAll(token);
  }, [navigate]);

  const getToken = () => localStorage.getItem('tunjo_admin_token');

  const fetchAll = async (token) => {
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      const [statsRes, reqRes, usersRes, postsRes] = await Promise.all([
        fetch('/tunjoracing/api/v1/press/admin/stats', { headers }),
        fetch('/tunjoracing/api/v1/press/admin/requests', { headers }),
        fetch('/tunjoracing/api/v1/press/admin/users', { headers }),
        fetch('/tunjoracing/api/v1/press/admin/media-posts', { headers })
      ]);
      const [statsData, reqData, usersData, postsData] = await Promise.all([
        statsRes.json(), reqRes.json(), usersRes.json(), postsRes.json()
      ]);
      if (statsData.success) setStats(statsData.data);
      if (reqData.success) setRequests(reqData.data);
      if (usersData.success) setUsers(usersData.data);
      if (postsData.success) setPosts(postsData.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    setActionLoading(`approve-${id}`);
    try {
      const res = await fetch(`/tunjoracing/api/v1/press/admin/requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));
        // Show setup link
        if (data.setupLink) {
          setCopied(`setup-${id}`);
          navigator.clipboard.writeText(data.setupLink);
          alert(`Approved! Setup link copied to clipboard:\n\n${data.setupLink}\n\nShare this link with the journalist to set up their password.`);
          setTimeout(() => setCopied(null), 5000);
        }
        fetchAll(getToken());
      }
    } catch (err) {
      alert('Failed to approve request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Reason for rejection (optional):');
    setActionLoading(`reject-${id}`);
    try {
      const res = await fetch(`/tunjoracing/api/v1/press/admin/requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r));
      }
    } catch (err) {
      alert('Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleUser = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    setActionLoading(`toggle-${id}`);
    try {
      const res = await fetch(`/tunjoracing/api/v1/press/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, status: newStatus } : u));
      }
    } catch (err) {
      alert('Failed to update user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetLink = async (id) => {
    setActionLoading(`reset-${id}`);
    try {
      const res = await fetch(`/tunjoracing/api/v1/press/admin/users/${id}/reset-link`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        navigator.clipboard.writeText(data.resetLink);
        alert(`Reset link copied to clipboard:\n\n${data.resetLink}`);
      }
    } catch (err) {
      alert('Failed to generate reset link');
    } finally {
      setActionLoading(null);
    }
  };

  const resetPostForm = () => {
    setPostForm({
      title: '', race_date: '', race_location: '', season: '', series: '',
      summary: '', press_release_text: '', championship_highlights: '',
      cover_image_url: '', status: 'draft'
    });
    setEditingPost(null);
    setShowPostForm(false);
  };

  const handleEditPost = (post) => {
    setPostForm({
      title: post.title || '',
      race_date: post.race_date || '',
      race_location: post.race_location || '',
      season: post.season || '',
      series: post.series || '',
      summary: post.summary || '',
      press_release_text: post.press_release_text || '',
      championship_highlights: post.championship_highlights || '',
      cover_image_url: post.cover_image_url || '',
      status: post.status || 'draft'
    });
    setEditingPost(post);
    setShowPostForm(true);
  };

  const handleSavePost = async (e) => {
    e.preventDefault();
    setActionLoading('save-post');
    try {
      const url = editingPost
        ? `/tunjoracing/api/v1/press/admin/media-posts/${editingPost.id}`
        : '/tunjoracing/api/v1/press/admin/media-posts';
      const method = editingPost ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(postForm)
      });
      const data = await res.json();
      if (data.success) {
        resetPostForm();
        fetchAll(getToken());
      } else {
        alert(data.error || 'Failed to save post');
      }
    } catch (err) {
      alert('Failed to save post');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePost = async (id) => {
    if (!confirm('Are you sure you want to delete this media post?')) return;
    setActionLoading(`delete-${id}`);
    try {
      const res = await fetch(`/tunjoracing/api/v1/press/admin/media-posts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setPosts(prev => prev.filter(p => p.id !== id));
      }
    } catch (err) {
      alert('Failed to delete post');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="inline-block h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800/80 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-racing font-bold">
              <span className="gradient-text">TUNJO</span>
              <span className="text-white">RACING</span>
            </h1>
            <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30">PRESS ADMIN</span>
          </div>
          <Link to="/admin" className="text-slate-400 hover:text-white text-sm transition-colors flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back to Admin
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Press Users', value: stats.total_press_users, color: 'cyan' },
              { label: 'Active', value: stats.active_press_users, color: 'green' },
              { label: 'Pending Requests', value: stats.pending_requests, color: 'yellow' },
              { label: 'Media Posts', value: stats.total_media_posts, color: 'blue' },
              { label: 'Published', value: stats.published_media_posts, color: 'purple' }
            ].map((stat, i) => (
              <div key={i} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-700 mb-6 overflow-x-auto">
          {[
            { id: 'requests', label: 'Access Requests', badge: pendingCount },
            { id: 'users', label: 'Press Users' },
            { id: 'posts', label: 'Media Posts' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className="bg-yellow-500 text-black text-xs px-1.5 py-0.5 rounded-full font-bold">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Access Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700">
                <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No access requests yet.</p>
              </div>
            ) : (
              requests.map(req => (
                <div key={req.id} className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-medium">{req.full_name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                          req.status === 'approved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400">{req.media_outlet} {req.role && `· ${req.role}`}</p>
                      <p className="text-sm text-slate-500">{req.email} {req.country && `· ${req.country}`}</p>
                      {req.website && <p className="text-xs text-cyan-400/70 mt-1">{req.website}</p>}
                      {req.message && <p className="text-xs text-slate-500 mt-1 italic">"{req.message}"</p>}
                      <p className="text-xs text-slate-600 mt-1">
                        Submitted: {new Date(req.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={actionLoading === `approve-${req.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {actionLoading === `approve-${req.id}` ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={actionLoading === `reject-${req.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          {actionLoading === `reject-${req.id}` ? '...' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Press Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            {users.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700">
                <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No press users yet.</p>
              </div>
            ) : (
              users.map(user => (
                <div key={user.id} className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-medium">{user.full_name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          user.status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {user.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400">{user.media_outlet} {user.role && `· ${user.role}`}</p>
                      <p className="text-sm text-slate-500">{user.email} {user.country && `· ${user.country}`}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-600">
                        <span>Downloads: {user.download_count}</span>
                        {user.last_login_at && <span>Last login: {new Date(user.last_login_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleResetLink(user.id)}
                        disabled={actionLoading === `reset-${user.id}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors text-sm disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Reset Link
                      </button>
                      <button
                        onClick={() => handleToggleUser(user.id, user.status)}
                        disabled={actionLoading === `toggle-${user.id}`}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-sm disabled:opacity-50 ${
                          user.status === 'active'
                            ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                            : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                        }`}
                      >
                        {user.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Media Posts Tab */}
        {activeTab === 'posts' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">{posts.length} media post{posts.length !== 1 ? 's' : ''}</p>
              <button
                onClick={() => { resetPostForm(); setShowPostForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                New Media Post
              </button>
            </div>

            {/* Post Form Modal */}
            {showPostForm && (
              <div className="bg-slate-800 rounded-lg border border-cyan-500/30 p-6 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  {editingPost ? 'Edit Media Post' : 'Create Media Post'}
                </h3>
                <form onSubmit={handleSavePost} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Title *</label>
                      <input type="text" value={postForm.title} onChange={e => setPostForm(p => ({ ...p, title: e.target.value }))} required
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Race Date</label>
                      <input type="date" value={postForm.race_date} onChange={e => setPostForm(p => ({ ...p, race_date: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Race Location</label>
                      <input type="text" value={postForm.race_location} onChange={e => setPostForm(p => ({ ...p, race_location: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" placeholder="Circuit de Barcelona" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Season</label>
                      <input type="text" value={postForm.season} onChange={e => setPostForm(p => ({ ...p, season: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" placeholder="2026" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Series</label>
                      <input type="text" value={postForm.series} onChange={e => setPostForm(p => ({ ...p, series: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" placeholder="Formula 4" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Cover Image URL</label>
                      <input type="url" value={postForm.cover_image_url} onChange={e => setPostForm(p => ({ ...p, cover_image_url: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" placeholder="https://..." />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Summary</label>
                      <textarea value={postForm.summary} onChange={e => setPostForm(p => ({ ...p, summary: e.target.value }))} rows={2}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-none" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Press Release Text</label>
                      <textarea value={postForm.press_release_text} onChange={e => setPostForm(p => ({ ...p, press_release_text: e.target.value }))} rows={6}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-none" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Championship Highlights</label>
                      <textarea value={postForm.championship_highlights} onChange={e => setPostForm(p => ({ ...p, championship_highlights: e.target.value }))} rows={3}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                      <select value={postForm.status} onChange={e => setPostForm(p => ({ ...p, status: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={actionLoading === 'save-post'}
                      className="px-5 py-2 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors text-sm disabled:opacity-50">
                      {actionLoading === 'save-post' ? 'Saving...' : (editingPost ? 'Update Post' : 'Create Post')}
                    </button>
                    <button type="button" onClick={resetPostForm}
                      className="px-5 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Posts List */}
            <div className="space-y-3">
              {posts.length === 0 ? (
                <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700">
                  <Newspaper className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No media posts yet. Create your first one!</p>
                </div>
              ) : (
                posts.map(post => (
                  <div key={post.id} className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-white font-medium">{post.title}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            post.status === 'published' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            post.status === 'draft' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                            'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                          }`}>
                            {post.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          {post.race_date && <span>{new Date(post.race_date).toLocaleDateString()}</span>}
                          {post.race_location && <span>{post.race_location}</span>}
                          {post.series && <span>{post.series}</span>}
                          <span>{post.total_views || 0} views</span>
                          <span>{post.total_downloads || 0} downloads</span>
                          {post.assets && <span>{post.assets.length} assets</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => handleEditPost(post)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors text-sm">
                          <Edit2 className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button onClick={() => handleDeletePost(post.id)}
                          disabled={actionLoading === `delete-${post.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors text-sm disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
