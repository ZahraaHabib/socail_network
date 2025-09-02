
'use client';
import { useEffect, useState, useRef, ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: ReactNode;
}

export default function MessageNotificationBadge({ children }: Props) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<any[]>([]);
  const dropdownRef = useRef(null);

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
            className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
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
