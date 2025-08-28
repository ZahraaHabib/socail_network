"use client";
// Handle group invitation (accept/decline)
export const handleGroupInvitation = async (
  groupId: number,
  action: 'accept' | 'decline',
  onSuccess?: () => void,
  onError?: (msg: string) => void
) => {
  try {
    const response = await fetch(`http://localhost:8080/groups/${groupId}/invitation/${action}`, {
      method: 'POST',
      credentials: 'include',
    });
    if (response.ok) {
      if (onSuccess) onSuccess();
    } else {
      const msg = `Failed to ${action} invitation`;
      if (onError) onError(msg);
      else alert(msg);
    }
  } catch (error) {
    console.error('Error handling group invitation:', error);
    if (onError) onError('Error handling group invitation');
    else alert('Error handling group invitation');
  }
};

// ...existing code...
import UserLink from '../../components/UserLink';
// Ensure consistent import of the Group type
// Ensure the correct path to the Group type definition
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import MessagePopupNotifications from '../../components/MessagePopupNotifications';
import GroupChat from '../../components/GroupChat';
import Image from 'next/image';

type Group = {
  id: number;
  title: string;
  description: string;
  creator_id: number;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
  is_creator?: boolean;
  creator_name?: string;
};

type GroupPost = {
  id: number;
  group_id: number;
  user_id: number;
  author_username: string;
  author_avatar?: string;
  content: string;
  created_at: string;
  comment_count: number;
  like_count?: number;
  dislike_count?: number;
  user_like_status?: 'like' | 'dislike' | null;
  _temp?: boolean;
};

type PostComment = {
  id: number;
  post_id: number;
  user_id: number;
  author_username: string;
  author_avatar?: string;
  content: string;
  created_at: string;
};

type GroupEvent = {
  id: number;
  group_id: number;
  creator_id: number;
  title: string;
  description: string;
  event_time: string;
  created_at: string;
  going_count?: number;
  not_going_count?: number;
  user_response?: 'going' | 'not_going' | null; // Optional property
};

type GroupMember = {
  id: number;
  username: string;
  avatar: string;
  role: 'creator' | 'member';
};

type User = {
  id: number;
  username: string;
  avatar: string;
};

type GroupTab = 'chat' | 'posts' | 'events' | 'members';
type MainView = 'my-groups' | 'browse-groups' | 'group-detail';

