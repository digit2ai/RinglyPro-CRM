import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Newspaper, LogOut, Calendar, MapPin, Eye, ChevronRight, Search, Filter } from 'lucide-react';

export default function PressPortalPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [pressUser, setPressUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('tunjo_press_token');
    const info = localStorage.getItem('tunjo_press_info');
    if (!token) {
      navigate('/press/login');
      return;
    }
    if (info) {
      try { setPressUser(JSON.parse(info)); } catch (e) {}
    }
    fetchPosts(token);
  }, [navigate]);

  const fetchPosts = async (token, season) => {
    try {
      let url = '/tunjoracing/api/v1/press/media-posts?limit=50';
      if (season) url += `&season=${season}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPosts(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tunjo_press_token');
    localStorage.removeItem('tunjo_press_info');
    navigate('/press/login');
  };

  const handleSeasonChange = (e) => {
    const season = e.target.value;
    setSeasonFilter(season);
    setLoading(true);
    fetchPosts(localStorage.getItem('tunjo_press_token'), season || undefined);
  };

  const filteredPosts = posts.filter(post => {
    if (!search) return true;
    const q = search.toLowerCase();
    return post.title.toLowerCase().includes(q) ||
      (post.race_location && post.race_location.toLowerCase().includes(q)) ||
      (post.summary && post.summary.toLowerCase().includes(q));
  });

  const seasons = [...new Set(posts.map(p => p.season).filter(Boolean))].sort().reverse();

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800/80 border-b border-slate-700 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-racing font-bold">
              <span className="gradient-text">TUNJO</span>
              <span className="text-white">RACING</span>
            </h1>
            <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30">PRESS</span>
          </div>
          <div className="flex items-center gap-4">
            {pressUser && (
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{pressUser.full_name}</p>
                <p className="text-xs text-slate-400">{pressUser.media_outlet}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-1">Media Center</h2>
          <p className="text-slate-400">Access official race media packages, press releases, photos, and videos.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search media posts..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <select
              value={seasonFilter}
              onChange={handleSeasonChange}
              className="px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">All Seasons</option>
              {seasons.map(s => (
                <option key={s} value={s}>{s} Season</option>
              ))}
            </select>
          </div>
        </div>

        {/* Posts Grid */}
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 mt-4">Loading media posts...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/30 rounded-lg border border-slate-700">
            <Newspaper className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-1">No Media Posts Available</h3>
            <p className="text-slate-400 text-sm">
              {search ? 'No posts match your search.' : 'Media posts will appear here when published.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map(post => (
              <Link
                key={post.id}
                to={`/press/media/${post.slug}`}
                className="group bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden hover:border-cyan-500/50 transition-all hover:shadow-lg hover:shadow-cyan-500/5"
              >
                {post.cover_image_url ? (
                  <div className="h-48 overflow-hidden">
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="h-48 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                    <Newspaper className="h-12 w-12 text-slate-600" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                    {post.race_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(post.race_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    {post.race_location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {post.race_location}
                      </span>
                    )}
                  </div>
                  <h3 className="text-white font-semibold mb-2 group-hover:text-cyan-400 transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  {post.summary && (
                    <p className="text-slate-400 text-sm line-clamp-2">{post.summary}</p>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                    {post.series && (
                      <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{post.series}</span>
                    )}
                    <span className="flex items-center gap-1 text-cyan-400 text-xs font-medium group-hover:gap-2 transition-all">
                      View Media <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
