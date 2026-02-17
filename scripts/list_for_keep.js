const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function listRecords() {
    console.log('--- Current Letters ---');
    // Try a simpler select to avoid column errors
    const { data: letters, error } = await supabase
        .from('letters')
        .select('id, status, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    if (letters.length === 0) {
        console.log('No letters found.');
        return;
    }

    letters.forEach((l, i) => {
        console.log(`${i + 1}: [${l.id}] (${l.status}) - ${l.created_at}`);
    });

    console.log('\n--- Total Records ---');
    console.log(`Count: ${letters.length}`);
}

listRecords();
