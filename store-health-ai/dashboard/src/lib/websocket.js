import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * WebSocket Hook for Real-time Updates
 *
 * Connects to the Socket.IO server and listens for real-time events:
 * - alert:new - New alert created
 * - alert:acknowledged - Alert acknowledged
 * - kpi:updated - KPI metric updated
 * - escalation:new - New escalation created
 * - call:completed - AI call completed
 */
export function useWebSocket() {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

    // Initialize socket connection
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, []);

  /**
   * Subscribe to a specific event
   */
  const subscribe = (event, callback) => {
    if (!socketRef.current) return;

    socketRef.current.on(event, (data) => {
      setLastMessage({ event, data, timestamp: new Date() });
      callback(data);
    });

    return () => {
      socketRef.current?.off(event, callback);
    };
  };

  /**
   * Emit an event
   */
  const emit = (event, data) => {
    if (!socketRef.current) return;
    socketRef.current.emit(event, data);
  };

  return {
    isConnected,
    lastMessage,
    subscribe,
    emit,
  };
}

/**
 * Hook for subscribing to alert updates
 */
export function useAlertUpdates(callback) {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribeNew = subscribe('alert:new', callback);
    const unsubscribeAck = subscribe('alert:acknowledged', callback);
    const unsubscribeRes = subscribe('alert:resolved', callback);

    return () => {
      unsubscribeNew?.();
      unsubscribeAck?.();
      unsubscribeRes?.();
    };
  }, [callback, subscribe]);
}

/**
 * Hook for subscribing to KPI updates
 */
export function useKpiUpdates(callback) {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe('kpi:updated', callback);
    return () => unsubscribe?.();
  }, [callback, subscribe]);
}

/**
 * Hook for subscribing to escalation updates
 */
export function useEscalationUpdates(callback) {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe('escalation:new', callback);
    return () => unsubscribe?.();
  }, [callback, subscribe]);
}

/**
 * Hook for subscribing to call updates
 */
export function useCallUpdates(callback) {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe('call:completed', callback);
    return () => unsubscribe?.();
  }, [callback, subscribe]);
}
