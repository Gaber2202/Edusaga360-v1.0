import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { NotificationService } from './NotificationService';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function NotificationBell() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [userEmail, setUserEmail] = useState(null);

  // Safe access to user - avoid hook dependency issues
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { supabase } = await import('../../api/supabaseClient');
        const currentUser = await supabase.auth.getUser().then(r => r.data?.user);
        setUserEmail(currentUser?.email);
      } catch (_e) {
        // Silent fail
      }
    };
    fetchUser();
  }, []);

  const fetchUnreadCount = async () => {
    if (!userEmail) return;
    
    try {
      const notifications = await NotificationService.getUserNotifications(userEmail, true);
      setUnreadCount(notifications.length);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  useEffect(() => {
    if (!userEmail) return;
    
    fetchUnreadCount();

    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [userEmail]);

  const handleClick = () => {
    navigate(createPageUrl('NotificationCenter'));
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        className="relative"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <Badge
            className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center p-0 bg-red-600 text-white text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>
    </div>
  );
}