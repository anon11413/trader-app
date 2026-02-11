/**
 * Socket.io client wrapper — real-time connection to the trader server.
 * Handles authentication, reconnection, and event forwarding.
 */
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './supabase';

type EventCallback = (data: any) => void;

// In production (same-origin), use current host. In dev, use localhost.
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL
  || (typeof window !== 'undefined' && window.location?.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost:3001');

class GameSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<EventCallback>>();
  private connecting = false;
  private authRetries = 0;
  private maxRetries = 3;

  /**
   * Connect to server and authenticate with JWT.
   */
  async connect(): Promise<void> {
    if (this.socket?.connected || this.connecting) return;
    this.connecting = true;

    try {
      const token = await getAccessToken();
      if (!token) {
        this.connecting = false;
        return;
      }

      this.socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        console.log('[Socket] Connected');
        this.authRetries = 0;
        // Authenticate
        this.socket!.emit('authenticate', token);
      });

      this.socket.on('authenticated', (data: any) => {
        console.log('[Socket] Authenticated:', data.username);
        this.emit('authenticated', data);
      });

      this.socket.on('auth_error', (data: any) => {
        console.warn('[Socket] Auth error:', data.error);
        if (this.authRetries < this.maxRetries) {
          this.authRetries++;
          // Try with refreshed token
          setTimeout(async () => {
            const freshToken = await getAccessToken();
            if (freshToken && this.socket?.connected) {
              this.socket.emit('authenticate', freshToken);
            }
          }, 1000 * this.authRetries);
        }
        this.emit('auth_error', data);
      });

      // Forward game events
      const gameEvents = [
        'price_update',
        'trade_success', 'trade_error', 'trade_feed',
        'account_created', 'account_error',
        'convert_success', 'convert_error',
        'sim_update',
      ];

      for (const event of gameEvents) {
        this.socket.on(event, (data: any) => this.emit(event, data));
      }

      this.socket.on('disconnect', (reason: string) => {
        console.log('[Socket] Disconnected:', reason);
        this.emit('disconnected', { reason });
      });

      this.socket.on('connect_error', (err: Error) => {
        console.warn('[Socket] Connection error:', err.message);
      });

    } finally {
      this.connecting = false;
    }
  }

  /**
   * Disconnect from server.
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Reconnect with fresh token (e.g., after app comes to foreground).
   */
  async reconnect(): Promise<void> {
    this.disconnect();
    await this.connect();
  }

  /**
   * Register event listener. Returns unsubscribe function.
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit to local listeners.
   */
  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(data); } catch (e) { console.warn(`[Socket] Event handler error for ${event}:`, e); }
      }
    }
  }

  /**
   * Send event to server.
   */
  send(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`[Socket] Cannot send ${event}: not connected`);
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const gameSocket = new GameSocket();

// Convenience exports
export const connectSocket = () => gameSocket.connect();
export const disconnectSocket = () => gameSocket.disconnect();
export const onSocketEvent = (event: string, cb: EventCallback) => gameSocket.on(event, cb);
export const sendSocketEvent = (event: string, data?: any) => gameSocket.send(event, data);
