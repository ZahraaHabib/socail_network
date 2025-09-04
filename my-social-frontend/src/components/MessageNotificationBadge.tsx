'use client';
import { useEffect, useState, useRef, ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: ReactNode;
}

export default function MessageNotificationBadge({ children }: Props) {
  const { isAuthenticated, loading: authLoading, onMessage, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<any[]>([]);
  const dropdownRef = useRef(null);
  // Debug: log render and unreadCount
  console.log('[MessageBadge] Render, unreadCount:', unreadCount);

  // Fetch unread count
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    fetch('http://localhost:8080/messages/unread-count', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => setUnreadCount(data.unread_count || 0))
      .catch(() => setUnreadCount(0));
  }, [isAuthenticated, authLoading]);

  // Listen for WebSocket events and debug all incoming events
  useEffect(() => {
    if (!onMessage) return;
    // Helper to fetch unread count from backend
    const fetchUnreadCount = () => {
      console.log('[MessageBadge] Fetching unread count...');
      fetch('http://localhost:8080/messages/unread-count', {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          console.log('[MessageBadge] Unread count data:', data);
          setUnreadCount(data.unread_count || 0);
        })
        .catch((err) => {
          console.error('[MessageBadge] Error fetching unread count:', err);
          setUnreadCount(0);
        });
    };

    // Catch-all logger for all events (for debugging)
    if (onMessage) {
      onMessage('*', (data: any) => {
        console.log('[MessageBadge] Received event data:', data);
      });
    }

    // Register handlers for expected events
    onMessage('offline_messages_notification', (data) => {
      console.log('[MessageBadge] Received offline_messages_notification:', data);
      fetchUnreadCount();
    });
    onMessage('direct_message', (data) => {
      console.log('[MessageBadge] Received direct_message:', data);
      fetchUnreadCount();
    });
    onMessage('message_read', (data) => {
      console.log('[MessageBadge] Received message_read:', data);
      fetchUnreadCount();
    });
    onMessage('conversation_updated', (data: any) => {
      console.log('[MessageBadge] Received conversation_updated:', data);
      // If unread_count is present in the event data, update directly
      if (typeof data?.unread_count === 'number') {
        setUnreadCount(data.unread_count);
      } else {
        fetchUnreadCount();
      }
    });
  }, [onMessage, user]);

  // Fetch unread messages when dropdown opens
  useEffect(() => {
    if (!dropdownOpen || !isAuthenticated || authLoading) return;
    fetch('http://localhost:8080/messages/unread', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setUnreadMessages(data);
        } else {
          setUnreadMessages([]);
        }
      })
      .catch(() => setUnreadMessages([]));
  }, [dropdownOpen, isAuthenticated, authLoading]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !(dropdownRef.current as any).contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [dropdownOpen]);

  if (!isAuthenticated || authLoading) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={() => setDropdownOpen(v => !v)}>
        {children}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 bg-red-500 rounded-full w-3 h-3 flex items-center justify-center"
            style={{ boxShadow: '0 0 0 2px white' }}
          />
        )}
      </div>
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-gradient-to-br from-indigo-100 via-purple-100 to-blue-100 shadow-2xl rounded-xl z-50 border border-gray-300 p-2">
          {(!unreadMessages || unreadMessages.length === 0) ? (
            <div className="p-4 text-gray-500 text-center">No unread messages</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-gray-200">
              {unreadMessages.map((msg: any) => (
                <li key={msg.id} className="p-4 hover:bg-indigo-50 rounded-lg transition-colors">
                  <div className="font-semibold text-indigo-700 truncate">{msg.username}</div>
                  <div className="text-sm text-gray-800 truncate">{msg.content}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(msg.created_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
