import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  LayoutDashboard, Building2, Users, UserPlus, CreditCard, Activity,
  Settings, LogOut, Mail, Flag, History, ChevronLeft, ChevronRight, Send, Clock,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Schools', icon: Building2, path: '/tenants' },
  { name: 'Trials', icon: Clock, path: '/trials' },
  { name: 'Users', icon: Users, path: '/users' },
  { name: 'User Requests', icon: UserPlus, path: '/user-requests' },
  { name: 'Invitations', icon: Send, path: '/invitations' },
  { name: 'Subscriptions', icon: CreditCard, path: '/subscriptions' },
  { name: 'Analytics', icon: Activity, path: '/analytics' },
  { name: 'Email Templates', icon: Mail, path: '/email-templates' },
  { name: 'Feature Flags', icon: Flag, path: '/feature-flags' },
  { name: 'Audit Logs', icon: History, path: '/audit-logs' },
  { name: 'Settings', icon: Settings, path: '/settings' },
];

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const initials = (user?.email || '??').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className={`bg-slate-900 text-white flex flex-col transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-700">
          <img src="/edusaga-logo.svg" alt="EduSaga" className="w-7 h-7 flex-shrink-0" />
          {!collapsed && (
            <div>
              <h1 className="text-sm font-bold tracking-tight">EduSaga 360</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Admin Portal</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="px-3 py-3 text-slate-400 hover:text-white border-t border-slate-700 flex items-center justify-center"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {navigation.find(n => n.path === location.pathname)?.name || 'Admin Portal'}
          </h2>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 hover:bg-slate-100 rounded-lg px-2 py-1">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-emerald-600 text-white text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-slate-700 hidden sm:inline">{user?.email}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={logout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
