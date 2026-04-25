import crypto from 'crypto';
import { execute, pool, query, queryOne } from '../apps/api/src/db';

function generateTestUser() {
    return {
        id: crypto.randomUUID(),
        email: `test_${Date.now()}@example.com`,
        password: 'testpassword123'
    };
}

async function smokeTest() {
    console.log('Starting smoke test...');
    console.log('Connecting to MySQL...');

    let passed = 0;
    let failed = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`  PASS ${name}`);
            passed++;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`  FAIL ${name}: ${message}`);
            failed++;
        }
    };

    try {
        await test('Database connection', async () => {
            const result = await queryOne('SELECT 1 as test');
            if (!result) throw new Error('No result');
        });

        await test('Tables exist', async () => {
            const tables = await query('SHOW TABLES');
            const requiredTables = ['users', 'letters', 'departments', 'tags', 'committees'];
            for (const table of requiredTables) {
                if (!tables.some((t) => Object.values(t)[0] === table)) {
                    throw new Error(`Table '${table}' not found`);
                }
            }
        });

        const testUser = generateTestUser();

        await test('Create user', async () => {
            await execute(
                'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
                [testUser.id, testUser.email, testUser.password]
            );
        });

        await test('Query user', async () => {
            const user = await queryOne('SELECT * FROM users WHERE id = ?', [testUser.id]);
            if (!user) throw new Error('User not found');
        });

        await test('Create department', async () => {
            const deptId = crypto.randomUUID();
            await execute(
                'INSERT INTO departments (id, name, context) VALUES (?, ?, ?)',
                [deptId, 'Test Department', 'HR']
            );
        });

        await test('Create letter', async () => {
            const letterId = crypto.randomUUID();
            const deptResult = await queryOne('SELECT id FROM departments LIMIT 1');
            if (!deptResult) throw new Error('No department found');

            await execute(
                'INSERT INTO letters (id, context, department_id, content, created_by, status) VALUES (?, ?, ?, ?, ?, ?)',
                [letterId, 'HR', deptResult.id, 'Test content', testUser.id, 'DRAFT']
            );
        });

        await test('Update letter', async () => {
            const letter = await queryOne("SELECT id FROM letters WHERE created_by = ? AND status = 'DRAFT' LIMIT 1", [testUser.id]);
            if (!letter) throw new Error('No draft letter found');

            await execute('UPDATE letters SET content = ? WHERE id = ?', ['Updated content', letter.id]);
        });

        await test('Cleanup test data', async () => {
            await execute('DELETE FROM letters WHERE created_by = ?', [testUser.id]);
            await execute('DELETE FROM users WHERE id = ?', [testUser.id]);
        });

        console.log(`\nResults: ${passed} passed, ${failed} failed`);
        await pool.end();
        process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
        console.error('Fatal error:', err);
        await pool.end();
        process.exit(1);
    }
}

smokeTest();
