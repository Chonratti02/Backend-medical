import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  max: 2,
  connectionTimeoutMillis: 10000,
});

const DEFAULT_STAFF = [
  {
    username: 'admin',
    password_hash: '$2a$12$YsKpuwvm3iE0zmSoqQMd6e965KabdMzLw08rxkKiFSJIuFQ/phCte',
    full_name: 'ผู้ดูแลระบบสูงสุด',
    role: 'admin',
    is_active: true
  },
  {
    username: 'doctor_somchai',
    password_hash: '$2a$12$YnEuCqVheyoUyaj9vv5fGutGwTl9oM4KVX9kS/EkdtPxYYsz0C8xq',
    full_name: 'นพ.สมชาย ชาญเวช',
    role: 'doctor',
    is_active: true
  },
  {
    username: 'doctor_wichai',
    password_hash: '$2a$12$YnEuCqVheyoUyaj9vv5fGutGwTl9oM4KVX9kS/EkdtPxYYsz0C8xq',
    full_name: 'นพ.วิชัย ธรรมคุณ',
    role: 'doctor',
    is_active: true
  },
  {
    username: 'doctor_sunee',
    password_hash: '$2a$12$YnEuCqVheyoUyaj9vv5fGutGwTl9oM4KVX9kS/EkdtPxYYsz0C8xq',
    full_name: 'พญ.สุนีย์ พรไพรินทร์',
    role: 'doctor',
    is_active: false
  },
  {
    username: 'somsuk',
    password_hash: '$2a$10$.CP8PAJ0okSeJQMkWg0lWumsg8rugpJcBfyoBDIjD8eIOiyIHLENO',
    full_name: 'สมศักดิ์',
    role: 'doctor',
    is_active: true
  },
  {
    username: 'doctor_sanya',
    password_hash: '$2a$10$Pj9c6RFCsmGBE2FN9CJ3Surjxt8rJyJTbllWDUn/am.o.09EY/79O',
    full_name: 'นพ.สัญญา ชอบโกหก',
    role: 'doctor',
    is_active: true
  }
];

async function runMigration() {
  const client = await pool.connect();
  console.log('🚀 Connecting to PostgreSQL database...');

  try {
    // 1. Drop all tables in public schema cleanly with CASCADE
    console.log('\n🗑️  [Step 1/4] Dropping all existing tables in public schema...');
    const tablesRes = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public';
    `);

    const tableNames = tablesRes.rows.map(r => r.tablename);
    console.log(`Found ${tableNames.length} tables to drop:`, tableNames);

    for (const name of tableNames) {
      await client.query(`DROP TABLE IF EXISTS public."${name}" CASCADE;`);
      console.log(`   ✓ Dropped table: ${name}`);
    }

    // 2. Read and run schema.sql
    console.log('\n📄 [Step 2/4] Executing schema.sql to create all tables and indexes...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
    console.log('   ✅ schema.sql executed successfully.');

    // 3. Read and run InitialData.sql
    console.log('\n🌱 [Step 3/4] Executing InitialData.sql to populate herbal_knowledge and diseases...');
    const initDataPath = path.join(__dirname, 'InitialData.sql');
    const initDataSql = fs.readFileSync(initDataPath, 'utf8');
    await client.query(initDataSql);
    console.log('   ✅ InitialData.sql executed successfully.');

    // 4. Re-insert default staff accounts (admin and doctors)
    console.log('\n👤 [Step 4/4] Seeding default staff accounts...');
    for (const s of DEFAULT_STAFF) {
      await client.query(
        `INSERT INTO staff (username, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO NOTHING;`,
        [s.username, s.password_hash, s.full_name, s.role, s.is_active]
      );
      console.log(`   ✓ Staff: ${s.username} (${s.role}) - ${s.full_name}`);
    }

    // 5. Verification
    console.log('\n🔍 [Verification] Checking table row counts:');
    const verifyTables = [
      'staff',
      'patients',
      'visits',
      'ai_assessments',
      'prescriptions',
      'herbal_knowledge',
      'diseases',
      'knowledge_uploads',
      'knowledge_chunks'
    ];

    for (const t of verifyTables) {
      const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM public."${t}";`);
      console.log(`   📊 ${t.padEnd(20)} : ${countRes.rows[0].cnt} records`);
    }

    console.log('\n🎉 Database reset, schema recreation, and initial data seeding completed successfully!\n');
  } catch (err: any) {
    console.error('\n❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
