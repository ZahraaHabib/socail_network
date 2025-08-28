'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function MessageNotificationBadge() {
  const { isAuthenticated, loading: authLoading, wsConnected, onMessage } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated || authLoading) return;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch('http://localhost:8080/messages/unread-count', {
        credentials: 'include',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unread_count || 0);
      } else if (res.status === 401) {
  // ...existing code...
        setUnreadCount(0);
      } else {
        console.error('Failed to fetch unread message count:', res.status, res.statusText);
        setUnreadCount(0);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching unread message count:', error);
      }
      setUnreadCount(0);
    }
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const timer = setTimeout(() => {
        fetchUnreadCount();
      }, 1000);
      
      // Poll for message count updates every 2 minutes as fallback
      const interval = setInterval(fetchUnreadCount, 120000);
      
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    } else {
      setUnreadCount(0);
    }
  }, [isAuthenticated, authLoading, fetchUnreadCount]);

  // WebSocket integration for real-time message count updates
  useEffect(() => {
    if (!onMessage || !wsConnected || !isAuthenticated) return;

  // ...existing code...

    // Listen for message count updates
    onMessage('message_count_update', (data: { unread_count: number }) => {
  // ...existing code...
      setUnreadCount(data.unread_count || 0);
    });

    // Listen for new messages to update count
    onMessage('new_message', (data: any) => {
  // ...existing code...
      // Use a simple fetch instead of the callback to avoid dependency issues
      fetch('http://localhost:8080/messages/unread-count', {
        credentials: 'include',
      }).then(res => res.json()).then(data => {
        setUnreadCount(data.unread_count || 0);
      }).catch(err => console.error('Error fetching unread count:', err));
    });

    // Listen for new message popups to update count  
    onMessage('new_message_popup', (data: any) => {
  // ...existing code...
      // Use a simple fetch instead of the callback to avoid dependency issues
      fetch('http://localhost:8080/messages/unread-count', {
        credentials: 'include',
      }).then(res => res.json()).then(data => {
        setUnreadCount(data.unread_count || 0);
      }).catch(err => console.error('Error fetching unread count:', err));
    });

  }, [onMessage, wsConnected, isAuthenticated]);

  if (!isAuthenticated || authLoading || unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
