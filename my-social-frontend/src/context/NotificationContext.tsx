import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type MessagePopup = {
  id: string;
  sender_id: number;
  sender_username: string;
  message: string;
  content: string;
  created_at: string;
  group_id?: number;
};

export type Group = {
  id: number;
  title: string;
};

type NotificationContextType = {
  popups: MessagePopup[];
  removePopup: (id: string) => void;
  setAllGroups: (groups: Group[]) => void;
  allGroups: Group[];
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, wsConnected, onMessage } = useAuth();
  const [popups, setPopups] = useState<MessagePopup[]>([]);
  const [recentMessageIds, setRecentMessageIds] = useState<Set<string>>(new Set());
  const [allGroups, setAllGroups] = useState<Group[]>([]);

  useEffect(() => {
    if (!onMessage || !wsConnected || !isAuthenticated) return;

    // Listen for new message popups (private)
    onMessage('new_message_popup', (data: { sender_id: number; sender_username: string; message: string; content: string; created_at: string; message_id?: string }) => {
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
      const messageKey = `group-${data.group_id}-${data.group_message_id}`;
      if (recentMessageIds.has(messageKey)) return;
      const group = allGroups.find(g => g.id === data.group_id);
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
  }, [onMessage, wsConnected, isAuthenticated, recentMessageIds, allGroups]);

  const removePopup = (id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ popups, removePopup, setAllGroups, allGroups }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