export default function GroupsPage() {
  // Like/dislike handler for group posts
  const handleLikeDislike = async (postId: number, action: 'like' | 'dislike') => {
    if (!selectedGroup) return;
    setGroupPosts((prevPosts: GroupPost[]) => prevPosts.map((post: GroupPost) => {
      if (post.id !== postId) return post;
      let like_count = post.like_count || 0;
      let dislike_count = post.dislike_count || 0;
      const user_like_status = post.user_like_status || null;
      if (user_like_status === 'like') like_count--;
      if (user_like_status === 'dislike') dislike_count--;
      if (action === 'like') like_count++;
      if (action === 'dislike') dislike_count++;
      return {
        ...post,
        like_count,
        dislike_count,
        user_like_status: action
      };
    }));
    try {
      await fetch(`http://localhost:8080/groups/${selectedGroup.id}/posts/${postId}/${action}`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Error liking/disliking post:', error);
    }
  };
  // All state, handlers, and logic must be inside this function
  // ...existing code...

  // Delete post handler
  const handleDeletePost = async (postId: number) => {
    if (!selectedGroup) return;
    try {
      const response = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/posts/${postId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        setGroupPosts((prev: GroupPost[]) => prev.filter((post: GroupPost) => post.id !== postId));
      } else {
        alert('Failed to delete post');
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Error deleting post');
    }
  };
  const { isAuthenticated, loading, wsConnected, onMessage, sendGroupMessage } = useAuth();

  // State for groups and navigation
  const [mainView, setMainView] = useState<MainView>('my-groups');
  const [activeTab, setActiveTab] = useState<GroupTab>('chat');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // Groups state
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(true);

  // Group content state
  const [groupPosts, setGroupPosts] = useState<GroupPost[]>([]);
  const [groupEvents, setGroupEvents] = useState<GroupEvent[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [postComments, setPostComments] = useState<Record<number, PostComment[]>>({});
  // Group chat state
  type GroupMessage = {
    id: number;
    group_id: number;
    sender_id: number;
    username: string;
    content: string;
    created_at: string;
    sent_at: string;
  };

  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);

  // UI state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showInviteUsers, setShowInviteUsers] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  // Form state
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newCommentContent, setNewCommentContent] = useState<Record<number, string>>({});
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [selectedUsersToInvite, setSelectedUsersToInvite] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || loading) return;

    const fetchUserData = async () => {
      try {
        // Get the current user ID
        const userResponse = await fetch('http://localhost:8080/v2/users/me', {
          credentials: 'include'
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUserId(userData.user.id);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    const fetchMyGroups = async () => {
      try {
        // Use the new dedicated endpoint for user's groups
        const groupsResponse = await fetch('http://localhost:8080/groups/my', {
          credentials: 'include'
        });

        if (groupsResponse.ok) {
          const groupsData = await groupsResponse.json();
          setMyGroups(groupsData || []);

          // Auto-select first group if available
          if (groupsData && groupsData.length > 0) {
            setSelectedGroup(groupsData[0]);
          }
        } else {
          console.error('Failed to fetch groups');
        }
      } catch (error) {
        console.error('Error fetching groups:', error);
      } finally {
        setGroupsLoading(false);
      }
    };

    fetchUserData();
    fetchMyGroups();
  }, [isAuthenticated, loading]);

  // Fetch group content when a group is selected
  useEffect(() => {
    if (!selectedGroup) return;

    const fetchGroupContent = async () => {
      try {
        // Fetch posts
        try {
          const postsResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/posts`, {
            credentials: 'include'
          });
          if (postsResponse.ok) {
            const postsData = await postsResponse.json();
            setGroupPosts(postsData || []);
          } else {
            setGroupPosts([]);
          }
        } catch {
          setGroupPosts([]);
        }

        // Fetch events
        try {
          const eventsResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/events`, {
            credentials: 'include'
          });
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            setGroupEvents(eventsData || []);
          } else {
            setGroupEvents([]);
          }
        } catch {
          setGroupEvents([]);
        }

        // Fetch members
        let membersData = [];
        try {
          const membersResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/members`, {
            credentials: 'include'
          });
          if (membersResponse.ok) {
            membersData = await membersResponse.json();
          }
        } catch {
          membersData = [];
        }

        // Fetch online member IDs
        let onlineUserIds: number[] = [];
        try {
          const onlineResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/online-members`, {
            credentials: 'include'
          });
          if (onlineResponse.ok) {
            const onlineData = await onlineResponse.json();
            onlineUserIds = onlineData.online_user_ids || [];
          }
        } catch { }

        // Merge online status into groupMembers
        const mergedMembers = (membersData || []).map((member: GroupMember) => ({
          ...member,
          online: onlineUserIds.includes(member.id),
        }));
        // Debug log for merged group members
        console.log('[GroupsPage] mergedMembers:', mergedMembers);
        setGroupMembers(mergedMembers);

        // Fetch chat messages
        try {
          const messagesResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/messages`, {
            credentials: 'include'
          });
          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            setGroupMessages(messagesData || []);
          } else {
            setGroupMessages([]);
          }
        } catch {
          setGroupMessages([]);
        }
      } catch (error) {
        console.error('Error fetching group content:', error);
      }
    };

    fetchGroupContent();
  }, [selectedGroup]);

  // Functions for group management
  const createGroup = async () => {
    if (!newGroupTitle.trim() || !newGroupDescription.trim()) return;

    try {
      const response = await fetch('http://localhost:8080/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newGroupTitle.trim(),
          description: newGroupDescription.trim()
        })
      });

      if (response.ok) {
        const newGroup = await response.json();
        setMyGroups(prev => [newGroup, ...prev]);
        setNewGroupTitle('');
        setNewGroupDescription('');
        setShowCreateGroup(false);
        setSelectedGroup(newGroup);
      } else {
        alert('Failed to create group');
      }
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Error creating group');
    }
  };

  const joinGroup = async (groupId: number) => {
    try {
      const response = await fetch(`http://localhost:8080/groups/${groupId}/request`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        // Refresh groups
        fetchAllGroups();
        alert('Join request sent successfully');
      } else {
        alert('Failed to send join request');
      }
    } catch (error) {
      console.error('Error joining group:', error);
      alert('Error joining group');
    }
  };

  const fetchAllGroups = async () => {
    try {
      const response = await fetch('http://localhost:8080/groups', {
        credentials: 'include'
      });

      if (response.ok) {
        const groupsData = await response.json();
        setAllGroups(groupsData || []);
      }
    } catch (error) {
      console.error('Error fetching all groups:', error);
    }
  };

  const createPost = async () => {
    if (!selectedGroup || !newPostContent.trim()) return;

    try {
      const response = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newPostContent.trim() })
      });

      if (response.ok) {
        // Do not fetch posts; let the real-time event update the UI
        setNewPostContent('');
        setShowCreatePost(false);
      } else {
        alert('Failed to create post');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Error creating post');
    }
  };

  const createEvent = async () => {
    if (!selectedGroup || !newEventTitle.trim() || !newEventDescription.trim() || !newEventDate) return;

    // Convert the datetime-local value to ISO8601 string (with seconds and Z for UTC)
    let isoEventTime = '';
    try {
      // newEventDate is in 'YYYY-MM-DDTHH:mm' (local time)
      const date = new Date(newEventDate);
      if (isNaN(date.getTime())) {
        alert('Invalid date/time');
        return;
      }
      isoEventTime = date.toISOString(); // 'YYYY-MM-DDTHH:mm:ss.sssZ'
    } catch {
      alert('Invalid date/time');
      return;
    }

    try {
      const response = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newEventTitle.trim(),
          description: newEventDescription.trim(),
          event_time: isoEventTime
        })
      });

      if (response.ok) {
        // Instead of using the returned event, fetch the full event list for this group
        const eventsResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/events`, {
          credentials: 'include'
        });
        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json();
          setGroupEvents(eventsData || []);
        }
        setNewEventTitle('');
        setNewEventDescription('');
        setNewEventDate('');
        setShowCreateEvent(false);
      } else {
        alert('Failed to create event');
      }
    } catch (error) {
      console.error('Error creating event:', error);
      alert('Error creating event');
    }
  };

  const respondToEvent = async (eventId: number, response: 'going' | 'not_going') => {
    try {
      if (!selectedGroup) return;
      // Convert 'not_going' to 'not going' for backend compatibility
      const backendResponse = response === 'not_going' ? 'not going' : response;
      const apiResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ response: backendResponse })
      });

      if (apiResponse.ok) {
        // Re-fetch the events to update RSVP counts and user_response
        const eventsResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/events`, {
          credentials: 'include'
        });
        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json();
          setGroupEvents(eventsData || []);
        }
      } else {
        alert('Failed to respond to event');
      }
    } catch (error) {
      console.error('Error responding to event:', error);
      alert('Error responding to event');
    }
  };

  const addComment = async (postId: number) => {
    const content = newCommentContent[postId];
    if (!content?.trim() || !selectedGroup) return;

    try {
      const response = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: content.trim() })
      });

      if (response.ok) {
        // Fetch the updated comments list to get all fields (created_at, username, etc)
        const commentsResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/posts/${postId}/comments`, {
          credentials: 'include'
        });
        if (commentsResponse.ok) {
          const commentsData = await commentsResponse.json();
          setPostComments(prev => ({
            ...prev,
            [postId]: commentsData || []
          }));
        }
        setNewCommentContent(prev => ({ ...prev, [postId]: '' }));
      } else {
        alert('Failed to add comment');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Error adding comment');
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const response = await fetch('http://localhost:8080/users/available-for-invite', {
        credentials: 'include'
      });

      if (response.ok) {
        const usersData = await response.json();
        setAvailableUsers(usersData || []);
      }
    } catch (error) {
      console.error('Error fetching available users:', error);
    }
  };

  const inviteUsers = async () => {
    if (!selectedGroup || selectedUsersToInvite.size === 0) return;

    try {
      // Send individual invitations for each selected user
      const invitePromises = Array.from(selectedUsersToInvite).map(userId =>
        fetch(`http://localhost:8080/groups/${selectedGroup.id}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            user_id: userId
          })
        })
      );

      const responses = await Promise.all(invitePromises);
      const allSuccessful = responses.every(response => response.ok);

      if (allSuccessful) {
        setSelectedUsersToInvite(new Set());
        setShowInviteUsers(false);
        alert('Invitations sent successfully');
      } else {
        alert('Some invitations failed to send');
      }
    } catch (error) {
      console.error('Error sending invitations:', error);
      alert('Error sending invitations');
    }
  };

  const toggleComments = async (postId: number) => {
    const isExpanded = expandedComments.has(postId);
    if (!isExpanded && selectedGroup) {
      // Fetch comments for this post
      try {
        const response = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/posts/${postId}/comments`, {
          credentials: 'include'
        });
        if (response.ok) {
          const commentsData = await response.json();
          setPostComments(prev => ({
            ...prev,
            [postId]: commentsData || []
          }));
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
      }
    }

    setExpandedComments(prev => {
      const newSet = new Set(prev);
      if (isExpanded) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (!onMessage || !wsConnected) return;

    // Real-time: Listen for new group creation (for browse page)
    onMessage('group_created', (data: Group) => {
      setAllGroups(prev => {
        if (prev.some(g => g.id === data.id)) return prev;
        return [data, ...prev];
      });
    });

    if (!selectedGroup) return;

    // Real-time: Listen for new group posts
    onMessage('group_post_created', (data: { id: number; group_id: number; content: string; created_at: string; user_id: number; author_username: string }) => {
      if (data.group_id !== selectedGroup.id) return;
      setGroupPosts(prev => {
        // Avoid duplicate
        if (prev.some(p => p.id === data.id)) return prev;
        return [
          {
            ...data,
            comment_count: 0 // Ensure required property is included
            ,
            like_count: 0,
            dislike_count: 0,
            user_like_status: null,
          },
          ...prev,
        ];
      });
    });

    // Real-time: Listen for new group post comments
    onMessage('group_post_comment_created', async (data: { post_id: number; id: number; content: string; created_at: string; user_id: number; author_username: string }) => {
      // Only update if the post is in this group
      const postId = data.post_id;
      setPostComments(prev => {
        const prevComments = prev[postId] || [];
        if (prevComments.some(c => c.id === data.id)) return prev;
        return { ...prev, [postId]: [...prevComments, data] };
      });
      // Optionally increment comment_count for the post
      setGroupPosts(prev => prev.map(post =>
        post.id === postId ? { ...post, comment_count: (post.comment_count || 0) + 1 } : post
      ));

      // If the comment author is not in groupMembers, fetch latest members and update the comment with author info
      if (!groupMembers.some(m => m.id === data.user_id)) {
        try {
          const membersResponse = await fetch(`http://localhost:8080/groups/${selectedGroup.id}/members`, { credentials: 'include' });
          if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            setGroupMembers(membersData || []);
            // After updating group members, update the comment in postComments with author info
            setPostComments(prev => {
              const prevComments = prev[postId] || [];
              // Find the author in the new members list
              const author = (membersData || []).find((m: GroupMember) => m.id === data.user_id);
              // Update the last comment (the new one) with author info if available
              const updatedComments = prevComments.map(c => {
                if (c.id === data.id) {
                  return {
                    ...c,
                    author_username: author?.username || c.author_username,
                    author_avatar: author?.avatar || c.author_avatar,
                  };
                }
                return c;
              });
              return { ...prev, [postId]: updatedComments };
            });
          }
        } catch {
          // Ignore fetch error
        }
      }
    });

    // Real-time: Listen for new group events
    onMessage('group_event_created', (data: { id: number; group_id: number; title: string; description: string; event_time: string; created_at: string; creator_id: number }) => {
      if (data.group_id !== selectedGroup.id) return;
      setGroupEvents(prev => {
        if (prev.some(e => e.id === data.id)) return prev;
        return [
          {
            ...data,
            creator_id: typeof data.creator_id === 'number' ? data.creator_id : 0,
            going_count: 0, // Default value since 'going_count' is not in the response
            not_going_count: 0, // Default value since 'not_going_count' is not in the response
            user_response: null, // Default to null since 'user_response' is not part of the 'data' object
          } as GroupEvent,
          ...prev,
        ];
      });
    });

    // Real-time: Listen for RSVP updates
    onMessage('group_event_rsvp_updated', () => {
      // Optionally, re-fetch events or update RSVP counts in state
      // For simplicity, re-fetch events for this group
      fetch(`http://localhost:8080/groups/${selectedGroup.id}/events`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : [])
        .then(events => setGroupEvents(events || []));
    });

    // Real-time: Listen for new member joined
    onMessage('group_member_joined', () => {
      // Optionally, re-fetch members for this group
      fetch(`http://localhost:8080/groups/${selectedGroup.id}/members`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : [])
        .then(members => setGroupMembers(members || []));
    });
  }, [onMessage, wsConnected, selectedGroup, groupMembers]);

  if (loading) {
    return (
      <>
        <Header />
        <MessagePopupNotifications
          allGroups={allGroups}
          setSelectedGroup={group => setSelectedGroup(group as Group | null)}
          setActiveTab={setActiveTab}
        />
        <div className="p-8 text-center text-black">Loading...</div>
      </>
    );
  }

  return (
    <>
      <Header />
      <MessagePopupNotifications
  allGroups={allGroups}
  setSelectedGroup={group => setSelectedGroup(group as Group)}
  setActiveTab={setActiveTab}
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="flex">
          {/* Sidebar Navigation */}
          <div className="w-64 bg-white h-screen shadow-lg p-6 flex flex-col border-r border-gray-200">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Groups</h1>
              <p className="text-gray-600 text-sm">Connect, collaborate, and share with your communities</p>
            </div>
            
            <div className="space-y-3 mb-8">
              <button
                onClick={() => {
                  setMainView('my-groups');
                  setSelectedGroup(null);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all duration-200 ${mainView === 'my-groups' && !selectedGroup
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📚 My Groups
              </button>
              <button
                onClick={() => {
                  setMainView('browse-groups');
                  setSelectedGroup(null);
                  fetchAllGroups();
                }}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all duration-200 ${mainView === 'browse-groups'
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🔍 Browse Groups
              </button>
            </div>
            
            <button
              onClick={() => setShowCreateGroup(true)}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 font-medium"
            >
              ➕ Create Group
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6">
            {/* Back button when viewing group details */}
            {selectedGroup && (
              <button
                onClick={() => {
                  setSelectedGroup(null);
                  setMainView('my-groups');
                }}
                className="flex items-center text-blue-600 hover:text-blue-800 mb-6 font-medium"
              >
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Groups
              </button>
            )}

            {/* Group Detail View */}
            {selectedGroup ? (
              <div className="bg-white rounded-lg shadow-lg border border-blue-200">
                {/* Group Header */}
                <div className="p-4 border-b border-gray-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-semibold text-black">{selectedGroup.title || 'Untitled Group'}</h3>
                      <p className="text-gray-600 mt-1">{selectedGroup.description || 'No description available'}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {groupMembers.length} members
                      </p>
                    </div>
                    {currentUserId && selectedGroup.creator_id === currentUserId && (
                      <button
                        onClick={() => {
                          setShowInviteUsers(true);
                          fetchAvailableUsers();
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                      >
                        Invite Users
                      </button>
                    )}
                  </div>

                  {/* Tab Navigation */}
                  <div className="flex gap-1 mt-4">
                    {(['chat', 'posts', 'events', 'members'] as GroupTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg font-medium transition capitalize ${activeTab === tab
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Content */}
                <div className="p-4">
                  {/* Chat Tab */}
                  {activeTab === 'chat' && (
                    <GroupChat
                      groupId={selectedGroup.id}
                      currentUserId={currentUserId!}
                      isConnected={wsConnected}
                      onMessage={onMessage}
                      sendGroupMessage={sendGroupMessage}
                      messages={groupMessages}
                      groupMembers={groupMembers}
                    />
                  )}

                  {/* Posts Tab */}
                  {activeTab === 'posts' && (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-xl font-bold text-blue-700 tracking-tight">Group Posts</h4>
                        <button
                          onClick={() => setShowCreatePost(true)}
                          className="px-5 py-2 bg-gradient-to-r from-green-400 to-green-600 text-white rounded-xl shadow hover:from-green-500 hover:to-green-700 transition font-semibold"
                        >
                          Create Post
                        </button>
                      </div>
                      <div className="space-y-6">
                        {groupPosts.map((post, idx) => {
                          const key = (typeof post.id === 'number' && post.id > 0)
                            ? `post-${post.id}`
                            : `temp-post-${post._temp ? post.id : idx}`;
                          const postAuthor = groupMembers.find(m => m.id === post.user_id);
                          let avatarSrc = postAuthor?.avatar || post.author_avatar || '/default-avatar.png';
                          if (avatarSrc && avatarSrc !== '/default-avatar.png' && avatarSrc.startsWith('/')) {
                            avatarSrc = `http://localhost:8080${avatarSrc}`;
                          }
                          return (
                            <div key={key} className="bg-gradient-to-br from-blue-50 via-white to-purple-50 border border-blue-100 rounded-3xl shadow-lg p-0 overflow-hidden">
                              <div className="flex items-start justify-between p-6 pb-2">
                                <div className="flex items-center gap-4">
                                  <Image
                                    src={avatarSrc}
                                    alt={post.author_username ? `Avatar of ${post.author_username}` : 'User avatar'}
                                    width={56}
                                    height={56}
                                    className="w-14 h-14 rounded-full object-cover border-2 border-blue-200 shadow"
                                    unoptimized={avatarSrc.endsWith('.gif')}
                                  />
                                  <div>
                                    <div className="font-bold text-gray-900 text-lg leading-tight">{post.author_username}</div>
                                    <div className="text-xs text-blue-500 -mt-0.5 font-semibold">@{postAuthor?.username || post.author_username}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">{new Date(post.created_at).toLocaleString()}</div>
                                  </div>
                                </div>
                                {(currentUserId === post.user_id || currentUserId === selectedGroup?.creator_id) && (
                                  <button
                                    onClick={() => handleDeletePost(post.id)}
                                    className="ml-2 p-2 rounded-full hover:bg-red-100 transition group"
                                    title="Delete post"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="w-6 h-6 text-red-400 group-hover:text-red-600"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                              <div className="px-6 pb-2 pt-1">
                                <p className="text-gray-900 text-lg mb-4 break-words font-medium">{post.content}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 px-6 pb-4">
                                <button
                                  onClick={() => handleLikeDislike(post.id, 'like')}
                                  className="flex items-center gap-2 px-5 py-2 rounded-full font-semibold transition-all bg-white text-blue-600 hover:bg-blue-100 border border-blue-200 shadow-sm"
                                  title="Like"
                                >
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                                  </svg>
                                  <span>{post.like_count ?? 0}</span>
                                </button>
                                <button
                                  onClick={() => handleLikeDislike(post.id, 'dislike')}
                                  className="flex items-center gap-2 px-5 py-2 rounded-full font-semibold transition-all bg-white text-red-600 hover:bg-red-100 border border-red-200 shadow-sm"
                                  title="Dislike"
                                >
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" style={{ transform: 'rotate(180deg)' }}>
                                    <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                                  </svg>
                                  <span>{post.dislike_count ?? 0}</span>
                                </button>
                                <button
                                  onClick={() => toggleComments(post.id)}
                                  className="flex items-center gap-1 px-5 py-2 rounded-full border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 transition text-base font-semibold shadow-sm"
                                >
                                  <span className="text-xl">💬</span> Show Comments ({post.comment_count})
                                </button>
                              </div>
                              {expandedComments.has(post.id) && (
                                <div className="mt-2 mb-4 px-6 space-y-3">
                                  {postComments[post.id]?.map((comment) => {
                                    const commentAuthor = groupMembers.find(m => m.id === comment.user_id);
                                    return (
                                      <div key={comment.id || comment.created_at || Math.random()} className="flex gap-2 items-start bg-gradient-to-r from-blue-100 via-white to-purple-100 border-l-4 border-blue-300 p-3 rounded-xl">
                                        <UserLink
                                          userId={comment.user_id}
                                          username={comment.author_username}
                                          avatar={commentAuthor?.avatar}
                                          showAvatar={true}
                                          avatarSize={32}
                                          className="font-semibold text-gray-900 truncate mt-1"
                                          isCurrentUser={currentUserId === comment.user_id}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-sm text-blue-800">{comment.author_username}</span>
                                            <span className="text-xs text-gray-500">{new Date(comment.created_at).toLocaleString()}</span>
                                          </div>
                                          <p className="text-sm text-gray-800 break-words font-medium">{comment.content}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  <div className="flex gap-2 mt-2">
                                    <input
                                      type="text"
                                      value={newCommentContent[post.id] || ''}
                                      onChange={(e) => setNewCommentContent(prev => ({
                                        ...prev,
                                        [post.id]: e.target.value
                                      }))}
                                      placeholder="Add a comment..."
                                      className="flex-1 px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          addComment(post.id);
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() => addComment(post.id)}
                                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold shadow"
                                    >
                                      Comment
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {groupPosts.length === 0 && (
                          <div className="text-center text-blue-400 py-8 font-semibold text-lg">
                            No posts yet. Be the first to post!
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Events Tab */}
                  {activeTab === 'events' && (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-xl font-bold text-purple-700 tracking-tight">Group Events</h4>
                        <button
                          onClick={() => setShowCreateEvent(true)}
                          className="px-5 py-2 bg-gradient-to-r from-purple-400 to-purple-600 text-white rounded-xl shadow hover:from-purple-500 hover:to-purple-700 transition font-semibold"
                        >
                          Create Event
                        </button>
                      </div>
                      <div className="space-y-6">
                        {groupEvents.map((event) => (
                          <div key={event.id} className="bg-gradient-to-br from-purple-50 via-white to-blue-50 border border-purple-200 rounded-3xl p-6 shadow-lg">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h5 className="font-bold text-purple-800 text-lg">{event.title}</h5>
                                <p className="text-gray-800 font-medium mt-1">{event.description}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                  {new Date(event.event_time).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-3 mt-4">
                              <button
                                onClick={() => respondToEvent(event.id, 'going')}
                                className={`px-5 py-2 rounded-full font-semibold shadow transition text-base ${event.user_response === 'going'
                                  ? 'bg-green-500 text-white'
                                  : 'bg-white text-green-700 border border-green-300 hover:bg-green-50'
                                  }`}
                              >
                                ✅ Going ({event.going_count})
                              </button>
                              <button
                                onClick={() => respondToEvent(event.id, 'not_going')}
                                className={`px-5 py-2 rounded-full font-semibold shadow transition text-base ${event.user_response === 'not_going'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'
                                  }`}
                              >
                                ❌ Not Going ({event.not_going_count})
                              </button>
                            </div>
                          </div>
                        ))}
                        {groupEvents.length === 0 && (
                          <div className="text-center text-purple-400 py-8 font-semibold text-lg">
                            No events yet. Create the first event!
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Members Tab */}
                  {activeTab === 'members' && (
                    <div>
                      <h4 className="text-xl font-bold text-indigo-700 mb-4 tracking-tight">Group Members</h4>
                      <div className="space-y-4">
                        {groupMembers.map((member) => (
                          <div key={member.id} className="flex items-center gap-4 p-4 bg-gradient-to-r from-indigo-50 via-white to-blue-50 border border-indigo-200 rounded-2xl shadow">
                            <UserLink
                              userId={member.id}
                              username={member.username}
                              avatar={member.avatar}
                              showAvatar={true}
                              avatarSize={44}
                              className="font-bold text-gray-900 truncate"
                              isCurrentUser={currentUserId === member.id}
                            />
                            <div className="flex-1">
                              <div className="font-bold text-indigo-800 text-base">{member.username || 'Unknown'}</div>
                              <div className="text-sm text-gray-500 font-medium">@{member.username || 'unknown'}</div>
                            </div>
                            <div className="text-sm font-semibold text-indigo-500">
                              {member.role === 'creator' ? '👑 Creator' : 'Member'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Browse Groups View or My Groups List View */
              <div className="flex gap-6">
                {/* Welcome message when no group is selected */}
                {mainView === 'my-groups' && (
                  <div className="flex-1 bg-white rounded-lg shadow-lg border border-blue-200 p-8 text-center text-gray-600">
                    <div className="text-6xl mb-4">👥</div>
                    <div className="text-xl mb-2">Welcome to Groups!</div>
                    <div className="text-sm">
                      Select a group from the list to get started.
                    </div>
                  </div>
                )}

                {/* Groups List on the Right Side */}
                <div className="w-80">
                  {mainView === 'my-groups' && (
                    <div className="bg-white rounded-lg shadow-lg border border-blue-200 p-4">
                      <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Groups</h2>
                      {groupsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                        </div>
                      ) : myGroups.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          No groups found. Create or join a group to get started!
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {myGroups.map((group) => (
                            <button
                              key={group.id}
                              onClick={() => {
                                setSelectedGroup(group);
                              }}
                              className="w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition border border-gray-200 hover:border-blue-200"
                            >
                              <div className="font-medium text-gray-800">{group.title || 'Untitled Group'}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                {group.member_count} members • {currentUserId === group.creator_id ? 'Owner' : 'Member'}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {mainView === 'browse-groups' && (
                    <div className="space-y-4">
                      <h2 className="text-lg font-semibold text-gray-800">Available Groups</h2>
                      {allGroups.filter(group => !group.is_member).map((group) => (
                        <div key={group.id} className="bg-white rounded-lg shadow-lg border border-blue-200 p-4">
                          <h3 className="font-semibold text-black">{group.title || 'Untitled Group'}</h3>
                          <p className="text-gray-600 mt-2">{group.description || 'No description available'}</p>
                          <div className="flex justify-between items-center mt-4">
                            <span className="text-sm text-gray-500">{group.member_count} members</span>
                            <button
                              onClick={() => joinGroup(group.id)}
                              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                            >
                              Request to Join
                            </button>
                          </div>
                        </div>
                      ))}

                      {allGroups.filter(group => !group.is_member).length === 0 && (
                        <div className="text-center text-gray-500 py-8">
                          {allGroups.length === 0
                            ? 'No public groups available.'
                            : 'You are already a member of all available groups!'
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create Group Modal */}
        {showCreateGroup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-blue-50 via-white to-purple-50 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-blue-200">
              <h3 className="text-2xl font-bold text-blue-700 mb-6 text-center">Create New Group</h3>
              <div className="space-y-5">
                <input
                  type="text"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  placeholder="Group title"
                  className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-lg font-semibold placeholder-blue-300"
                />
                <textarea
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  placeholder="Group description"
                  className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-base font-medium placeholder-blue-300 h-28 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button
                  onClick={() => setShowCreateGroup(false)}
                  className="px-5 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={createGroup}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl hover:from-blue-600 hover:to-blue-800 transition font-bold shadow"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Post Modal */}
        {showCreatePost && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-blue-50 via-white to-purple-50 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-blue-200">
              <h3 className="text-2xl font-bold text-blue-700 mb-6 text-center">Create New Post</h3>
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-base font-medium placeholder-blue-300 h-32 resize-none"
              />
              <div className="flex justify-end gap-3 mt-8">
                <button
                  onClick={() => setShowCreatePost(false)}
                  className="px-5 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={createPost}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl hover:from-blue-600 hover:to-blue-800 transition font-bold shadow"
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Event Modal */}
        {showCreateEvent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-purple-200">
              <h3 className="text-2xl font-bold text-purple-700 mb-6 text-center">Create New Event</h3>
              <div className="space-y-5">
                <input
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="Event title"
                  className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white text-lg font-semibold placeholder-purple-300"
                />
                <textarea
                  value={newEventDescription}
                  onChange={(e) => setNewEventDescription(e.target.value)}
                  placeholder="Event description"
                  className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white text-base font-medium placeholder-purple-300 h-24 resize-none"
                />
                <input
                  type="datetime-local"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white text-base font-medium placeholder-purple-300"
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button
                  onClick={() => setShowCreateEvent(false)}
                  className="px-5 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={createEvent}
                  className="px-6 py-2 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl hover:from-purple-600 hover:to-purple-800 transition font-bold shadow"
                >
                  Create Event
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Invite Users Modal */}
        {showInviteUsers && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4">Invite Users</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableUsers.map((user) => (
                  <label key={user.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      checked={selectedUsersToInvite.has(user.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedUsersToInvite);
                        if (e.target.checked) {
                          newSet.add(user.id);
                        } else {
                          newSet.delete(user.id);
                        }
                        setSelectedUsersToInvite(newSet);
                      }}
                      className="rounded"
                    />
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                      {user.username ? user.username.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{user.username || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">@{user.username || 'unknown'}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowInviteUsers(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={inviteUsers}
                  disabled={selectedUsersToInvite.size === 0}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Invites ({selectedUsersToInvite.size})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
