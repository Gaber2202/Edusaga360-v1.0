import React from 'react';
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
  LayoutDashboard, GraduationCap, ClipboardCheck, CreditCard,
  MessageSquare, FileText, Bell, LogOut,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Student Progress', icon: GraduationCap, path: '/progress' },
  { name: 'Attendance', icon: ClipboardCheck, path: '/attendance' },
  { name: 'Fees & Billing', icon: CreditCard, path: '/fees' },
  { name: 'Announcements', icon: Bell, path: '/announcements' },
  { name: 'Homework', icon: FileText, path: '/homework' },
  { name: 'Messages', icon: MessageSquare, path: '/messages' },
];

export default function ParentLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || '';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800">EduSaga 360</h1>
              <p className="text-[10px] text-slate-400">Parent Portal</p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 hover:bg-slate-100 rounded-lg px-2 py-1">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-emerald-600 text-white text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-slate-700 hidden sm:inline">{displayName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={logout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex">
        <nav className="hidden md:block w-56 bg-white border-r border-slate-200 min-h-[calc(100vh-64px)] p-3 space-y-1">
          {navigation.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 p-6 max-w-6xl">
          {children}
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around py-2 z-30">
        {navigation.slice(0, 5).map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px]">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
