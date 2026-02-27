import { query, execute } from './db';

async function keepTen() {
    console.log('🧹 Starting keep-ten cleanup (keep most recent 10 letters)...');
    
    try {
        // Get all letters ordered by created_at descending
        const letters = await query<{ id: string; created_at: Date }>(
            'SELECT id, created_at FROM letters ORDER BY created_at DESC'
        );
        
        console.log(`📋 Found ${letters.length} total letters`);
        
        if (letters.length <= 10) {
            console.log('✅ No cleanup needed (10 or fewer letters)');
            return;
        }
        
        const toDelete = letters.slice(10);
        const deleteIds = toDelete.map(l => l.id);
        console.log(`🗑️  Will delete ${deleteIds.length} old letters, keeping 10 most recent`);
        
        // Delete in batches
        const batchSize = 10;
        let deleted = 0;
        
        for (let i = 0; i < deleteIds.length; i += batchSize) {
            const batch = deleteIds.slice(i, i + batchSize);
            
            for (const letterId of batch) {
                // Get versions first
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
                await execute('DELETE FROM audit_logs WHERE entity_id = ?', [letterId]);
                await execute('DELETE FROM letters WHERE id = ?', [letterId]);
                deleted++;
            }
            
            console.log(`  Progress: ${deleted}/${deleteIds.length} deleted`);
        }
        
        console.log(`✅ Deleted ${deleted} old letters`);
        
        // Verify remaining
        const remaining = await query('SELECT COUNT(*) as cnt FROM letters');
        console.log(`📋 Remaining letters: ${remaining[0].cnt}`);
        
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

keepTen();
