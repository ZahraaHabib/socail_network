import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from '../context/AuthContext';
import UserList from './UserList';

interface User {
  id: number;
  username: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  is_online?: boolean;
}

interface MessageResponse {
  id: number;
  sender_id: number;
  content: string;
  created_at: string;
  is_sent_by_viewer: boolean;
  status?: string;
}

interface PrivateMessagingProps {
  currentUserId: number;
}

const MESSAGE_LIMIT = 10;
const commonEmojis = ["😀", "😂", "😍", "👍", "🙏", "🎉", "😢", "😎", "🔥", "❤️", "😡", "🥳", "🤔", "😴", "😇", "🤩", "😱", "😅", "😜", "🤗", "💯"];

export default function PrivateMessaging({ currentUserId }: PrivateMessagingProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  // Store messages per userId to persist conversations
  const [messagesByUser, setMessagesByUser] = useState<{ [userId: number]: MessageResponse[] }>({});
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const unmountingRef = useRef(false);
  const lastSelectedUserRef = useRef<User | null>(null);

  // Use global WebSocket from AuthProvider
  const { wsConnected: isConnected, onMessage, sendMessage: wsSendMessage } = useAuth();
  // Fallback if wsSendMessage is null
  const safeSendMessage = wsSendMessage || (() => false);

  // Fetch users on mount
  useEffect(() => {
    async function fetchUsers() {
      try {
        // Example: fetch from chat users endpoint
        const response = await fetch('http://localhost:8080/chat/users', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setUsers(data);
        }
      } catch (error) {
        setUsers([]);
      }
    }
    fetchUsers();
  }, []);

  // Handle online/offline events
  useEffect(() => {
    if (!onMessage) return;
    onMessage('user_online', (data) => {
      setUsers(prev => prev.map(u => u.id === data.user_id ? { ...u, is_online: true } : u));
    });
    onMessage('user_offline', (data) => {
      setUsers(prev => prev.map(u => u.id === data.user_id ? { ...u, is_online: false } : u));
    });
  }, [onMessage]);

  // Helper for message status icon
  function getMessageStatusIcon(message: MessageResponse) {
    if (message.status === 'delivered') {
      return <span title="Delivered" className="text-green-500 ml-2">✔✔</span>;
    }
    if (message.status === 'sent') {
      return <span title="Sent" className="text-gray-400 ml-2">✔</span>;
    }
    return null;
  }

  // Load messages
  const loadMessages = async (userId: number, newOffset: number, prepend = false) => {
    setLoading(true);
    let prevScrollHeight = 0;
    let prevScrollTop = 0;
    if (prepend && messagesContainerRef.current) {
      prevScrollHeight = messagesContainerRef.current.scrollHeight;
      prevScrollTop = messagesContainerRef.current.scrollTop;
    }
    try {
      const response = await fetch(`http://localhost:8080/messages/${userId}?limit=${MESSAGE_LIMIT}&offset=${newOffset}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const loadedMessages = data.reverse();
        setMessagesByUser(prev => {
          const prevMsgs = prev[userId] || [];
          // Avoid duplicates by filtering out already loaded message IDs
          const prevIds = new Set(prevMsgs.map(m => m.id));
          const newMessages = loadedMessages.filter((m: MessageResponse) => !prevIds.has(m.id));
          const updated = prepend ? [...newMessages, ...prevMsgs] : loadedMessages;
          return { ...prev, [userId]: updated };
        });
        setMessages(prev => {
          const prevIds = new Set(prev.map(m => m.id));
          const newMessages = loadedMessages.filter((m: MessageResponse) => !prevIds.has(m.id));
          return prepend ? [...newMessages, ...prev] : loadedMessages;
        });
        setHasMore(data.length === MESSAGE_LIMIT);
        // Restore scroll position after prepending
        if (prepend && messagesContainerRef.current) {
          setTimeout(() => {
            messagesContainerRef.current!.scrollTop = prevScrollTop + (messagesContainerRef.current!.scrollHeight - prevScrollHeight);
          }, 0);
        }
      } else {
        setMessagesByUser(prev => ({ ...prev, [userId]: [] }));
        setMessages([]);
        setHasMore(false);
      }
    } catch (error) {
      setMessagesByUser(prev => ({ ...prev, [userId]: [] }));
      setMessages([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) return;
    try {
      const response = await fetch(`http://localhost:8080/messages/${selectedUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newMessage }),
      });
      if (response.ok) {
        setNewMessage("");
        // After sending, reload messages from backend to ensure UI matches database
        await loadMessages(selectedUser.id, 0);
        // Scroll to bottom after new message
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 0);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  // Handle new message from WebSocket
  useEffect(() => {
    if (!onMessage) return;
    // Listen for real-time incoming messages
    onMessage('new_message', (message: MessageResponse) => {
      if (selectedUser && message.sender_id === selectedUser.id) {
        setMessages(prev => {
          const updated = [...prev, message];
          setMessagesByUser(byUser => ({ ...byUser, [selectedUser.id]: updated }));
          return updated;
        });
      }
    });
    // Optionally listen for message delivery confirmation, etc.
  }, [onMessage, selectedUser]);

  // Listen for typing events from WebSocket
  useEffect(() => {
    if (!onMessage) return;
    const handleTyping = (data: any) => {
      if (selectedUser && data.sender_id === selectedUser.id && data.is_typing) {
        setIsOtherUserTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsOtherUserTyping(false), 1000); // 1 second timeout
      }
    };
    onMessage('typing', handleTyping);
    onMessage('typing_indicator', handleTyping);
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [onMessage, selectedUser]);

  // Typing indicator
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isOtherUserTyping) {
      // User is typing, show indicator
      timeout = setTimeout(() => setIsOtherUserTyping(false), 3000);
    }
    return () => clearTimeout(timeout);
  }, [isOtherUserTyping]);

  // Handle typing events
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (selectedUser) {
      safeSendMessage('typing_indicator', { receiver_id: selectedUser.id, is_typing: true });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Add emoji to message input
  const addEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  // Clear selected user on route change
  // Clear messages when user is deselected or navigating away
  useEffect(() => {
    lastSelectedUserRef.current = selectedUser;
    if (selectedUser) {
      // Load previous messages for selected user
      if (messagesByUser[selectedUser.id]) {
        setMessages(messagesByUser[selectedUser.id]);
        // Scroll to bottom on first load
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 0);
      } else {
        loadMessages(selectedUser.id, 0).then(() => {
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
          }, 0);
        });
      }
    } else {
      setMessages([]);
    }
  }, [selectedUser]);
  useEffect(() => {
    return () => {
      setMessages([]);
      unmountingRef.current = true;
    };
  }, []);

  return (
    <div className="flex h-[70vh] bg-gray-100">
      {/* User list sidebar */}
      <UserList
        users={users}
        selectedUser={selectedUser}
        onUserSelect={setSelectedUser}
        isConnected={isConnected}
      />
      {/* Chat area and input logic here, using selectedUser */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            {/* Messages List */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
              onScroll={e => {
                const el = e.currentTarget;
                if (el.scrollTop < 100 && hasMore && !loading && selectedUser) {
                  // Load older messages when scrolled to top
                  loadMessages(selectedUser.id, messages.length, true);
                }
              }}
            >
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-4">No messages yet.</div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.is_sent_by_viewer ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs rounded-lg px-4 py-2 text-sm break-words whitespace-pre-wrap ${message.is_sent_by_viewer ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`} style={{ wordBreak: 'break-word' }}>
                        <p style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{message.content}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs opacity-70">{new Date(message.created_at).toLocaleTimeString()}</p>
                          {getMessageStatusIcon(message)}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {/* Typing indicator */}
              {isOtherUserTyping && (
                <div className="flex justify-start" style={{ marginBottom: '-24px', marginTop: '-8px' }}>
                  <div className="bg-gray-200 text-black px-4 py-2 rounded-lg">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200 bg-white rounded-b-xl">
              <div className="flex space-x-2 items-center">
                {/* Emoji Picker Button (moved left) */}
                <div className="relative">
                  <button
                    type="button"
                    className="text-xl px-2 py-1 border rounded hover:bg-gray-100"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    title="Show emojis"
                  >
                    😊
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute z-10 bottom-12 left-0 bg-white border border-gray-300 rounded shadow-lg p-2 flex flex-wrap w-80 max-h-64 overflow-y-auto">
                      {commonEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="text-xl m-1 px-1 hover:bg-gray-200 rounded"
                          onClick={() => { addEmoji(emoji); setShowEmojiPicker(false); }}
                          tabIndex={-1}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder={`Message ${selectedUser?.display_name ?? ''}...`}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                  disabled={!isConnected}
                />
                <button
                  onClick={sendMessage}
                  disabled={!isConnected || !newMessage.trim()}
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-[#f7f8fa] rounded-tr-xl rounded-b-xl">
            <div className="flex flex-col items-center">
              <svg width="64" height="64" fill="none" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="32" fill="#e5e7eb"/>
                <path d="M44 24c0-6.627-5.373-12-12-12S20 17.373 20 24c0 4.418 2.393 8.268 6 10.392V44l6-4h2c6.627 0 12-5.373 12-12z" fill="#9ca3af"/>
              </svg>
              <div className="mt-4 text-lg font-medium text-gray-400">Select a user to start messaging</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}