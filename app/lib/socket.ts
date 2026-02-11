/**
 * Socket.io client wrapper — real-time connection to the trader server.
 * Connects immediately for public price feed (no auth needed).
 * Authenticate later for trade capabilities.
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
  private _isAuthenticated = false;
  private pendingMessages: Array<{ event: string; data?: any }> = [];

  /**
   * Connect to server for public price feed (no auth required).
   */
  connect(): void {
    if (this.socket?.connected || this.connecting) return;
    this.connecting = true;

    try {
      this.socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        console.log('[Socket] Connected (public)');
        this.authRetries = 0;
        // Flush any messages that were queued while disconnected
        if (this.pendingMessages.length > 0) {
          console.log(`[Socket] Flushing ${this.pendingMessages.length} queued message(s)`);
          const queued = [...this.pendingMessages];
          this.pendingMessages = [];
          for (const msg of queued) {
            this.socket!.emit(msg.event, msg.data);
          }
        }
        this.emit('connected', {});
      });

      this.socket.on('authenticated', (data: any) => {
        console.log('[Socket] Authenticated:', data.username);
        this._isAuthenticated = true;
        this.emit('authenticated', data);
      });

      this.socket.on('auth_error', (data: any) => {
        console.warn('[Socket] Auth error:', data.error);
        this._isAuthenticated = false;
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

      // Forward game events — all clients receive these
      const publicEvents = [
        'price_update',
        'trade_feed',
        'sim_update',
      ];

      // Auth-required events
      const authEvents = [
        'trade_success', 'trade_error',
        'account_created', 'account_error',
        'convert_success', 'convert_error',
      ];

      for (const event of [...publicEvents, ...authEvents]) {
        this.socket.on(event, (data: any) => this.emit(event, data));
      }

      this.socket.on('disconnect', (reason: string) => {
        console.log('[Socket] Disconnected:', reason);
        this._isAuthenticated = false;
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
   * Authenticate the connection with a JWT token (for trading capabilities).
   */
  async authenticate(token?: string): Promise<void> {
    if (!this.socket?.connected) {
      this.connect();
      // Wait a bit for connection
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const authToken = token || await getAccessToken();
    if (authToken && this.socket?.connected) {
      this.socket.emit('authenticate', authToken);
    }
  }

  /**
   * Disconnect from server.
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._isAuthenticated = false;
    }
  }

  /**
   * Reconnect (e.g., after app comes to foreground).
   */
  reconnect(): void {
    this.disconnect();
    this.connect();
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
   * Send event to server. Queues message if not connected and triggers reconnect.
   */
  send(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`[Socket] Not connected, queuing ${event} and reconnecting...`);
      this.pendingMessages.push({ event, data });
      // Trigger a reconnect so the queued message gets sent
      if (!this.connecting) {
        this.connect();
      }
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  get isAuthed(): boolean {
    return this._isAuthenticated;
  }
}

export const gameSocket = new GameSocket();

// Convenience exports
export const connectSocket = () => gameSocket.connect();
export const disconnectSocket = () => gameSocket.disconnect();
export const onSocketEvent = (event: string, cb: EventCallback) => gameSocket.on(event, cb);
export const sendSocketEvent = (event: string, data?: any) => gameSocket.send(event, data);
