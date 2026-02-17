const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and key must be set in apps/api/.env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDrafts() {
    const { data, error, count } = await supabase
        .from('letters')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'DRAFT');

    if (error) {
        console.error('Error fetching drafts:', error.message);
        process.exit(1);
    }

    console.log(`Number of draft letters: ${count}`);
    process.exit(0);
}

checkDrafts();
