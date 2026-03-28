import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await api.get('/notifications?limit=10');
      setNotifications(data.data || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      // Notifications endpoint may not exist yet — fail silently
    }
  };

  const markRead = async () => {
    try {
      await api.post('/notifications/mark-read', {});
      setUnreadCount(0);
    } catch (err) {}
  };

  const handleToggle = () => {
    setOpen(!open);
    if (!open && unreadCount > 0) markRead();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={handleToggle} className="relative p-2 text-dark-400 hover:text-white transition-colors">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-900 border border-dark-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-3 border-b border-dark-700 flex items-center justify-between">
            <h3 className="text-white text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && <span className="text-msk-400 text-xs">{unreadCount} new</span>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-dark-400 text-sm text-center">No notifications</p>
            ) : notifications.map(n => (
              <div key={n.id} className={`p-3 border-b border-dark-800 hover:bg-dark-800/50 transition-all ${!n.is_read ? 'bg-msk-600/5' : ''}`}>
                {n.link ? (
                  <Link to={n.link} onClick={() => setOpen(false)} className="block">
                    <p className="text-white text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-dark-400 text-xs mt-0.5">{n.body}</p>}
                    <p className="text-dark-500 text-[10px] mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </Link>
                ) : (
                  <div>
                    <p className="text-white text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-dark-400 text-xs mt-0.5">{n.body}</p>}
                    <p className="text-dark-500 text-[10px] mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
