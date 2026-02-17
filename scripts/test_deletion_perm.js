const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDelete() {
    console.log('🧪 Testing deletion with Anon Key...');

    const { data: oneLetter, error: fError } = await supabase
        .from('letters')
        .select('id')
        .limit(1)
        .single();

    if (fError || !oneLetter) {
        console.log('No letters to test with or fetch error:', fError?.message);
        return;
    }

    console.log(`Attempting to delete letter ${oneLetter.id}...`);
    const { error: dError } = await supabase
        .from('letters')
        .delete()
        .eq('id', oneLetter.id);

    if (dError) {
        console.log('❌ Deletion failed:', dError.message);
    } else {
        // Double check count
        const { count, error: cError } = await supabase
            .from('letters')
            .select('*', { count: 'exact', head: true });
        console.log(`✅ Deletion command returned no error. Remaining count: ${count}`);
    }
}

testDelete();
