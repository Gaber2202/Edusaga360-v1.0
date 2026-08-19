import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { useTheme } from '../lib/ThemeContext';
import { parentDisplayName } from '../lib/displayName';
import Wordmark from './Wordmark';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Separator } from './ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  LayoutDashboard, GraduationCap, ClipboardCheck, CreditCard,
  MessageSquare, FileText, Bell, LogOut, Globe, Moon, Sun, MoreHorizontal,
  UtensilsCrossed, ShoppingBag,
} from 'lucide-react';
import { cn } from '../lib/utils';

const navigation = [
  { key: 'dashboard', icon: LayoutDashboard, path: '/' },
  { key: 'studentProgress', icon: GraduationCap, path: '/progress' },
  { key: 'attendance', icon: ClipboardCheck, path: '/attendance' },
  { key: 'feesBilling', icon: CreditCard, path: '/fees' },
  { key: 'canteen', icon: UtensilsCrossed, path: '/canteen' },
  { key: 'store', icon: ShoppingBag, path: '/store' },
  { key: 'announcements', icon: Bell, path: '/announcements' },
  { key: 'homework', icon: FileText, path: '/homework' },
  { key: 'messages', icon: MessageSquare, path: '/messages' },
];

const mobilePrimary = ['/', '/attendance', '/fees', '/messages'];

function NavLink({ item, isActive, label, compact = false }) {
  if (compact) {
    return (
      <Link
        to={item.path}
        className={cn(
          'flex min-h-11 min-w-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium',
          isActive ? 'text-gold-400' : 'text-[#C9D6CE] hover:text-[#F5F0E4]',
        )}
      >
        <item.icon className="h-5 w-5 stroke-[1.5]" />
        <span className="leading-tight">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      to={item.path}
      className={cn(
        'relative flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors duration-state ease-brand',
        isActive
          ? 'bg-[#10402D] text-[#F5F0E4]'
          : 'text-[#C9D6CE] hover:bg-white/10 hover:text-[#F5F0E4]',
      )}
    >
      {isActive ? (
        <span className="absolute start-1.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-gold-400" aria-hidden />
      ) : null}
      <item.icon className={cn('h-5 w-5 stroke-[1.5]', isActive ? 'text-gold-400' : 'text-[#C9D6CE]')} />
      {label}
    </Link>
  );
}

export default function ParentLayout({ children }) {
  const { user, logout } = useAuth();
  const { t, isRTL, toggle } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const location = useLocation();

  const displayName = parentDisplayName(user);
  const initials = displayName.slice(0, 2).toUpperCase();
  const mobileMore = navigation.filter((item) => !mobilePrimary.includes(item.path));

  return (
    <div className="min-h-screen bg-sand md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-e border-white/10 bg-[#0B3A29] md:flex">
        <div className="px-5 pb-4 pt-6">
          <Link to="/" className="block">
            <Wordmark variant="cream" className="text-[22px]" />
          </Link>
          <p className="mt-1 text-[12px] font-medium text-[#C9D6CE]">{t('parentPortal')}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label={t('navigation')}>
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              item={item}
              isActive={location.pathname === item.path}
              label={t(item.key)}
            />
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 p-3">
          <div className="flex items-center gap-2 rounded-full px-1.5 py-1">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-[#10402D] text-xs text-[#F5F0E4]">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#F5F0E4]">{displayName}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#C9D6CE] transition-colors duration-state hover:bg-white/10 hover:text-[#F5F0E4]"
              aria-label={t('signOut')}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-[color:var(--es-border)] bg-card/95 backdrop-blur-sm md:bg-sand/90">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-2 md:hidden">
              <Wordmark className="text-[20px]" />
            </Link>
            <p className="hidden text-sm font-semibold text-ink md:block">
              {t(navigation.find((item) => item.path === location.pathname)?.key || 'dashboard')}
            </p>

            <div className="ms-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors duration-state hover:bg-sand-alt"
                aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={toggle}
                className="flex h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-ink transition-colors duration-state hover:bg-sand-alt"
                aria-label="Toggle language"
              >
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">{isRTL ? t('switchToEnglish') : t('switchToArabic')}</span>
              </button>

              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-11 items-center gap-2 rounded-full px-1.5 pe-2 transition-colors duration-state hover:bg-sand-alt"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-xs text-primary-foreground">{initials}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={logout} className="text-[#A8443A]">
                      <LogOut className="me-2 h-4 w-4" />
                      {t('signOut')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-5 pb-28 sm:p-8 md:pb-8">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0B3A29] py-1.5 md:hidden"
        aria-label={t('navigation')}
      >
        <div className="flex justify-around">
          {navigation.filter((item) => mobilePrimary.includes(item.path)).map((item) => (
            <NavLink
              key={item.path}
              item={item}
              compact
              isActive={location.pathname === item.path}
              label={t(item.key)}
            />
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex min-h-11 min-w-[3.25rem] flex-col items-center justify-center gap-0.5 px-2 py-1 text-[10px] font-medium',
                  mobileMore.some((item) => item.path === location.pathname)
                    ? 'text-gold-400'
                    : 'text-[#C9D6CE]',
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                {t('more')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="mb-2">
              {mobileMore.map((item) => (
                <DropdownMenuItem key={item.path} asChild>
                  <Link to={item.path} className="flex items-center gap-2 text-ink">
                    <item.icon className="h-4 w-4" />
                    {t(item.key)}
                  </Link>
                </DropdownMenuItem>
              ))}
              <Separator className="my-1" />
              <DropdownMenuItem onClick={logout} className="text-[#A8443A]">
                <LogOut className="h-4 w-4" />
                {t('signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </div>
  );
}
