'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

type AuthContextType = {
  isAuthenticated: boolean;
  setIsAuthenticated: (auth: boolean) => void;
  loading: boolean;
  // Expose WebSocket functionality globally
  wsConnected: boolean;
  onMessage: ((type: string, handler: (data: any) => void) => void) | null;
  sendGroupMessage: ((groupId: number, content: string) => boolean) | null;
  disconnect: (() => void) | null;
  // Online user management
  onlineUsers: Set<number>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  
  // Connect WebSocket when user is authenticated
  const shouldConnectWS = isAuthenticated;
  // ...existing code...
  const { isConnected: wsConnected, onMessage, sendGroupMessage, sendMessage, disconnect } = useWebSocket(shouldConnectWS);
  
  // Debug WebSocket connection status and request online status
  useEffect(() => {
  // ...existing code...
    
    // Request current online status when WebSocket connects
    if (wsConnected && sendMessage) {
  // ...existing code...
      sendMessage('request_online_status', {});
    }
  }, [wsConnected, sendMessage]);

  // Set up global WebSocket listeners when connected
  useEffect(() => {
    if (!onMessage || !wsConnected) return;

    // Global listeners that should always be active
    onMessage('connected', (data: any) => {
  // ...existing code...
    });

    onMessage('user_online', (data: { user_id: number }) => {
  // ...existing code...
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.add(data.user_id);
        return newSet;
      });
      // Dispatch a custom event that other components can listen to
      window.dispatchEvent(new CustomEvent('userOnline', { detail: data }));
    });

    onMessage('user_offline', (data: { user_id: number }) => {
  // ...existing code...
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.user_id);
        return newSet;
      });
      // Dispatch a custom event that other components can listen to
      window.dispatchEvent(new CustomEvent('userOffline', { detail: data }));
    });

  }, [onMessage, wsConnected]);

  useEffect(() => {
    fetch('http://localhost:8080/v2/users/me', { credentials: 'include' })
      .then(res => setIsAuthenticated(res.ok))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      setIsAuthenticated, 
      loading,
      wsConnected,
      onMessage,
      sendGroupMessage,
      disconnect,
      onlineUsers
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}