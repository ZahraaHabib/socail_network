'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

type User = {
  id: number;
  username: string;
  // add other fields as needed
};

type AuthContextType = {
  isAuthenticated: boolean;
  setIsAuthenticated: (auth: boolean) => void;
  loading: boolean;
  // Expose WebSocket functionality globally
  wsConnected: boolean;
  onMessage: ((type: string, handler: (data: any) => void) => void) | null;
  sendGroupMessage: ((groupId: number, content: string) => boolean) | null;
  sendMessage: ((type: string, data: any) => boolean) | null;
  disconnect: (() => void) | null;
  // Online user management
  onlineUsers: Set<number>;
  user: User | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [user, setUser] = useState<User | null>(null);

  // Connect WebSocket when user is authenticated
  const shouldConnectWS = isAuthenticated;
  const { isConnected: wsConnected, onMessage, sendGroupMessage, sendMessage, disconnect } = useWebSocket(shouldConnectWS);

  // Debug WebSocket connection status and request online status
  useEffect(() => {
    // Request current online status when WebSocket connects
    if (wsConnected && sendMessage) {
      sendMessage('request_online_status', {});
    }
  }, [wsConnected, sendMessage]);

  // Set up global WebSocket listeners when connected
  useEffect(() => {
    if (!onMessage || !wsConnected) return;

    // Global listeners that should always be active
    onMessage('connected', (data: any) => {
      console.log('WebSocket connected:', data);
    });

    onMessage('user_online', (data: { user_id: number }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.add(data.user_id);
        return newSet;
      });
      // Dispatch a custom event that other components can listen to
      window.dispatchEvent(new CustomEvent('userOnline', { detail: data }));
    });

    onMessage('user_offline', (data: { user_id: number }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.user_id);
        return newSet;
      });
      // Dispatch a custom event that other components can listen to
      window.dispatchEvent(new CustomEvent('userOffline', { detail: data }));
    });

  }, [onMessage, wsConnected]);

  // Re-check authentication and fetch user info on every route change
  useEffect(() => {
    const checkAuth = () => {
      fetch('http://localhost:8080/v2/users/me', { credentials: 'include' })
        .then(async res => {
          setIsAuthenticated(res.ok);
          if (res.ok) {
            const data = await res.json();
            setUser({ id: data.id, username: data.username });
          } else {
            setUser(null);
          }
        })
        .catch(() => {
          setIsAuthenticated(false);
          setUser(null);
        })
        .finally(() => setLoading(false));
    };
    checkAuth();
    // Listen for route changes
    const handleRouteChange = () => {
      checkAuth();
    };
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('pushstate', handleRouteChange);
    window.addEventListener('replacestate', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('pushstate', handleRouteChange);
      window.removeEventListener('replacestate', handleRouteChange);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      setIsAuthenticated, 
      loading,
  wsConnected,
  onMessage,
  sendGroupMessage,
  sendMessage,
  disconnect,
      onlineUsers,
      user
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