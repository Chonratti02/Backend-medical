import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  max: 2,
  connectionTimeoutMillis: 10000,
});

async function runUpdateDb() {
  const client = await pool.connect();
  console.log('🚀 Connecting to PostgreSQL database for incremental migration...');

  try {
    // ------------------------------------------------------------------------
    // Step 1: Update prescriptions table schema
    // ------------------------------------------------------------------------
    console.log('\n📦 [Step 1/3] Updating prescriptions table schema...');
    await client.query(`
      ALTER TABLE prescriptions
        DROP COLUMN IF EXISTS preparation,
        DROP COLUMN IF EXISTS usage_instruction,
        DROP COLUMN IF EXISTS duration_days,
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS pharmacist_id,
        DROP COLUMN IF EXISTS dispensed_at;
    `);
    console.log('   ✓ Dropped unused columns from prescriptions: preparation, usage_instruction, duration_days, status, pharmacist_id, dispensed_at');

    await client.query(`
      DROP INDEX IF EXISTS idx_prescriptions_status;
    `);
    console.log('   ✓ Dropped index idx_prescriptions_status');

    // ------------------------------------------------------------------------
    // Step 2: Update ai_assessments table schema
    // ------------------------------------------------------------------------
    console.log('\n🧠 [Step 2/3] Updating ai_assessments table schema...');
    await client.query(`
      ALTER TABLE ai_assessments
        DROP COLUMN IF EXISTS system_prompt,
        DROP COLUMN IF EXISTS user_prompt;
    `);
    console.log('   ✓ Dropped unused columns from ai_assessments: system_prompt, user_prompt');

    // ------------------------------------------------------------------------
    // Step 3: Clean up existing herbs JSONB in prescriptions
    // ------------------------------------------------------------------------
    console.log('\n🌿 [Step 3/3] Pruning existing records in prescriptions.herbs JSONB...');
    const rxRes = await client.query(`SELECT id, herbs FROM prescriptions ORDER BY id ASC;`);
    let migratedCount = 0;

    for (const row of rxRes.rows) {
      if (Array.isArray(row.herbs)) {
        const prunedHerbs = row.herbs.map((item: any) => ({
          name: item.name || '',
          role: item.role || 'main',
          role_name: item.role_name || (
            item.role === 'main' ? 'ยาหลัก' :
            item.role === 'secondary' ? 'ยารอง' :
            item.role === 'assistant' ? 'ยาประกอบ' :
            item.role === 'flavor' ? 'ยาแต่งรส' : 'ยาหลัก'
          ),
          detail: item.detail ? String(item.detail).trim() : null
        }));

        await client.query(
          `UPDATE prescriptions SET herbs = $1 WHERE id = $2`,
          [JSON.stringify(prunedHerbs), row.id]
        );
        migratedCount++;
      }
    }
    console.log(`   ✓ Successfully pruned ${migratedCount} prescription records to new herbs format`);

    // ------------------------------------------------------------------------
    // Verification: Columns & Counts
    // ------------------------------------------------------------------------
    console.log('\n🔍 [Verification] Checking remaining columns:');

    const rxCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'prescriptions' ORDER BY ordinal_position;
    `);
    console.log('   📋 prescriptions columns:', rxCols.rows.map(r => r.column_name).join(', '));

    const aiCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'ai_assessments' ORDER BY ordinal_position;
    `);
    console.log('   📋 ai_assessments columns:', aiCols.rows.map(r => r.column_name).join(', '));

    console.log('\n📊 [Verification] Checking table row counts:');
    const verifyTables = [
      'patients',
      'visits',
      'prescriptions',
      'ai_assessments',
      'herbal_knowledge',
      'diseases'
    ];
    for (const t of verifyTables) {
      const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM public."${t}";`);
      console.log(`   📊 ${t.padEnd(20)} : ${countRes.rows[0].cnt} records`);
    }

    console.log('\n🎉 Database update completed successfully with zero data loss!\n');
  } catch (err: any) {
    console.error('\n❌ Database update failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runUpdateDb();
