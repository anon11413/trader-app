/**
 * SSE Listener — maintains persistent connection to the simulation's
 * /api/events endpoint. On each 'period' event (new sim day),
 * clears the price cache and notifies the server to broadcast updates.
 */
import EventSource from 'eventsource';
import { config } from '../config/env';
import { clearCache } from './api';

let eventSource: EventSource | null = null;
let reconnectDelay = 1000;
let onSimUpdate: ((date: string) => void) | null = null;

export function setSimUpdateHandler(handler: (date: string) => void) {
  onSimUpdate = handler;
}

export function connectToSimSSE() {
  const url = `${config.SIM_API_URL}/api/events`;
  console.log(`[SSE] Connecting to simulation: ${url}`);

  eventSource = new EventSource(url);

  eventSource.addEventListener('connected', () => {
    console.log('[SSE] Connected to simulation');
    reconnectDelay = 1000; // reset backoff
  });

  eventSource.addEventListener('period', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      const simDate = data.date || data.simDate;
      if (simDate) {
        // Clear price cache so next fetch gets fresh data
        clearCache();
        // Notify server
        if (onSimUpdate) onSimUpdate(simDate);
      }
    } catch (e) {
      console.warn('[SSE] Failed to parse period event:', e);
    }
  });

  eventSource.onerror = () => {
    console.warn(`[SSE] Connection error, reconnecting in ${reconnectDelay}ms...`);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connectToSimSSE();
    }, reconnectDelay);
  };
}

export function disconnectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}
