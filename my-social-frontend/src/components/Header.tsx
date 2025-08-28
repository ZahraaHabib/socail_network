'use client';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import NotificationBell from './NotificationBell';
import MessageNotificationBadge from './MessageNotificationBadge';
import { useState } from 'react';
import MessagePopupNotifications from './MessagePopupNotifications';

// Define Group and GroupTab types to match MessagePopupNotifications
interface Group {
  id: number;
  title: string;
}
type GroupTab = 'chat' | 'posts' | 'events' | 'members';

export default function Header() {
  const { setIsAuthenticated, disconnect } = useAuth();
  const router = useRouter();

  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [activeTab, setActiveTab] = useState<GroupTab>('chat');

  // Handler functions to match expected props
  const handleSetSelectedGroup = (group: Group) => setSelectedGroup(group);
  const handleSetActiveTab = (tab: GroupTab) => setActiveTab(tab);

  const handleLogout = async () => {
    try {
      // First, call the logout endpoint to let server know user is logging out
      // This allows the server to broadcast "user offline" status to other users
      await fetch('http://localhost:8080/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      // Small delay to ensure offline status is broadcast before WebSocket disconnect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then set authentication to false (this will trigger WebSocket disconnect)
      setIsAuthenticated(false);
      
      // Manually disconnect WebSocket to ensure clean disconnect
      if (disconnect) {
        disconnect();
      }
      
      // Navigate to login page
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
      // Even if logout fails, try to clean up locally
      setIsAuthenticated(false);
      if (disconnect) {
        disconnect();
      }
      router.push('/login');
    }
  };

  return (
    <>
    <header className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 shadow-xl backdrop-blur-sm border-b border-white/10 mb-6">
      <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2">
        {/* Left side - Social Network Title */}
        <div className="flex items-center flex-shrink-0 mr-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 whitespace-nowrap">
            <span className="text-3xl">🌐</span>
            Social Network
          </h1>
        </div>

        {/* Center - Navigation Links */}
        <div className="flex flex-wrap gap-2 items-center justify-center flex-1 min-w-0">
          <Link 
            href="/chat" 
            className="group relative text-white/90 hover:text-white font-medium transition-all duration-300 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 hover:shadow-lg hover:scale-105 whitespace-nowrap"
          >
            <span className="text-lg group-hover:animate-pulse">💬</span>
            <span className="relative">
              Chat
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-white/80 group-hover:w-full transition-all duration-300"></span>
            </span>
          </Link>
          <Link 
            href="/groups" 
            className="group relative text-white/90 hover:text-white font-medium transition-all duration-300 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 hover:shadow-lg hover:scale-105 whitespace-nowrap"
          >
            <span className="text-lg group-hover:animate-pulse">👥</span>
            <span className="relative">
              Groups
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-white/80 group-hover:w-full transition-all duration-300"></span>
            </span>
          </Link>
          <Link 
            href="/feed" 
            className="group relative text-white/90 hover:text-white font-medium transition-all duration-300 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 hover:shadow-lg hover:scale-105 whitespace-nowrap"
          >
            <span className="text-lg group-hover:animate-pulse">📰</span>
            <span className="relative">
              Feed
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-white/80 group-hover:w-full transition-all duration-300"></span>
            </span>
          </Link>
          <Link 
            href="/profile" 
            className="group relative text-white/90 hover:text-white font-medium transition-all duration-300 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 hover:shadow-lg hover:scale-105 whitespace-nowrap"
          >
            <span className="text-lg group-hover:animate-pulse">👤</span>
            <span className="relative">
              Profile
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-white/80 group-hover:w-full transition-all duration-300"></span>
            </span>
          </Link>
        </div>
        {/* Right side - Notification and Logout */}
        <div className="flex items-center gap-3 flex-shrink-0 mt-2 md:mt-0">
          <div className="transform hover:scale-105 transition-transform duration-200">
            <NotificationBell />
          </div>
          <div className="relative mr-1 flex items-center" title="Messages">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 text-white/90 group-hover:text-white transition-colors">
              <rect x="3" y="6" width="18" height="12" rx="2" fill="#fff" fillOpacity="0.1" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l9 7 9-7" />
            </svg>
            <div className="absolute -top-1 -right-2">
              <MessageNotificationBadge />
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="group relative bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-5 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 border border-red-400/30 whitespace-nowrap"
          >
            <span className="text-lg group-hover:animate-bounce">🚪</span>
            <span>Logout</span>
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </button>
        </div>
      </nav>
    </header>
    <MessagePopupNotifications 
      allGroups={allGroups} 
      setSelectedGroup={handleSetSelectedGroup} 
      setActiveTab={handleSetActiveTab} 
    />
    </>
  );
}