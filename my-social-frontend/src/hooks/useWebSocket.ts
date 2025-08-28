// src/hooks/useWebSocket.ts
import { useEffect, useRef, useState } from 'react';

type WSMessage = {
  type: string;
  data: any;
};

type MessageHandler = (data: any) => void;

export function useWebSocket(shouldConnect: boolean = true) {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const messageHandlers = useRef<Map<string, MessageHandler>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const startHeartbeat = () => {
    heartbeatIntervalRef.current = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'heartbeat', data: {} }));
      }
    }, 30000); // Send heartbeat every 30 seconds
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  const connect = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      setConnectionStatus('connecting');
      ws.current = new WebSocket('ws://localhost:8080/ws');

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0; // Reset attempts on successful connection
        startHeartbeat();
        
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // Request current online status immediately after connection
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'request_online_status', data: {} }));
          console.log('Requested online status from server');
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        stopHeartbeat();
        
        // Only attempt to reconnect if shouldConnect is still true, 
        // not a clean close, and haven't exceeded max attempts
        if (shouldConnect && event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000); // Exponential backoff
          reconnectAttempts.current++;
          
          console.log(`Attempting to reconnect WebSocket in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            // Double-check shouldConnect before actually reconnecting
            if (shouldConnect) {
              connect();
            }
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          setConnectionStatus('error');
        } else if (!shouldConnect) {
          console.log('WebSocket closed and shouldConnect is false - not reconnecting');
        }
      };

      ws.current.onmessage = (event) => {
        try {
          if (event.data && event.data.trim() !== "") {
            const message: WSMessage = JSON.parse(event.data);
            //console.log('WebSocket message received:', message);
            const handler = messageHandlers.current.get(message.type);
            if (handler) {
              handler(message.data);
            } else {
              console.log('Unhandled WebSocket message:', message);
            }
          } else {
            // Ignore empty messages
            console.log('WebSocket received empty message:', event.data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error, event.data);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  };

  useEffect(() => {
    console.log('WebSocket useEffect triggered, shouldConnect:', shouldConnect);
    
    if (!shouldConnect) {
      // Disconnect if shouldConnect becomes false
      console.log('shouldConnect is false - cleaning up WebSocket');
      
      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Reset reconnection attempts
      reconnectAttempts.current = 0;
      
      if (ws.current) {
        console.log('Disconnecting WebSocket due to shouldConnect = false');
        ws.current.close(1000, 'Connection disabled');
      }
      return;
    }

    // Connect when component mounts and shouldConnect is true
    console.log('Attempting to connect WebSocket...');
    const connectTimeout = setTimeout(connect, 100);

    return () => {
      clearTimeout(connectTimeout);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopHeartbeat();
      if (ws.current) {
        ws.current.close(1000, 'Component unmounting');
      }
    };
  }, [shouldConnect]); // Add shouldConnect as dependency

  const onMessage = (type: string, handler: MessageHandler) => {
    messageHandlers.current.set(type, handler);
  };

  const sendMessage = (type: string, data: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, data }));
      return true;
    } else {
      console.warn('WebSocket is not connected. Message not sent:', { type, data });
      return false;
    }
  };

  const disconnect = () => {
    console.log('Manually disconnecting WebSocket...');
    reconnectAttempts.current = maxReconnectAttempts; // Prevent reconnection
    
    // Clear any pending reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (ws.current) {
      ws.current.close(1000, 'Manual disconnect');
    }
  };

  const reconnect = () => {
    reconnectAttempts.current = 0;
    disconnect();
    setTimeout(connect, 1000);
  };

  // Helper function specifically for sending group messages
  const sendGroupMessage = (groupId: number, content: string) => {
    return sendMessage('group_message', {
      group_id: groupId,
      content: content
    });
  };

  // In useWebSocket.ts, ensure open_conversation is sent when chat is opened:
  function openConversation(userId: number) {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "open_conversation",
        data: { user_id: userId },
      }));
      // Optionally log to console for debugging
      console.log("Sent open_conversation for user:", userId);
    }
  }

  return { 
    isConnected, 
    connectionStatus, 
    onMessage, 
    sendMessage,
    sendGroupMessage,
    disconnect, 
    reconnect,
    openConversation // Expose openConversation function
  };
}