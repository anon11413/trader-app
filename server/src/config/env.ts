import dotenv from 'dotenv';
dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8081',
  SIM_API_URL: process.env.SIM_API_URL || 'http://localhost:8080',

  // Replay mode: serve pre-computed sim data from Supabase instead of live sim
  REPLAY_MODE: process.env.REPLAY_MODE === 'true',
  REPLAY_SPEED_MS: parseInt(process.env.REPLAY_SPEED_MS || '60000', 10), // ms per sim-day (default: 1 min)
};
