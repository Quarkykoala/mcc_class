const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function keepFiveOnly() {
    console.log('🧹 Starting Explicit Keep-5 Cleanup...');

    // 1. Get all letters
    const { data: allLetters, error: fetchError } = await supabase
        .from('letters')
        .select('id, created_at')
        .order('created_at', { ascending: false });

    if (fetchError) {
        console.error('❌ Fetch Error:', fetchError.message);
        return;
    }

    console.log(`📊 Initial count: ${allLetters.length}`);

    if (allLetters.length <= 5) {
        console.log('✅ 5 or fewer letters remain.');
        return;
    }

    const toDelete = allLetters.slice(5).map(l => l.id);
    console.log(`🗑️  Attempting to delete ${toDelete.length} records...`);

    // Delete in chunks to be safe and see errors
    for (let i = 0; i < toDelete.length; i += 10) {
        const chunk = toDelete.slice(i, i + 10);
        const { error: delErr } = await supabase.from('letters').delete().in('id', chunk);
        if (delErr) {
            console.error(`❌ Delete Error (Chunk ${i}):`, delErr.message);
        } else {
            console.log(`✅ Deleted chunk ${i / 10 + 1}`);
        }
    }

    const { count, error: finalError } = await supabase
        .from('letters')
        .select('*', { count: 'exact', head: true });

    console.log(`📊 Final count: ${count}`);
}

keepFiveOnly();
