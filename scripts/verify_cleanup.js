const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load env from apps/api/.env
dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and key must be set in apps/api/.env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('🔍 Verifying cleanup results...');

    const tables = ['letters', 'letter_versions', 'issuances', 'audit_logs', 'approvals'];

    for (const table of tables) {
        try {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            if (error) {
                console.error(`❌ Error counting ${table}:`, error.message);
            } else {
                console.log(`📊 Table ${table}: ${count} records remaining.`);
            }
        } catch (e) {
            console.error(`⚠️ Exception counting ${table}:`, e.message);
        }
    }

    try {
        const { count: draftCount, error: dError } = await supabase
            .from('letters')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'DRAFT');

        if (dError) {
            console.error(`❌ Error counting DRAFT letters:`, dError.message);
        } else {
            console.log(`📝 Remaining DRAFT letters: ${draftCount}`);
        }
    } catch (e) {
        console.error(`⚠️ Exception counting DRAFT letters:`, e.message);
    }

    console.log('🏁 Verification complete.');
}

verify();
