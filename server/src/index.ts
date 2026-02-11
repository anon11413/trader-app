/**
 * Main entry point — Express server with Socket.io, REST API,
 * SSE simulation listener, cron jobs, and static file serving.
 */
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

import { config } from './config/env';
import { supabaseAdmin, createUserClient } from './db/supabase';
import { getAllPrices, getExchangeRate, getInstrumentPrice, CURRENCIES, Currency } from './sim/instruments';
import { getOhlcv, getBalanceSheet, getTimeSeries, getOhlcvAssets, getCurrencies, getSimStatus } from './sim/api';
import { connectToSimSSE, setSimUpdateHandler } from './sim/sse';
import { setupSocketHandlers } from './socket/handlers';
import { startCronJobs, snapshotPrices, refreshLeaderboards } from './cron/jobs';
import { getPortfolioWithPrices } from './game/portfolio';
import { getLeaderboard, LeaderboardType } from './game/leaderboard';
import { bootstrapAccounts } from './game/accounts';

// ── Express app ──────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(helmet({
  contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false,
}));
app.use(cors({
  origin: config.NODE_ENV === 'production'
    ? true  // same-origin in production (served from same domain)
    : [config.FRONTEND_URL, 'http://localhost:8081', 'http://localhost:19006'],
  credentials: true,
}));
app.use(express.json());

