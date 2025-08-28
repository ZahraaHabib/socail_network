'use client';

import { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../context/AuthContext';

type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  related_id?: number;
  related_type?: string;
  actor_id?: number;
  is_read: boolean;
  created_at: string;
};

export default function NotificationBell() {
  const { isAuthenticated, loading: authLoading, wsConnected, onMessage } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  // Helper function to safely fetch unread count
  const safelyFetchUnreadCount = async () => {
    try {
      const res = await fetch('http://localhost:8080/notifications/unread-count', {
        credentials: 'include'
      });
      
      if (!res.ok) {
        console.warn(`HTTP ${res.status}: ${res.statusText}`);
        return;
      }
      
      const text = await res.text();
      if (!text.trim()) {
        console.warn('Empty response from notifications/unread-count');
        return;
      }
      
      try {
        const data = JSON.parse(text);
        setUnreadCount(data.unread_count || 0);
      } catch {
        console.error('Failed to parse JSON response:', text);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const fetchUnreadCount = useCallback(async () => {
    // Don't fetch if not authenticated or still loading auth state
    if (!isAuthenticated || authLoading) return;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const res = await fetch('http://localhost:8080/notifications/unread-count', {
        credentials: 'include',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unread_count || 0);
      } else if (res.status === 401) {
        // Handle unauthorized - user session might have expired
  // ...existing code...
        setUnreadCount(0);
      } else if (res.status === 404) {
        // Notification endpoint might not be implemented yet
  // ...existing code...
        setUnreadCount(0);
      } else {
        console.error('Failed to fetch unread count:', res.status, res.statusText);
        setUnreadCount(0);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching unread count:', error);
      }
      setUnreadCount(0);
    }
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchUnreadCount(); // Fetch immediately, no delay
      const interval = setInterval(fetchUnreadCount, 60000); // Poll every minute as fallback
      return () => {
        clearInterval(interval);
      };
    } else {
      // Reset state when not authenticated
      setNotifications([]);
      setUnreadCount(0);
      setShowDropdown(false);
    }
  }, [isAuthenticated, authLoading, fetchUnreadCount]);

  // WebSocket integration for real-time notifications
  useEffect(() => {
    if (!onMessage || !wsConnected || !isAuthenticated) return;

    // Listen for notification count updates (most efficient)
    onMessage('notification_count_update', (data: { unread_count: number }) => {
      setUnreadCount(data.unread_count || 0);
    });

    // Listen for new notifications
    onMessage('new_notification', (data: Notification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
      if (showDropdown) {
        fetchNotifications();
      }
    });

    // Listen for follow requests (real-time)
    onMessage('follow_request', (data: Notification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
      if (showDropdown) {
        fetchNotifications();
      }
    });

    // Listen for follow accepted notifications
    onMessage('follow_accepted', (data: Notification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
      if (showDropdown) {
        fetchNotifications();
      }
    });

    // Listen for post interactions (likes, comments)
    onMessage('post_like', (data: Notification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
      if (showDropdown) {
        fetchNotifications();
      }
    });

    onMessage('post_comment', (data: Notification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
      if (showDropdown) {
        fetchNotifications();
      }
    });

    // Listen for group notifications
    onMessage('group_invitation', (data: Notification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
      if (showDropdown) {
        fetchNotifications();
      }
    });

    onMessage('group_join_request', (data: Notification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
      if (showDropdown) {
        fetchNotifications();
      }
    });

  }, [onMessage, wsConnected, isAuthenticated, showDropdown]);

  const fetchNotifications = async () => {
    // Don't fetch if not authenticated or still loading auth state
    if (!isAuthenticated || authLoading) return;
    
    setFetchLoading(true);
    try {
      const res = await fetch('http://localhost:8080/notifications?limit=20', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const notificationList = Array.isArray(data) ? data : [];
        setNotifications(notificationList);
        
        // Update unread count based on fetched notifications
        const unreadCountFromList = notificationList.filter((n: Notification) => !n.is_read).length;
        setUnreadCount(unreadCountFromList);
      } else if (res.status === 401) {
  // ...existing code...
        setNotifications([]);
        setUnreadCount(0);
      } else if (res.status === 404) {
  // ...existing code...
        setNotifications([]);
        setUnreadCount(0);
      } else {
        console.error('Failed to fetch notifications:', res.status, res.statusText);
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setFetchLoading(false);
    }
  };

  const markAsRead = async (notificationId: number) => {
    try {
      const res = await fetch(`http://localhost:8080/notifications/${notificationId}/read`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (res.ok) {
        setNotifications(prev =>
          (prev || []).map(notif =>
            notif.id === notificationId ? { ...notif, is_read: true } : notif
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('http://localhost:8080/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setNotifications(prev =>
          (prev || []).map(notif => ({ ...notif, is_read: true }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleFollowRequest = async (followerID: number, action: 'accept' | 'reject', notificationId: number) => {
    try {
      const res = await fetch(`http://localhost:8080/follow-requests/${followerID}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        // Update notification to show the action taken
        setNotifications(prev =>
          (prev || []).map(notif => 
            notif.id === notificationId 
              ? { 
                  ...notif, 
                  type: `follow_request_${action}ed`,
                  title: `Follow Request ${action === 'accept' ? 'Accepted' : 'Rejected'}`,
                  message: `You ${action}ed this follow request`,
                  is_read: true
                }
              : notif
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        
        // Refresh unread count to be sure
        safelyFetchUnreadCount();
      } else {
        console.error('Failed to handle follow request');
      }
    } catch (error) {
      console.error('Error handling follow request:', error);
    }
  };

  const handleGroupInvitation = async (groupId: number, action: 'accept' | 'reject', notificationId: number) => {
    try {
      const res = await fetch(`http://localhost:8080/groups/${groupId}/${action}-invite`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        // Update notification to show the action taken
        setNotifications(prev =>
          (prev || []).map(notif => 
            notif.id === notificationId 
              ? { 
                  ...notif, 
                  type: `group_invitation_${action}ed`,
                  title: `Group Invitation ${action === 'accept' ? 'Accepted' : 'Rejected'}`,
                  message: `You ${action}ed this group invitation`,
                  is_read: true
                }
              : notif
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        
        // Refresh unread count to be sure
        safelyFetchUnreadCount();
        
        if (action === 'accept') {
          // Show success message
          alert('Group invitation accepted!');
        }
      } else {
        console.error('Failed to handle group invitation');
        alert('Failed to handle group invitation');
      }
    } catch (error) {
      console.error('Error handling group invitation:', error);
      alert('Error handling group invitation');
    }
  };

  const handleJoinRequest = async (groupId: number, userId: number, action: 'accept' | 'refuse', notificationId: number) => {
    try {
      const res = await fetch(`http://localhost:8080/groups/${groupId}/handle-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: userId,
          action: action
        })
      });

      if (res.ok) {
        // Update notification to show the action taken
        setNotifications(prev =>
          (prev || []).map(notif => 
            notif.id === notificationId 
              ? { 
                  ...notif, 
                  type: `group_join_request_${action}d`,
                  title: `Group Join Request ${action === 'accept' ? 'Accepted' : 'Rejected'}`,
                  message: `You ${action}d this join request`,
                  is_read: true
                }
              : notif
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        
        // Refresh unread count to be sure
        safelyFetchUnreadCount();
        
        if (action === 'accept') {
          // Show success message
          alert('Join request accepted!');
        } else {
          alert('Join request rejected!');
        }
      } else {
        console.error('Failed to handle join request');
        alert('Failed to handle join request');
      }
    } catch (error) {
      console.error('Error handling join request:', error);
      alert('Error handling join request');
    }
  };

  const handleBellClick = () => {
    setShowDropdown(!showDropdown);
    if (!showDropdown) {
      fetchNotifications();
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'follow_request':
        return '👤';
      case 'follow_accepted':
      case 'follow_request_accepted':
        return '✅';
      case 'follow_request_rejected':
        return '❌';
      case 'group_invitation':
        return '📨';
      case 'group_invitation_accepted':
        return '✅';
      case 'group_invitation_rejected':
        return '❌';
      case 'group_join_request':
        return '🚪';
      case 'group_join_request_accepted':
        return '✅';
      case 'group_join_request_rejected':
        return '❌';
      case 'group_invite':
        return '📨';
      case 'group_request':
        return '🏷️';
      case 'group_event':
        return '📅';
      case 'post_like':
        return '❤️';
      case 'post_comment':
        return '💬';
      case 'message':
        return '💌';
      default:
        return '🔔';
    }
  };

  if (!isAuthenticated || authLoading) return null;

  // Portal dropdown root
  const dropdownRoot = typeof window !== 'undefined' ? document.body : null;

  // Dropdown content
  const dropdownContent = showDropdown && (
    <>
      {/* Overlay to close dropdown on click outside */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={() => setShowDropdown(false)}
        style={{ pointerEvents: 'auto' }}
      ></div>
      <div
        className="fixed right-4 top-14 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999] max-h-96 overflow-hidden"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="max-h-80 overflow-y-auto">
          {fetchLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No notifications</div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 border-b border-gray-100 hover:bg-gray-50 ${
                  !notification.is_read ? 'bg-blue-50' : ''
                } relative`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {notification.title}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                    {/* Action buttons for follow requests */}
                    {notification.type === 'follow_request' && notification.related_id && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFollowRequest(notification.related_id!, 'accept', notification.id);
                          }}
                          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFollowRequest(notification.related_id!, 'reject', notification.id);
                          }}
                          className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {/* Action buttons for group invitations */}
                    {notification.type === 'group_invitation' && notification.related_id && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGroupInvitation(notification.related_id!, 'accept', notification.id);
                          }}
                          className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGroupInvitation(notification.related_id!, 'reject', notification.id);
                          }}
                          className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {/* Action buttons for group join requests */}
                    {notification.type === 'group_join_request' && notification.related_id && notification.actor_id && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinRequest(notification.related_id!, notification.actor_id!, 'accept', notification.id);
                          }}
                          className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinRequest(notification.related_id!, notification.actor_id!, 'refuse', notification.id);
                          }}
                          className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  {!notification.is_read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  )}
                </div>
                {/* Click to mark as read (only if not a follow request or group invitation with actions) */}
                {!['follow_request', 'group_invitation', 'group_join_request'].includes(notification.type) && !notification.is_read && (
                  <div
                    className="absolute inset-0 cursor-pointer"
                    onClick={() => markAsRead(notification.id)}
                  />
                )}
              </div>
            ))
          )}
        </div>
        {/* Footer */}
        {notifications && notifications.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 text-center">
            <button
              onClick={() => setShowDropdown(false)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="relative">
      {/* Bell Icon */}
      <button
        onClick={handleBellClick}
        className="relative p-2 text-gray-600 hover:text-gray-800 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {/* Portal for dropdown */}
      {dropdownRoot && showDropdown && ReactDOM.createPortal(dropdownContent, dropdownRoot)}
    </div>
  );
}
