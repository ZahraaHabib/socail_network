'use client';

import { useWebSocket } from '@/hooks/useWebSocket';
import { useEffect, useState } from 'react';

export default function TestWebSocket() {
  const { isConnected, connectionStatus, onMessage, sendMessage, sendGroupMessage } = useWebSocket();
  const [messages, setMessages] = useState<any[]>([]);
  const [groupId, setGroupId] = useState<number>(1);
  const [messageContent, setMessageContent] = useState<string>('');

  useEffect(() => {
    onMessage('connected', (data: any) => {
      console.log('Connected:', data);
      setMessages(prev => [...prev, { type: 'connected', data }]);
    });

    onMessage('new_message', (data: any) => {
      console.log('New message:', data);
      setMessages(prev => [...prev, { type: 'new_message', data }]);
    });

    onMessage('group_message', (data: any) => {
      console.log('Group message received:', data);
      setMessages(prev => [...prev, { type: 'group_message', data }]);
    });

    onMessage('group_message_sent', (data: any) => {
      console.log('Group message sent confirmation:', data);
      setMessages(prev => [...prev, { type: 'group_message_sent', data }]);
    });

    onMessage('error', (data: any) => {
      console.log('Error:', data);
      setMessages(prev => [...prev, { type: 'error', data }]);
    });

    onMessage('pong', (data: any) => {
      console.log('Pong received:', data);
      setMessages(prev => [...prev, { type: 'pong', data }]);
    });
  }, [onMessage]);

  const testPing = () => {
    sendMessage('ping', {});
  };

  const testGroupMessage = () => {
    if (messageContent.trim() && groupId) {
      sendGroupMessage(groupId, messageContent);
      setMessageContent('');
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">WebSocket Test</h1>
      
      <div className="mb-4">
        <p>Status: <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
          {connectionStatus}
        </span></p>
      </div>

      <div className="mb-4 space-y-2">
        <button 
          onClick={testPing}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
          disabled={!isConnected}
        >
          Send Ping
        </button>

        <div className="flex gap-2">
          <input
            type="number"
            value={groupId}
            onChange={(e) => setGroupId(Number(e.target.value))}
            placeholder="Group ID"
            className="border px-2 py-1 rounded w-24"
          />
          <input
            type="text"
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="Type your group message..."
            className="border px-2 py-1 rounded flex-1"
            onKeyPress={(e) => e.key === 'Enter' && testGroupMessage()}
          />
          <button 
            onClick={testGroupMessage}
            className="bg-green-500 text-white px-4 py-2 rounded"
            disabled={!isConnected || !messageContent.trim()}
          >
            Send Group Message
          </button>
        </div>
      </div>

      <div className="border p-4 h-64 overflow-y-auto">
        <h3 className="font-bold mb-2">Messages:</h3>
        {messages.map((msg, i) => (
          <div key={i} className="mb-2 p-2 bg-gray-100 rounded">
            <strong className={
              msg.type === 'group_message' ? 'text-green-600' :
              msg.type === 'error' ? 'text-red-600' :
              'text-blue-600'
            }>
              {msg.type}:
            </strong> 
            <pre className="text-sm mt-1">{JSON.stringify(msg.data, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}