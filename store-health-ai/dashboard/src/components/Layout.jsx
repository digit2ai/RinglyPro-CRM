import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Store,
  AlertTriangle,
  CheckSquare,
  Phone,
  Menu,
  X,
  Activity,
  Mic,
} from 'lucide-react';
import { useWebSocket } from '@/lib/websocket';
import { cn } from '@/lib/utils';
import { VoiceAgentWidget } from './VoiceAgentWidget';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Alerts', href: '/alerts', icon: AlertTriangle },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
];

export function Layout({ children }) {
  const location = useLocation();
  const { isConnected } = useWebSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-gray-900/50 lg:hidden transition-opacity',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b">
            <div className="flex items-center gap-2">
              <Store className="w-6 h-6 text-primary" />
              <span className="text-lg font-bold">Store Health AI</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Connection Status */}
          <div className="p-4 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Activity
                className={cn(
                  'w-4 h-4',
                  isConnected ? 'text-success' : 'text-gray-400'
                )}
              />
              <span className="text-muted-foreground">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 h-16 bg-white border-b">
          <div className="flex items-center justify-between h-full px-4 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex-1" />

            {/* Header actions */}
            <div className="flex items-center gap-3">
              {/* Date */}
              <div className="hidden sm:block text-sm text-muted-foreground">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-6 bg-gray-200" />

              {/* Voice AI Agent with Mic Icon - Orange for visibility */}
              <div className="flex items-center gap-2 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-200">
                <Mic className="w-5 h-5 text-orange-500" />
                <span className="text-xs font-medium text-orange-600">Virginia</span>
                <VoiceAgentWidget agentId="agent_3701kgg7d7v3e1vbjsxv0p5pn48e" />
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