// Static files — Expo web build goes in server/public/
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// ── Socket.io ────────────────────────────────────────────────────

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.NODE_ENV === 'production'
      ? true
      : [config.FRONTEND_URL, 'http://localhost:8081', 'http://localhost:19006'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

setupSocketHandlers(io);

// ── SSE simulation listener ──────────────────────────────────────

setSimUpdateHandler(async (simDate: string) => {
  console.log(`[Server] Sim update: ${simDate}`);
  try {
    // Broadcast fresh prices to all connected clients
    for (const currency of CURRENCIES) {
      const prices = await getAllPrices(currency);
      io.to('market').emit('price_update', { currency, instruments: prices, simDate });
    }
    // Trigger price snapshot + leaderboard refresh
    await snapshotPrices();
    await refreshLeaderboards();
  } catch (e) {
    console.error('[Server] Failed to broadcast sim update:', e);
  }
});

// ── Auth middleware helper ────────────────────────────────────────

async function authenticateRequest(req: express.Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

// ── REST API routes ──────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Instrument prices ---

// GET /api/instruments/:currency — all 7 instrument prices + sparklines
app.get('/api/instruments/:currency', async (req, res) => {
  try {
    const currency = req.params.currency.toUpperCase() as Currency;
    if (!CURRENCIES.includes(currency)) {
      res.status(400).json({ error: `Invalid currency: ${currency}` });
      return;
    }
    const prices = await getAllPrices(currency);
    res.json(prices);
  } catch (e: any) {
    console.error('[API] /instruments error:', e);
    res.status(500).json({ error: 'Failed to fetch instruments' });
  }
});

// GET /api/instrument/:currency/:id — single instrument price
app.get('/api/instrument/:currency/:id', async (req, res) => {
  try {
    const currency = req.params.currency.toUpperCase() as Currency;
    const id = req.params.id.toUpperCase();
    const price = await getInstrumentPrice(id, currency);
    if (!price) {
      res.status(404).json({ error: 'Instrument not found' });
      return;
    }
    res.json(price);
  } catch (e: any) {
    console.error('[API] /instrument error:', e);
    res.status(500).json({ error: 'Failed to fetch instrument' });
  }
});

// GET /api/instrument/:currency/:id/chart — full OHLCV/line data for chart
app.get('/api/instrument/:currency/:id/chart', async (req, res) => {
  try {
    const currency = req.params.currency.toUpperCase() as Currency;
    const id = req.params.id.toUpperCase();
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // Route to the appropriate sim API based on instrument type
    let data: any;
    switch (id) {
      case 'MACHINE':
        data = await getOhlcv(currency, 'good', 'MACHINE', from, to);
        break;
      case 'FOREX_USD':
        data = await getOhlcv(currency, 'currency', 'USD', from, to);
        break;
      case 'FOREX_YEN':
        data = await getOhlcv(currency, 'currency', 'YEN', from, to);
        break;
      case 'HOUSEHOLD_EQUITY':
        data = await getBalanceSheet(currency, 'Household', from, to);
        data = { type: 'balance_sheet', ...data };
        break;
      case 'CREDITBANK_MA':
        data = await getBalanceSheet(currency, 'CreditBank', from, to);
        data = { type: 'balance_sheet', ...data };
        break;
      case 'INDUSTRIAL_ETF':
        data = await getBalanceSheet(currency, 'Factory', from, to);
        data = { type: 'balance_sheet', ...data };
        break;
      case 'BROAD_MARKET_ETF':
        data = await getBalanceSheet(currency, 'National', from, to);
        data = { type: 'balance_sheet', ...data };
        break;
      default:
        res.status(404).json({ error: 'Instrument not found' });
        return;
    }

    res.json(data);
  } catch (e: any) {
    console.error('[API] /instrument/chart error:', e);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// --- Exchange rates ---

// GET /api/exchange-rate/:from/:to
app.get('/api/exchange-rate/:from/:to', async (req, res) => {
  try {
    const from = req.params.from.toUpperCase() as Currency;
    const to = req.params.to.toUpperCase() as Currency;
    if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to)) {
      res.status(400).json({ error: 'Invalid currency' });
      return;
    }
    const rate = await getExchangeRate(from, to);
    res.json({ from, to, rate });
  } catch (e: any) {
    console.error('[API] /exchange-rate error:', e);
    res.status(500).json({ error: 'Failed to fetch exchange rate' });
  }
});

// --- Leaderboard ---

// GET /api/leaderboard/:type
app.get('/api/leaderboard/:type', async (req, res) => {
  try {
    const type = req.params.type as LeaderboardType;
    const validTypes: LeaderboardType[] = ['total_value', 'total_cash', 'realized_pct', 'unrealized_pct'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: `Invalid leaderboard type. Use: ${validTypes.join(', ')}` });
      return;
    }
    const entries = await getLeaderboard(type);
    res.json(entries);
  } catch (e: any) {
    console.error('[API] /leaderboard error:', e);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// --- Portfolio (authenticated) ---

// GET /api/portfolio
app.get('/api/portfolio', async (req, res) => {
  try {
    const userId = await authenticateRequest(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const portfolio = await getPortfolioWithPrices(userId);
    res.json(portfolio);
  } catch (e: any) {
    console.error('[API] /portfolio error:', e);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// --- Account bootstrap (authenticated) ---

// POST /api/bootstrap-accounts
app.post('/api/bootstrap-accounts', async (req, res) => {
  try {
    const userId = await authenticateRequest(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await bootstrapAccounts(userId);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[API] /bootstrap-accounts error:', e);
    res.status(500).json({ error: 'Failed to bootstrap accounts' });
  }
});

// --- Simulation proxy (pass-through for Data tab) ---

// GET /api/sim/status
app.get('/api/sim/status', async (_req, res) => {
  try {
    const status = await getSimStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch sim status' });
  }
});

// GET /api/sim/currencies
app.get('/api/sim/currencies', async (_req, res) => {
  try {
    const currencies = await getCurrencies();
    res.json(currencies);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

// GET /api/sim/ohlcv/:currency
app.get('/api/sim/ohlcv/:currency', async (req, res) => {
  try {
    const data = await getOhlcvAssets(req.params.currency);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch OHLCV assets' });
  }
});

// GET /api/sim/ohlcv/:currency/:assetType/:assetName
app.get('/api/sim/ohlcv/:currency/:assetType/:assetName', async (req, res) => {
  try {
    const data = await getOhlcv(
      req.params.currency, req.params.assetType, req.params.assetName,
      req.query.from as string, req.query.to as string
    );
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch OHLCV data' });
  }
});

// GET /api/sim/balance-sheets/:currency/:agentType
app.get('/api/sim/balance-sheets/:currency/:agentType', async (req, res) => {
  try {
    const data = await getBalanceSheet(
      req.params.currency, req.params.agentType,
      req.query.from as string, req.query.to as string
    );
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch balance sheet' });
  }
});

// GET /api/sim/timeseries/:currency/:category
app.get('/api/sim/timeseries/:currency/:category', async (req, res) => {
  try {
    const data = await getTimeSeries(
      req.params.currency, req.params.category,
      req.query.from as string, req.query.to as string
    );
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch time series' });
  }
});

// ── SPA fallback ─────────────────────────────────────────────────
// Any non-API route serves the Expo web index.html (SPA routing)
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ── Start server ─────────────────────────────────────────────────

httpServer.listen(config.PORT, () => {
  console.log(`\n🚀 Trader App server running on port ${config.PORT}`);
  console.log(`   Environment: ${config.NODE_ENV}`);
  console.log(`   Sim API: ${config.SIM_API_URL}`);
  console.log(`   Supabase: ${config.SUPABASE_URL ? '✓ connected' : '✗ not configured'}\n`);

  // Start cron jobs
  startCronJobs();

  // Connect to simulation SSE
  connectToSimSSE();
});

export { app, httpServer, io };
