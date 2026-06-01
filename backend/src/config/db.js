const { Pool } = require('pg');

/**
 * Prefer DATABASE_URL from Supabase (Settings → Database → Connection string → URI).
 * Example: postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
 */
const buildPoolConfig = () => {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (connectionString) {
    return {
      connectionString,
      ssl: { rejectUnauthorized: false },
    };
  }

  const host = process.env.DB_HOST || process.env.SUPABASE_DB_HOST;
  if (!host) return null;

  return {
    user: process.env.DB_USER || 'postgres',
    host,
    database: process.env.DB_NAME || 'postgres',
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432),
    ssl: { rejectUnauthorized: false },
  };
};

const poolConfig = buildPoolConfig();
const pool = poolConfig ? new Pool(poolConfig) : null;
const nativeQuery = pool ? pool.query.bind(pool) : null;

let dbReachable = false;
let dbCheckDone = false;
let lastDbError = null;

const testConnection = async () => {
  if (!pool || !nativeQuery) {
    dbReachable = false;
    dbCheckDone = true;
    lastDbError = new Error('No DATABASE_URL or DB_HOST in .env');
    return false;
  }

  try {
    await nativeQuery('SELECT 1');
    dbReachable = true;
    lastDbError = null;
    return true;
  } catch (err) {
    dbReachable = false;
    lastDbError = err;
    return false;
  } finally {
    dbCheckDone = true;
  }
};

const isDbReachable = () => dbReachable;
const getLastDbError = () => lastDbError;

/** Safe query — uses pg's real query, not a recursive wrapper. */
const query = async (...args) => {
  if (!pool || !nativeQuery) {
    const err = new Error('Database not configured. Set DATABASE_URL in backend/.env');
    err.code = 'DB_OFFLINE';
    throw err;
  }
  if (dbCheckDone && !dbReachable) {
    const err = new Error('Database offline — check Supabase URL and internet');
    err.code = 'DB_OFFLINE';
    throw err;
  }
  return nativeQuery(...args);
};

const db = {
  query,
  testConnection,
  isDbReachable,
  getLastDbError,
  pool,
};

if (pool) {
  Object.assign(pool, db);
  module.exports = pool;
} else {
  module.exports = db;
}
