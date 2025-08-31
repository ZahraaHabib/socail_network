'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePathname } from 'next/navigation';
import GroupTab from '../app/groups/page';

type MessagePopup = {
  id: string;
  sender_id: number;
  sender_username: string;
  sender_avatar?: string;
  message: string;
  content: string;
  created_at: string;
  group_id?: number; // Added optional group_id property
};

type Group = {
  id: number;
  title: string;
  // ...other fields
};

type GroupTab = 'chat' | 'posts' | 'events' | 'members';

type Props = {
  allGroups: Group[];
  setSelectedGroup: (group: Group) => void;
  setActiveTab: (tab: GroupTab) => void;
};

export default function MessagePopupNotifications({ allGroups, setSelectedGroup, setActiveTab }: Props) {
  const { isAuthenticated, wsConnected, onMessage } = useAuth();
  const [popups, setPopups] = useState<MessagePopup[]>([]);
  const pathname = usePathname();
  const [recentMessageIds, setRecentMessageIds] = useState<Set<string>>(new Set());
  const isOnChatPage = pathname === '/chat';

  useEffect(() => {
    if (!onMessage || !wsConnected || !isAuthenticated) return;

    // Listen for new message popups (this is the primary popup notification system)
  onMessage('new_message_popup', (data: { sender_id: number; sender_username: string; sender_avatar?: string; message: string; content: string; created_at: string; message_id?: string }) => {
      // Don't show popup if user is on chat page
      if (isOnChatPage) return;
      const messageKey = `${data.sender_id}-${data.message_id || Date.now()}`;
      if (recentMessageIds.has(messageKey)) return;
      const popup: MessagePopup = {
        id: `popup-${messageKey}`,
        sender_id: data.sender_id || 0,
        sender_username: data.sender_username || 'Unknown',
        sender_avatar: data.sender_avatar || '',
        message: data.message || 'New message',
        content: data.content || '',
        created_at: data.created_at || new Date().toISOString(),
      };
      setRecentMessageIds(prev => new Set([...prev, messageKey]));
      setPopups(prev => [...prev, popup]);
      setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== popup.id));
        setTimeout(() => {
          setRecentMessageIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageKey);
            return newSet;
          });
        }, 5000);
      }, 5000);
    });

    // Listen for group chat notifications
  onMessage('group_message_notification', (data: { group_id: number; group_message_id: string; sender_id: number; sender_username: string; sender_avatar?: string; content: string; created_at: string }) => {
      if (isOnChatPage) return;
      const messageKey = `group-${data.group_id}-${data.group_message_id}`;
      if (recentMessageIds.has(messageKey)) return;
      const groupList = Array.isArray(allGroups) ? allGroups : [];
      const group = groupList.find(g => g.id === data.group_id);
      const groupTitle = group?.title || `Group #${data.group_id}`;
      const popup: MessagePopup = {
        id: `group-popup-${messageKey}`,
        sender_id: data.sender_id || 0,
        sender_username: data.sender_username || 'Unknown',
        sender_avatar: data.sender_avatar || '',
        message: `New group message in ${groupTitle}`,
        content: data.content || '',
        created_at: data.created_at || new Date().toISOString(),
        group_id: data.group_id,
      };
      setRecentMessageIds(prev => new Set([...prev, messageKey]));
      setPopups(prev => [...prev, popup]);
      setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== popup.id));
        setTimeout(() => {
          setRecentMessageIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageKey);
            return newSet;
          });
        }, 5000);
      }, 5000);
    });

    // Listen for instant new messages (backup - only show if not on chat page)
  onMessage('new_message', (data: { sender_id: number; id?: string; sender_username: string; sender_avatar?: string; content: string; created_at: string; is_sent_by_viewer?: boolean }) => {
      
      // Don't show popup if user is on chat page - the chat component handles this
      if (isOnChatPage) return;
      
      // Only show popup if this message is not from the current user
      if (data.is_sent_by_viewer === true) return;
      
      // Create unique message identifier
      const messageKey = `${data.sender_id}-${data.id || Date.now()}`;
      
      // Check if we've already processed this message
      if (recentMessageIds.has(messageKey)) {
        return;
      }
      
      const popup: MessagePopup = {
        id: `instant-${messageKey}`,
        sender_id: data.sender_id || 0,
        sender_username: data.sender_username || 'Unknown',
        sender_avatar: data.sender_avatar || '',
        message: `New message from ${data.sender_username || 'Unknown'}`,
        content: data.content || '',
        created_at: data.created_at || new Date().toISOString(),
      };

      // Add to recent messages set and show popup
      setRecentMessageIds(prev => new Set([...prev, messageKey]));
      setPopups(prev => [...prev, popup]);

      // Auto-remove popup after 5 seconds
      setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== popup.id));
        // Clean up from recent messages after 10 seconds
        setTimeout(() => {
          setRecentMessageIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageKey);
            return newSet;
          });
        }, 5000);
      }, 5000);
    });

  }, [onMessage, wsConnected, isAuthenticated, isOnChatPage, recentMessageIds, allGroups]);

  const removePopup = (id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  };

  // Test function to manually trigger a popup (for debugging)
  const testPopup = () => {
    const testPopup: MessagePopup = {
      id: `test-${Date.now()}`,
      sender_id: 999,
      sender_username: 'TestUser',
      message: 'Test message popup',
      content: 'This is a test popup from the frontend',
      created_at: new Date().toISOString(),
    };

    setPopups(prev => [...prev, testPopup]);

    // Auto-remove popup after 5 seconds
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== testPopup.id));
    }, 5000);
  };

  // Listen for test popup events from other components
  useEffect(() => {
    const handleTestPopup = (event: CustomEvent) => {
      if (!isOnChatPage) {
        const data = event.detail;
        const popup: MessagePopup = {
          id: `test-event-${Date.now()}`,
          sender_id: data.sender_id || 999,
          sender_username: data.sender_username || 'TestUser',
          message: data.message || 'Test message',
          content: data.content || '',
          created_at: data.created_at || new Date().toISOString(),
        };

        setPopups(prev => [...prev, popup]);

        setTimeout(() => {
          setPopups(prev => prev.filter(p => p.id !== popup.id));
        }, 5000);
      }
    };

    window.addEventListener('test-message-popup', handleTestPopup as EventListener);
    
    return () => {
      window.removeEventListener('test-message-popup', handleTestPopup as EventListener);
    };
  }, [isOnChatPage]);

  // Expose test function globally for debugging (development only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as Window & { testMessagePopup?: typeof testPopup }).testMessagePopup = testPopup;
    }
  }, []);

  if (!isAuthenticated || popups.length === 0) return null;

  return (
  <div className="fixed bottom-6 right-6 z-[9999] space-y-3">
    {popups.map((popup) => (
      <div
        key={popup.id}
        className="flex items-center gap-3 px-5 py-3 rounded-xl shadow-md border border-blue-200 bg-white animate-slide-in-right cursor-pointer"
        style={{ minWidth: 280, maxWidth: 360 }}
        onClick={() => removePopup(popup.id)}
      >
        {popup.sender_avatar ? (
          <img src={popup.sender_avatar} alt="avatar" className="w-12 h-12 rounded-full border border-blue-200 object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-semibold text-blue-600 border border-blue-200">
            {popup.sender_username.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col justify-center flex-1">
          <span className="text-base font-semibold text-blue-700 mb-1">{popup.sender_username}</span>
          <span className="text-sm text-gray-800 font-normal mb-1">
            {popup.content}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(popup.created_at).toLocaleTimeString()}
          </span>
        </div>
      </div>
    ))}
  </div>
  );
}
