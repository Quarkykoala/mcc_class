const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Skipping benchmark.');
    process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ITERATIONS = 10;
const BATCH_SIZE = 50;

async function run() {
    console.log('🚀 Starting Benchmark: letters.created_at index...');

    // 1. Check existing count
    const { count, error: countError } = await supabase
        .from('letters')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('Failed to count letters:', countError);
        return;
    }

    console.log(`Current letters count: ${count}`);

    if (count < 1000) {
        console.log('⚠️ Warning: Less than 1000 records. Benchmark may not be representative.');
    }

    let totalDuration = 0;
    let successCount = 0;

    console.log(`Measuring query time for ${ITERATIONS} iterations...`);

    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        const { error } = await supabase
            .from('letters')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(BATCH_SIZE);
        const end = performance.now();

        if (error) {
            console.error('Query failed:', error);
        } else {
            const duration = end - start;
            totalDuration += duration;
            successCount++;
            process.stdout.write('.');
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
}

run().catch(console.error);
