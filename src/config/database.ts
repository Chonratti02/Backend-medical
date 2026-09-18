import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  max: 5, // จำกัด Connection pool สูงสุด 5 connections เพื่อไม่ให้เต็มขีดจำกัดของ Aiven Cloud
  idleTimeoutMillis: 10000, // คืน connection ที่ว่างภายใน 10 วินาที
  connectionTimeoutMillis: 10000,
});

// Test connection on startup
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL Connected');
    client.release();
  })
  .catch((err: Error) => {
    console.error('❌ PostgreSQL Connection Failed:', err.message);
  });

// คืน Connection ทันทีเมื่อ Nodemon รีสตาร์ทหรือปิด Server
process.once('SIGUSR2', async () => {
  await pool.end();
  process.kill(process.pid, 'SIGUSR2');
});
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

export const db = {
  pool,
  query: <R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: string,
    values?: I
  ): Promise<QueryResult<R>> => {
    return pool.query<R>(queryTextOrConfig, values);
  },
  getConnection: () => pool.connect(),
};

export default db;
