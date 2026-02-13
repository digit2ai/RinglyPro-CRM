import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ChevronLeft, Calendar, MapPin, Download, Image, Video,
  Eye, FileText, Quote, Trophy, Newspaper, ExternalLink
} from 'lucide-react';

export default function PressMediaPostPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('release');
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('tunjo_press_token');
    if (!token) {
      navigate('/press/login');
      return;
    }
    fetchPost(token);
  }, [slug, navigate]);

  const fetchPost = async (token) => {
    try {
      const res = await fetch(`/tunjoracing/api/v1/press/media-posts/${slug}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPost(data.data);
      } else {
        navigate('/press/portal');
      }
    } catch (err) {
      navigate('/press/portal');
    } finally {
      setLoading(false);
    }
  };

  const trackDownload = async (assetId) => {
    const token = localStorage.getItem('tunjo_press_token');
    try {
      await fetch(`/tunjoracing/api/v1/press/media-posts/${post.id}/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ asset_id: assetId })
      });
    } catch (err) {
      // Silent fail for tracking
    }
  };

  const handleDownload = async (asset) => {
    setDownloading(asset.id);
    await trackDownload(asset.id);
    window.open(asset.url, '_blank');
    setTimeout(() => setDownloading(null), 1000);
  };

  const handleDownloadAll = async (type) => {
    const assets = (post.assets || []).filter(a => a.asset_type === type);
    for (const asset of assets) {
      await trackDownload(asset.id);
      window.open(asset.url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4">Loading media post...</p>
        </div>
      </div>
    );
  }

  if (!post) return null;

  const photos = (post.assets || []).filter(a => a.asset_type === 'photo');
  const videos = (post.assets || []).filter(a => a.asset_type === 'video');
  const quotes = post.driver_quotes || [];

  const tabs = [
    { id: 'release', label: 'Press Release', icon: FileText },
    { id: 'photos', label: `Photos (${photos.length})`, icon: Image },
    { id: 'videos', label: `Videos (${videos.length})`, icon: Video }
  ];

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
          <Link to="/press/portal" className="text-slate-400 hover:text-white text-sm transition-colors">
            Back to Media Center
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link to="/press/portal" className="flex items-center gap-1 text-slate-400 hover:text-white mb-6 transition-colors text-sm">
          <ChevronLeft className="h-4 w-4" />
          Back to Media Center
        </Link>

        {/* Cover Image */}
        {post.cover_image_url && (
          <div className="rounded-lg overflow-hidden mb-6 h-64 sm:h-80">
            <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Title & Meta */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mb-3">
            {post.series && (
              <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded text-xs border border-cyan-500/30">{post.series}</span>
            )}
            {post.season && (
              <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-xs">{post.season}</span>
            )}
            {post.race_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(post.race_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            )}
            {post.race_location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {post.race_location}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">{post.title}</h1>
          {post.summary && (
            <p className="text-lg text-slate-400">{post.summary}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'release' && (
          <div className="space-y-6">
            {/* Press Release Text */}
            {post.press_release_text && (
              <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-cyan-400" />
                  Press Release
                </h3>
                <div className="text-slate-300 leading-relaxed whitespace-pre-line">
                  {post.press_release_text}
                </div>
              </div>
            )}

            {/* Driver Quotes */}
            {quotes.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Quote className="h-5 w-5 text-cyan-400" />
                  Driver Quotes
                </h3>
                <div className="space-y-4">
                  {quotes.map((q, i) => (
                    <blockquote key={i} className="border-l-2 border-cyan-500 pl-4">
                      <p className="text-slate-300 italic mb-1">"{q.quote}"</p>
                      <cite className="text-cyan-400 text-sm font-medium not-italic">— {q.driver}</cite>
                    </blockquote>
                  ))}
                </div>
              </div>
            )}

            {/* Championship Highlights */}
            {post.championship_highlights && (
              <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-cyan-400" />
                  Championship Highlights
                </h3>
                <div className="text-slate-300 leading-relaxed whitespace-pre-line">
                  {post.championship_highlights}
                </div>
              </div>
            )}

            {!post.press_release_text && quotes.length === 0 && !post.championship_highlights && (
              <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700">
                <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No press release content yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'photos' && (
          <div>
            {photos.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-400">{photos.length} photo{photos.length !== 1 ? 's' : ''} available</p>
                  <button
                    onClick={() => handleDownloadAll('photo')}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors text-sm"
                  >
                    <Download className="h-4 w-4" />
                    Download All Photos
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.map(asset => (
                    <div key={asset.id} className="group relative bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                      <div className="aspect-[4/3]">
                        <img
                          src={asset.thumbnail_url || asset.url}
                          alt={asset.caption || asset.filename}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          onClick={() => handleDownload(asset)}
                          disabled={downloading === asset.id}
                          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors text-sm"
                        >
                          <Download className="h-4 w-4" />
                          {downloading === asset.id ? 'Opening...' : 'Download'}
                        </button>
                      </div>
                      <div className="p-3">
                        {asset.caption && <p className="text-xs text-slate-300 mb-1">{asset.caption}</p>}
                        {asset.credit && <p className="text-xs text-slate-500">Credit: {asset.credit}</p>}
                        {asset.file_size && (
                          <p className="text-xs text-slate-600 mt-1">
                            {(asset.file_size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700">
                <Image className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No photos available for this post.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'videos' && (
          <div>
            {videos.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-400">{videos.length} video{videos.length !== 1 ? 's' : ''} available</p>
                </div>
                <div className="space-y-4">
                  {videos.map(asset => (
                    <div key={asset.id} className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Video className="h-6 w-6 text-cyan-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium">{asset.filename || 'Video File'}</p>
                          {asset.caption && <p className="text-sm text-slate-400">{asset.caption}</p>}
                          <div className="flex items-center gap-3 mt-1">
                            {asset.credit && <span className="text-xs text-slate-500">Credit: {asset.credit}</span>}
                            {asset.file_size && (
                              <span className="text-xs text-slate-600">
                                {(asset.file_size / (1024 * 1024)).toFixed(1)} MB
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(asset)}
                        disabled={downloading === asset.id}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors text-sm flex-shrink-0"
                      >
                        <Download className="h-4 w-4" />
                        {downloading === asset.id ? 'Opening...' : 'Download'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700">
                <Video className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No videos available for this post.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
