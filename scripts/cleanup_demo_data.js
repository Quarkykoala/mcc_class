import { query, execute, pool } from '../apps/api/src/db';
import { uuidv4 } from '../apps/api/src/uuid';

const TARGET_PATTERNS = [
    'Smoke Test Letter',
    'Untitled letter',
    'Official letter',
    'Demo Draft',
    'QR Audit Demo',
    'Client Demo Approved Letter',
    'C-DEMO',
    'C-QR-DEMO'
];

async function cleanupDemoData() {
    console.log('Starting scoped demo data cleanup...');
    console.log('Connecting to MySQL database...');

    try {
        const titleClauses = TARGET_PATTERNS.map(() => 'title LIKE ?').join(' OR ');
        const refClauses = TARGET_PATTERNS.map(() => 'job_reference LIKE ?').join(' OR ');
        const demoLetters = await query(
            `SELECT id, title, job_reference FROM letters WHERE ${titleClauses} OR ${refClauses}`,
            [
                ...TARGET_PATTERNS.map((pattern) => `${pattern}%`),
                ...TARGET_PATTERNS.map((pattern) => `${pattern}%`)
            ]
        );

        console.log(`Found ${demoLetters.length} demo/test letters to delete`);
        if (demoLetters.length === 0) {
            console.log('No cleanup needed');
            return;
        }

        let deletedCount = 0;
        for (const letter of demoLetters) {
            const letterId = letter.id;
            const versions = await query('SELECT id FROM letter_versions WHERE letter_id = ?', [letterId]);
            const versionIds = versions.map((version) => version.id);

            if (versionIds.length > 0) {
                const versionPh = versionIds.map(() => '?').join(',');
                const issuances = await query(`SELECT id FROM issuances WHERE letter_version_id IN (${versionPh})`, versionIds);
                const issuanceIds = issuances.map((issuance) => issuance.id);

                if (issuanceIds.length > 0) {
                    const issuancePh = issuanceIds.map(() => '?').join(',');
                    await execute(`DELETE FROM print_audits WHERE issuance_id IN (${issuancePh})`, issuanceIds);
                    await execute(`DELETE FROM print_requests WHERE issuance_id IN (${issuancePh})`, issuanceIds);
                }

                await execute(`DELETE FROM issuances WHERE letter_version_id IN (${versionPh})`, versionIds);
                await execute(`DELETE FROM letter_versions WHERE id IN (${versionPh})`, versionIds);
            }

            const dependencies = [
                'approvals',
                'committee_approvals',
                'letter_tags',
                'letter_approver_assignments',
                'acknowledgements',
                'email_links',
                'letter_attachments',
                'letter_voice_notes',
                'approval_deadlines'
            ];

            for (const table of dependencies) {
                try {
                    await execute(`DELETE FROM ${table} WHERE letter_id = ?`, [letterId]);
                } catch {
                    // Some local/demo schemas may not have every optional table.
                }
            }

            await execute('DELETE FROM letters WHERE id = ?', [letterId]);
            deletedCount++;
            console.log(`Deleted demo letter: ${letter.title || letter.job_reference || letterId}`);
        }

        await execute(
            'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), null, 'DEMO_CLEANUP', 'LETTER', 'bulk', JSON.stringify({ deleted_count: deletedCount })]
        );

        console.log(`Deleted ${deletedCount} demo/test letters`);
    } catch (err) {
        console.error('Cleanup error:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

cleanupDemoData();
