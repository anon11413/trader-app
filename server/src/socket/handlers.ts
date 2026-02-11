/**
 * Socket.io event handlers — authentication, trading, currency conversion.
 * All clients receive price updates (public). Trade events require auth.
 */
import { Server as SocketIOServer, Socket } from 'socket.io';
import { supabaseAdmin, createUserClient } from '../db/supabase';
import { executeTrade, TradeRequest } from '../game/trade';
import { createAccount, convertCurrency } from '../game/accounts';
import { Currency, CURRENCIES } from '../sim/instruments';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  jwt?: string;
}

export function setupSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // All clients receive price_update events automatically (io.emit broadcasts to all)
    // No room join needed — price updates use io.emit() in the SSE handler

    // === Authentication ===
    socket.on('authenticate', async (token: string) => {
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
          socket.emit('auth_error', { error: 'Invalid token' });
          return;
        }

        socket.userId = user.id;
        socket.jwt = token;

        // Join user-specific room for trade events
        socket.join(`user:${user.id}`);

        // Get player info
        const { data: player } = await supabaseAdmin
          .from('players')
          .select('username, display_name')
          .eq('id', user.id)
          .single();

        socket.emit('authenticated', {
          userId: user.id,
          username: player?.username,
          displayName: player?.display_name,
        });

        // Update last active
        await supabaseAdmin
          .from('players')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', user.id);

      } catch (e) {
        socket.emit('auth_error', { error: 'Authentication failed' });
      }
    });

    // === Trading ===
    socket.on('buy', async (data: { accountId: string; instrumentId: string; quantity: number; currency: string }) => {
      if (!socket.userId || !socket.jwt) {
        socket.emit('trade_error', { error: 'Not authenticated' });
        return;
      }

      const userClient = createUserClient(socket.jwt);
      const result = await executeTrade(userClient, {
        accountId: data.accountId,
        instrumentId: data.instrumentId,
        tradeType: 'buy',
        quantity: data.quantity,
        currency: data.currency as Currency,
      });

      if (result.success) {
        socket.emit('trade_success', result);
        // Broadcast trade feed to all connected clients
        io.emit('trade_feed', {
          playerId: socket.userId,
          ...result,
          timestamp: new Date().toISOString(),
        });
      } else {
        socket.emit('trade_error', result);
      }
    });

    socket.on('sell', async (data: { accountId: string; instrumentId: string; quantity: number; currency: string }) => {
      if (!socket.userId || !socket.jwt) {
        socket.emit('trade_error', { error: 'Not authenticated' });
        return;
      }

      const userClient = createUserClient(socket.jwt);
      const result = await executeTrade(userClient, {
        accountId: data.accountId,
        instrumentId: data.instrumentId,
        tradeType: 'sell',
        quantity: data.quantity,
        currency: data.currency as Currency,
      });

      if (result.success) {
        socket.emit('trade_success', result);
        io.emit('trade_feed', {
          playerId: socket.userId,
          ...result,
          timestamp: new Date().toISOString(),
        });
      } else {
        socket.emit('trade_error', result);
      }
    });

    // === Account Management ===
    socket.on('create_account', async (data: { currency: string }) => {
      if (!socket.userId) {
        socket.emit('account_error', { error: 'Not authenticated' });
        return;
      }

      const result = await createAccount(socket.userId, data.currency as Currency);
      if (result.success) {
        socket.emit('account_created', result);
      } else {
        socket.emit('account_error', result);
      }
    });

    // === Currency Conversion ===
    socket.on('convert_currency', async (data: {
      fromAccountId: string; toAccountId: string;
      amount: number; fromCurrency: string; toCurrency: string;
    }) => {
      if (!socket.userId || !socket.jwt) {
        socket.emit('convert_error', { error: 'Not authenticated' });
        return;
      }

      const userClient = createUserClient(socket.jwt);
      const result = await convertCurrency(
        userClient,
        data.fromAccountId,
        data.toAccountId,
        data.amount,
        data.fromCurrency as Currency,
        data.toCurrency as Currency
      );

      if (result.success) {
        socket.emit('convert_success', result);
      } else {
        socket.emit('convert_error', result);
      }
    });

    // === Disconnect ===
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}
