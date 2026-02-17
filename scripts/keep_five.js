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

async function keepFiveOnly() {
    console.log('🧹 Starting Keep-5 Cleanup...');

    try {
        // 1. Get all letters ordered by creation date
        const { data: allLetters, error: fetchError } = await supabase
            .from('letters')
            .select('id, created_at')
            .order('created_at', { ascending: false });

        if (fetchError) {
            console.error('❌ Error fetching letters:', fetchError.message);
            return;
        }

        if (allLetters.length <= 5) {
            console.log(`✅ Only ${allLetters.length} letters found. No deletion needed.`);
            return;
        }

        const keepers = allLetters.slice(0, 5);
        const toDelete = allLetters.slice(5);
        const keeperIds = keepers.map(l => l.id);
        const deleteIds = toDelete.map(l => l.id);

        console.log(`📌 Keeping: ${keeperIds.length} records.`);
        console.log(`🗑️  Deleting: ${deleteIds.length} records.`);

        // 2. Fetch versions for records to delete
        const { data: versions, error: vError } = await supabase
            .from('letter_versions')
            .select('id')
            .in('letter_id', deleteIds);

        const versionIds = versions?.map(v => v.id) || [];

        if (versionIds.length > 0) {
            console.log('🗑️  Removing related issuances, approvals, and versions...');
            await supabase.from('issuances').delete().in('letter_version_id', versionIds);
            await supabase.from('approvals').delete().in('letter_version_id', versionIds);
            await supabase.from('letter_versions').delete().in('id', versionIds);
        }

        console.log('🗑️  Removing other related data...');
        await supabase.from('letter_tags').delete().in('letter_id', deleteIds);
        await supabase.from('acknowledgements').delete().in('letter_id', deleteIds);

        // 3. Delete letters
        const { error: deleteError } = await supabase
            .from('letters')
            .delete()
            .in('id', deleteIds);

        if (deleteError) {
            console.error('❌ Error deleting letters:', deleteError.message);
            if (deleteError.message.includes('permission denied')) {
                console.error('🚨 TIP: This likely requires a SERVICE_ROLE_KEY to bypass RLS.');
            }
        } else {
            console.log('✅ Successfully reduced letters to 5.');
        }

        // 4. Clear audit logs
        console.log('🗑️  Clearing audit logs...');
        const { error: logError } = await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        if (logError) {
            console.error('❌ Error clearing audit logs:', logError.message);
        } else {
            console.log('✅ Audit logs cleared.');
        }

        console.log('🏁 Cleanup complete!');

    } catch (err) {
        console.error('💥 Fatal error:', err.message);
    }
}

keepFiveOnly();
