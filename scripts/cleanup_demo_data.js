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

async function cleanup() {
    console.log('🧹 Starting cleanup script...');
    console.log(`🔗 Connecting to: ${supabaseUrl}`);

    // Identify demo user and draft letters
    const demoUserId = '00000000-0000-0000-0000-000000000001';

    try {
        // 1. Fetch letters to delete
        console.log('🔍 Finding letters to clean up...');
        const { data: lettersToDelete, error: fetchError } = await supabase
            .from('letters')
            .select('id')
            .or(`status.eq.DRAFT,created_by.eq.${demoUserId}`);

        if (fetchError) {
            console.error('❌ Error fetching letters:', fetchError.message);
            return;
        }

        const letterIds = lettersToDelete.map(l => l.id);
        console.log(`📝 Found ${letterIds.length} letters to remove.`);

        if (letterIds.length > 0) {
            // 2. Fetch versions linked to these letters
            const { data: versions, error: vError } = await supabase
                .from('letter_versions')
                .select('id')
                .in('letter_id', letterIds);

            const versionIds = versions?.map(v => v.id) || [];

            if (versionIds.length > 0) {
                // 3. Delete Issuances and Approvals first due to FKs
                console.log('🗑️  Deleting issuances...');
                await supabase.from('issuances').delete().in('letter_version_id', versionIds);

                console.log('🗑️  Deleting approvals...');
                await supabase.from('approvals').delete().in('letter_version_id', versionIds);

                console.log('🗑️  Deleting versions...');
                await supabase.from('letter_versions').delete().in('id', versionIds);
            }

            console.log('🗑️  Deleting letter tags...');
            await supabase.from('letter_tags').delete().in('letter_id', letterIds);

            console.log('🗑️  Deleting acknowledgements...');
            await supabase.from('acknowledgements').delete().in('letter_id', letterIds);

            console.log('🗑️  Deleting letters...');
            const { error: deleteError } = await supabase
                .from('letters')
                .delete()
                .in('id', letterIds);

            if (deleteError) {
                console.error('❌ Error deleting letters:', deleteError.message);
            } else {
                console.log('✅ Successfully deleted letters.');
            }
        }

        // 4. Cleanup Audit Logs
        console.log('🗑️  Clearing audit logs...');
        const { error: logError } = await supabase
            .from('audit_logs')
            .delete()
            .neq('action', 'SYSTEM_INIT'); // Placeholder to delete all but init

        if (logError) {
            console.error('❌ Error deleting audit logs:', logError.message);
        } else {
            console.log('✅ Audit logs cleared.');
        }

        console.log('✨ Cleanup complete!');
    } catch (err) {
        console.error('💥 Fatal error during cleanup:', err.message);
    }
}

cleanup();
