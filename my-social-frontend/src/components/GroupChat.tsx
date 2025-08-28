'use client';

import { useEffect, useState, useRef } from 'react';
import UserLink from './UserLink';

interface GroupMessage {
  id: number;
  group_id: number;
  sender_id: number;
  username: string;
  content: string;
  created_at: string;
}


interface GroupMember {
  id: number;
  username: string;
  avatar: string;
  online?: boolean;
}

interface GroupChatProps {
  groupId: number;
  currentUserId: number;
  isConnected: boolean;
  onMessage: ((type: string, handler: (data: GroupMessage | string) => void) => void) | null;
  sendGroupMessage: ((groupId: number, content: string) => boolean) | null;
  messages: GroupMessage[];
  groupMembers?: GroupMember[];
}

export default function GroupChat({ groupId, currentUserId, isConnected, onMessage, sendGroupMessage, messages, groupMembers = [] }: GroupChatProps) {
  const [chatMessages, setChatMessages] = useState<GroupMessage[]>(messages || []);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Sync messages from prop when group changes
  useEffect(() => {
    setChatMessages(messages || []);
  }, [messages, groupId]);

  // Auto-scroll to bottom when chatMessages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (!onMessage) return;

    // Handle incoming group messages
    onMessage('group_message', (data: string | GroupMessage) => {
      if (typeof data !== 'string' && data.group_id === groupId) {
        setChatMessages(prev => [...prev, data]);
      }
    });

    // Handle sent message confirmation
    onMessage('group_message_sent', (data: string | GroupMessage) => {
      if (typeof data !== 'string' && data.group_id === groupId) {
        setChatMessages(prev => [...prev, data]);
      }
    });

    // Handle errors
    onMessage('error', (data: string | GroupMessage) => {
      if (typeof data === 'string') {
        console.error('Group chat error:', data);
        alert(data);
      }
    });
  }, [onMessage, groupId]);

  const handleSendMessage = () => {
    if (newMessage.trim() && isConnected && sendGroupMessage) {
      sendGroupMessage(groupId, newMessage.trim());
      setNewMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Count online members: if any member has online:true, use that count; otherwise, use total groupMembers count (never 0)
  let onlineCount = 0;
  if (groupMembers && groupMembers.length > 0) {
    const hasOnlineProp = groupMembers.some(m => typeof m.online === 'boolean');
    if (hasOnlineProp) {
      onlineCount = groupMembers.filter(m => m.online).length;
    } else {
      onlineCount = groupMembers.length;
    }
  }
  // Debug log for troubleshooting online count
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[GroupChat] groupMembers:', groupMembers);
    // eslint-disable-next-line no-console
    console.log('[GroupChat] onlineCount:', onlineCount);
  }, [groupMembers, onlineCount]);
  return (
    <div className="flex flex-col h-96 border rounded-lg bg-white shadow">
      <div className="bg-gradient-to-r from-blue-100 to-purple-100 p-3 border-b rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg text-blue-700">Group Chat</h3>
            <p className="text-sm text-gray-600">
              Status: <span className={isConnected ? 'text-green-600' : 'text-red-500'}>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </p>
          </div>
          <div className="text-sm text-blue-700 font-semibold">
            Online: {onlineCount}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center text-gray-400 mt-8">No messages yet. Start the conversation!</div>
        )}
        {chatMessages.map((message) => {
          const sender = groupMembers.find(m => m.id === message.sender_id);
          const isCurrentUser = message.sender_id === currentUserId;
          return (
            <div
              key={message.id}
              className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}
            >
              {/* For messages from others, show name above the row */}
              {!isCurrentUser && (
                <span className="text-xs font-semibold text-blue-700 mb-1 ml-12">{sender?.username || message.username}</span>
              )}
              <div className={`flex items-end gap-2 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                {/* Avatar */}
                {!isCurrentUser && (
                  <UserLink
                    userId={sender?.id || message.sender_id}
                    username={sender?.username || message.username}
                    avatar={sender?.avatar}
                    showAvatar={true}
                    showUsername={false}
                    avatarSize={36}
                    className=""
                    isCurrentUser={false}
                  />
                )}
                {/* Message bubble */}
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl shadow-sm relative ${
                    isCurrentUser
                      ? 'bg-blue-500 text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-900 rounded-bl-none'
                  }`}
                  style={{ wordBreak: 'break-word' }}
                >
                  <span>{message.content}</span>
                  <span className="block text-[10px] opacity-70 mt-1 text-right">
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {isCurrentUser && (
                  <UserLink
                    userId={currentUserId}
                    username="You"
                    avatar={sender?.avatar}
                    showAvatar={true}
                    showUsername={false}
                    avatarSize={36}
                    className=""
                    isCurrentUser={true}
                  />
                )}
              </div>
            </div>
          );
        })}
        {/* Auto-scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      <div className="border-t p-3 bg-gray-50 rounded-b-lg">
        <div className="flex gap-2 items-end">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 border rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-blue-300 focus:outline-none bg-white shadow-sm"
            rows={1}
            disabled={!isConnected}
            style={{ minHeight: 40 }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!isConnected || !newMessage.trim()}
            className="bg-blue-500 text-white px-5 py-2 rounded-lg shadow hover:bg-blue-600 transition disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}