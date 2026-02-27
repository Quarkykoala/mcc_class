import { query, execute } from './db';

async function keepFive() {
    console.log('🧹 Starting keep-five cleanup (keep most recent 5 drafts)...');

    try {
        // Get all DRAFT letters, ordered by created_at descending
        const drafts = await query(
            "SELECT id, created_at FROM letters WHERE status = 'DRAFT' ORDER BY created_at DESC"
        );

        console.log(`📝 Found ${drafts.length} DRAFT letters`);

        if (drafts.length <= 5) {
            console.log('✅ No cleanup needed (5 or fewer drafts)');
            return;
        }

        const toDelete = drafts.slice(5);
        const deleteIds = toDelete.map(d => d.id);
        console.log(`🗑️  Will delete ${deleteIds.length} old drafts, keeping 5 most recent`);

        // Delete in batches
        const batchSize = 10;
        let deleted = 0;

        for (let i = 0; i < deleteIds.length; i += batchSize) {
            const batch = deleteIds.slice(i, i + batchSize);

            for (const letterId of batch) {
                // Get versions first
                const versions = await query('SELECT id FROM letter_versions WHERE letter_id = ?', [letterId]);
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
                deleted++;
            }

            console.log(`  Progress: ${deleted}/${deleteIds.length} deleted`);
        }

        console.log(`✅ Deleted ${deleted} old drafts`);

        // Verify remaining
        const remaining = await query("SELECT id FROM letters WHERE status = 'DRAFT'");
        console.log(`📝 Remaining DRAFT letters: ${remaining.length}`);

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

keepFive();
