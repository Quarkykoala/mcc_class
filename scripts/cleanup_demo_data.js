import { query, queryOne, execute } from './db';

async function cleanupDemoData() {
    console.log('🧹 Starting demo data cleanup...');
    console.log('🔗 Connecting to MySQL database...');

    try {
        // Get all letters
        const letters = await query<{ id: string }>('SELECT id FROM letters');
        console.log(`📋 Found ${letters.length} total letters`);

        // Get drafts (keep most recent 5)
        const drafts = await query<{ id: string; created_at: Date }>(
            "SELECT id, created_at FROM letters WHERE status = 'DRAFT' ORDER BY created_at DESC"
        );
        
        console.log(`📝 Found ${drafts.length} DRAFT letters`);

        if (drafts.length <= 5) {
            console.log('✅ No cleanup needed (5 or fewer drafts)');
            return;
        }

        const toDelete = drafts.slice(5);
        const deleteIds = toDelete.map(d => d.id);
        console.log(`🗑️  Will delete ${deleteIds.length} old drafts`);

        // Delete related data
        for (const letterId of deleteIds) {
            // Get letter versions
            const versions = await query<{ id: string }>('SELECT id FROM letter_versions WHERE letter_id = ?', [letterId]);
            const versionIds = versions.map(v => v.id);

            if (versionIds.length > 0) {
                const ph = versionIds.map(() => '?').join(',');
                await execute(`DELETE FROM issuances WHERE letter_version_id IN (${ph})`, versionIds);
                await execute(`DELETE FROM approvals WHERE letter_id = ?`, [letterId]);
                await execute(`DELETE FROM letter_versions WHERE id IN (${ph})`, versionIds);
            }

            await execute('DELETE FROM letter_tags WHERE letter_id = ?', [letterId]);
            await execute('DELETE FROM letter_approver_assignments WHERE letter_id = ?', [letterId]);
            await execute('DELETE FROM acknowledgements WHERE letter_id = ?', [letterId]);
            await execute('DELETE FROM letters WHERE id = ?', [letterId]);
        }

        console.log(`✅ Deleted ${deleteIds.length} draft letters`);
        
        // Show remaining
        const remaining = await query<{ id: string }>("SELECT id FROM letters WHERE status = 'DRAFT'");
        console.log(`📝 Remaining DRAFT letters: ${remaining.length}`);

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

cleanupDemoData();
