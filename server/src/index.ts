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
import {
  getAllPrices, getExchangeRate, getInstrumentPrice,
  getAllCommodityPrices, getForexPrices,
  CURRENCIES, Currency
} from './sim/instruments';
import { getOhlcv, getBalanceSheet, getTimeSeries, getOhlcvAssets, getCurrencies, getSimStatus, getConfigChanges } from './sim/api';
import { connectToSimSSE, setSimUpdateHandler } from './sim/sse';
import { initReplay, getReplayProgress, pauseReplay, resumeReplay, setReplaySpeed, seekToDate, seekToIndex } from './sim/replay';
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
  contentSecurityPolicy: false, // Disabled — frontend needs to reach Supabase directly for auth
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

// ── SSE simulation listener (live mode only) ────────────────────

if (!config.REPLAY_MODE) {
  setSimUpdateHandler(async (simDate: string) => {
    console.log(`[Server] Sim update: ${simDate}`);
    try {
      // Broadcast fresh prices to ALL connected clients (public — no auth required)
      for (const currency of CURRENCIES) {
        const [corePrices, commodityPrices, forexPrices] = await Promise.all([
          getAllPrices(currency),
          getAllCommodityPrices(currency),
          getForexPrices(currency),
        ]);
        io.emit('price_update', {
          currency,
          instruments: corePrices,
          commodities: commodityPrices,
          forex: forexPrices,
          simDate,
        });
      }
      // Trigger price snapshot + leaderboard refresh
      await snapshotPrices();
      await refreshLeaderboards();
    } catch (e) {
      console.error('[Server] Failed to broadcast sim update:', e);
    }
  });
}

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

// Public config for frontend (Supabase URL + anon key — these are public/safe)
app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: config.SUPABASE_URL,
    supabaseAnonKey: config.SUPABASE_ANON_KEY,
  });
});

// --- Instrument prices ---

// GET /api/instruments/:currency — core instrument prices (ETF, Credit Bank, Machine)
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

// GET /api/instruments/:currency/commodities — all discovered commodity prices
app.get('/api/instruments/:currency/commodities', async (req, res) => {
  try {
    const currency = req.params.currency.toUpperCase() as Currency;
    if (!CURRENCIES.includes(currency)) {
      res.status(400).json({ error: `Invalid currency: ${currency}` });
      return;
    }
    const prices = await getAllCommodityPrices(currency);
    res.json(prices);
  } catch (e: any) {
    console.error('[API] /instruments/commodities error:', e);
    res.status(500).json({ error: 'Failed to fetch commodity prices' });
  }
});

// GET /api/forex/:currency — forex rates for a base currency
app.get('/api/forex/:currency', async (req, res) => {
  try {
    const currency = req.params.currency.toUpperCase() as Currency;
    if (!CURRENCIES.includes(currency)) {
      res.status(400).json({ error: `Invalid currency: ${currency}` });
      return;
    }
    const prices = await getForexPrices(currency);
    res.json(prices);
  } catch (e: any) {
    console.error('[API] /forex error:', e);
    res.status(500).json({ error: 'Failed to fetch forex prices' });
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

    if (id.startsWith('GOOD_')) {
      // Dynamic commodity — fetch OHLCV for that good
      const goodName = id.replace('GOOD_', '');
      data = await getOhlcv(currency, 'good', goodName, from, to);
    } else if (id.startsWith('FOREX_')) {
      // Forex pair
      const target = id.replace('FOREX_', '');
      data = await getOhlcv(currency, 'currency', target, from, to);
    } else {
      switch (id) {
        case 'MACHINE':
          data = await getOhlcv(currency, 'good', 'MACHINE', from, to);
          break;
        case 'CREDITBANK_MA':
          data = await getBalanceSheet(currency, 'CreditBank', from, to);
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

// GET /api/sim/config-changes — autopilot policy decisions ("fed votes")
app.get('/api/sim/config-changes', async (req, res) => {
  try {
    const data = await getConfigChanges(
      req.query.currency as string | undefined,
      req.query.from as string | undefined,
      req.query.to as string | undefined
    );
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch config changes' });
  }
});

// ── Replay admin routes (only registered in replay mode) ─────────

if (config.REPLAY_MODE) {
  app.get('/api/replay/status', (_req, res) => {
    res.json(getReplayProgress());
  });

  app.post('/api/replay/pause', (_req, res) => {
    pauseReplay();
    res.json(getReplayProgress());
  });

  app.post('/api/replay/resume', (_req, res) => {
    resumeReplay();
    res.json(getReplayProgress());
  });

  app.post('/api/replay/speed', (req, res) => {
    const { msPerDay } = req.body;
    if (typeof msPerDay !== 'number' || msPerDay < 100) {
      res.status(400).json({ error: 'msPerDay must be a number >= 100' });
      return;
    }
    setReplaySpeed(msPerDay);
    res.json(getReplayProgress());
  });

  app.post('/api/replay/seek', (req, res) => {
    const { date, index } = req.body;
    if (date) {
      seekToDate(date);
    } else if (typeof index === 'number') {
      seekToIndex(index);
    } else {
      res.status(400).json({ error: 'Provide date (string) or index (number)' });
      return;
    }
    res.json(getReplayProgress());
  });
}

// ── SPA fallback ─────────────────────────────────────────────────
// Any non-API route serves the Expo web index.html (SPA routing)
// Express 5 requires named wildcard parameters
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ── Start server ─────────────────────────────────────────────────

httpServer.listen(config.PORT, () => {
  console.log(`\n  Trader App server running on port ${config.PORT}`);
  console.log(`   Environment: ${config.NODE_ENV}`);
  console.log(`   Mode: ${config.REPLAY_MODE ? 'REPLAY' : 'LIVE'}`);
  if (!config.REPLAY_MODE) {
    console.log(`   Sim API: ${config.SIM_API_URL}`);
  }
  console.log(`   Supabase: ${config.SUPABASE_URL ? 'connected' : 'not configured'}\n`);

  if (config.REPLAY_MODE) {
    // Replay mode: load dates from Supabase, start broadcast loop
    initReplay(async (simDate: string) => {
      console.log(`[Replay] Day: ${simDate}`);
      try {
        for (const currency of CURRENCIES) {
          const [corePrices, commodityPrices, forexPrices] = await Promise.all([
            getAllPrices(currency),
            getAllCommodityPrices(currency),
            getForexPrices(currency),
          ]);
          io.emit('price_update', {
            currency,
            instruments: corePrices,
            commodities: commodityPrices,
            forex: forexPrices,
            simDate,
          });
        }
        await snapshotPrices();
        await refreshLeaderboards();
      } catch (e) {
        console.error('[Replay] Failed to broadcast:', e);
      }
    }).catch(e => {
      console.error('[Replay] Failed to initialize:', e);
    });

    // Start cron jobs but skip price snapshot (replay handles it per day-advance)
    startCronJobs({ skipPriceSnapshot: true });
  } else {
    // Live mode — existing behavior
    startCronJobs();

    try {
      connectToSimSSE();
    } catch (e) {
      console.error('[Server] Failed to start SSE connection:', e);
    }
  }
});

export { app, httpServer, io };
