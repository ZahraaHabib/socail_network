'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePathname } from 'next/navigation';
import GroupTab from '../app/groups/page';

type MessagePopup = {
  id: string;
  sender_id: number;
  sender_username: string;
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
    onMessage('new_message_popup', (data: { sender_id: number; sender_username: string; message: string; content: string; created_at: string; message_id?: string }) => {
      // Don't show popup if user is on chat page
      if (isOnChatPage) return;
      const messageKey = `${data.sender_id}-${data.message_id || Date.now()}`;
      if (recentMessageIds.has(messageKey)) return;
      const popup: MessagePopup = {
        id: `popup-${messageKey}`,
        sender_id: data.sender_id || 0,
        sender_username: data.sender_username || 'Unknown',
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
    onMessage('group_message_notification', (data: { group_id: number; group_message_id: string; sender_id: number; sender_username: string; content: string; created_at: string }) => {
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
    onMessage('new_message', (data: { sender_id: number; id?: string; sender_username: string; content: string; created_at: string; is_sent_by_viewer?: boolean }) => {
      
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
    <div className="fixed top-20 right-4 z-50 space-y-2">
      {popups.map((popup) => (
        <div
          key={popup.id}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm animate-slide-in-right cursor-pointer"
          onClick={() => {
            if (popup.group_id) {
              const groupList = Array.isArray(allGroups) ? allGroups : [];
              const group = groupList.find(g => g.id === popup.group_id);
              if (group) {
                setSelectedGroup(group);
                setActiveTab('chat'); // Use 'chat' as the default GroupTab value
              }
            }
            removePopup(popup.id);
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-blue-600 font-medium">💬</span>
                <h4 className="text-sm font-semibold text-gray-900">
                  {popup.sender_username}
                </h4>
              </div>
              <p className="text-sm text-gray-600 mb-1">
                {popup.message}
              </p>
              {popup.content && (
                <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded italic">
                  &quot;{popup.content.length > 50 ? popup.content.substring(0, 50) + '...' : popup.content}&quot;
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(popup.created_at).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); removePopup(popup.id); }}
              className="text-gray-400 hover:text-gray-600 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
