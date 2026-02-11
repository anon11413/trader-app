/**
 * Zustand global state store.
 * Manages auth, market data (core + commodities + forex), portfolio, leaderboard, and UI state.
 */
import { create } from 'zustand';

// --- Types ---

export interface InstrumentPrice {
  id: string;
  name: string;
  section: string;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  sparkline: number[];
}

export interface Holding {
  instrumentId: string;
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
}

export interface Account {
  id: string;
  currency: string;
  cashBalance: number;
  holdings: Holding[];
  totalValue: number;
}

export interface PortfolioSummary {
  accounts: Account[];
  totalValueEUR: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  value: number;
}

export interface TradeFeedItem {
  playerId: string;
  tradeType: string;
  instrument: string;
  quantity: number;
  price: number;
  totalCost: number;
  timestamp: string;
}

// --- State interface ---

interface AppState {
  // Auth
  userId: string | null;
  username: string | null;
  displayName: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Simulation
  simDate: string | null;

  // Market data — prices keyed by currency
  prices: Record<string, InstrumentPrice[]>;       // Core instruments (ETF, Credit Bank, Machine)
  commodityPrices: Record<string, InstrumentPrice[]>; // Dynamic commodities
  forexPrices: Record<string, InstrumentPrice[]>;     // Forex rates

  // Portfolio
  portfolio: PortfolioSummary | null;
  selectedAccountId: string | null;

  // Leaderboard
  leaderboard: LeaderboardEntry[];
  leaderboardType: string;

  // Trade feed (recent trades from all players)
  tradeFeed: TradeFeedItem[];

  // UI
  selectedCurrency: string;
  socketConnected: boolean;

  // Actions
  setAuth: (userId: string, username: string, displayName: string | null) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setSimDate: (date: string) => void;
  setPrices: (currency: string, instruments: InstrumentPrice[]) => void;
  setCommodityPrices: (currency: string, instruments: InstrumentPrice[]) => void;
  setForexPrices: (currency: string, instruments: InstrumentPrice[]) => void;
  setPortfolio: (portfolio: PortfolioSummary) => void;
  setSelectedAccount: (accountId: string) => void;
  setLeaderboard: (entries: LeaderboardEntry[], type: string) => void;
  addTradeFeedItem: (item: TradeFeedItem) => void;
  setSelectedCurrency: (currency: string) => void;
  setSocketConnected: (connected: boolean) => void;
}

// --- Store ---

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  userId: null,
  username: null,
  displayName: null,
  isAuthenticated: false,
  isLoading: true,

  simDate: null,

  prices: {},
  commodityPrices: {},
  forexPrices: {},

  portfolio: null,
  selectedAccountId: null,

  leaderboard: [],
  leaderboardType: 'total_value',

  tradeFeed: [],

  selectedCurrency: 'EUR',
  socketConnected: false,

  // Actions
  setAuth: (userId, username, displayName) =>
    set({ userId, username, displayName, isAuthenticated: true, isLoading: false }),

  clearAuth: () =>
    set({
      userId: null, username: null, displayName: null,
      isAuthenticated: false, isLoading: false,
      portfolio: null, selectedAccountId: null,
      tradeFeed: [],
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setSimDate: (simDate) => set({ simDate }),

  setPrices: (currency, instruments) =>
    set((state) => ({
      prices: { ...state.prices, [currency]: instruments },
    })),

  setCommodityPrices: (currency, instruments) =>
    set((state) => ({
      commodityPrices: { ...state.commodityPrices, [currency]: instruments },
    })),

  setForexPrices: (currency, instruments) =>
    set((state) => ({
      forexPrices: { ...state.forexPrices, [currency]: instruments },
    })),

  setPortfolio: (portfolio) => {
    const current = get();
    let selectedAccountId = current.selectedAccountId;
    // Auto-select first account if none selected
    if (!selectedAccountId && portfolio.accounts.length > 0) {
      selectedAccountId = portfolio.accounts[0].id;
    }
    // Verify selected account still exists
    if (selectedAccountId && !portfolio.accounts.find(a => a.id === selectedAccountId)) {
      selectedAccountId = portfolio.accounts[0]?.id ?? null;
    }
    set({ portfolio, selectedAccountId });
  },

  setSelectedAccount: (selectedAccountId) => set({ selectedAccountId }),

  setLeaderboard: (leaderboard, leaderboardType) =>
    set({ leaderboard, leaderboardType }),

  addTradeFeedItem: (item) =>
    set((state) => ({
      tradeFeed: [item, ...state.tradeFeed].slice(0, 50),
    })),

  setSelectedCurrency: (selectedCurrency) => set({ selectedCurrency }),

  setSocketConnected: (socketConnected) => set({ socketConnected }),
}));
