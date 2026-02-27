import { performance } from 'perf_hooks';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const config = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mcc_letters'
};

const ITERATIONS = 10;
const BATCH_SIZE = 50;

async function run() {
    const pool = mysql.createPool(config);
    console.log('🚀 Starting Benchmark: letters.created_at index...');

    try {
        // 1. Check existing count
        const [countResult]: any = await pool.query('SELECT COUNT(*) as count FROM letters');
        const count = countResult[0].count;

        console.log(`Current letters count: ${count}`);

        if (count < 1000) {
            console.log('⚠️ Warning: Less than 1000 records. Benchmark may not be representative.');
        }

        let totalDuration = 0;
        let successCount = 0;

        console.log(`Measuring query time for ${ITERATIONS} iterations...`);

        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            
            try {
                await pool.query(
                    'SELECT * FROM letters ORDER BY created_at DESC LIMIT ?',
                    [BATCH_SIZE]
                );
                const end = performance.now();
                
                const duration = end - start;
                totalDuration += duration;
                successCount++;
                process.stdout.write('.');
            } catch (error) {
                console.error('Query failed:', error);
            }
        }
        console.log('');

        if (successCount > 0) {
            const avgDuration = totalDuration / successCount;
            console.log(`\n📊 Benchmark Results (${successCount} iterations):`);
            console.log(`   Average Query Time: ${avgDuration.toFixed(2)} ms`);
        } else {
            console.log('\n❌ Benchmark failed: No successful queries.');
        }
    } finally {
        await pool.end();
    }
}

run().catch(console.error);
