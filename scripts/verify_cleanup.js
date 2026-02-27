import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const config = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mcc_letters'
};

async function verify() {
    const pool = mysql.createPool(config);
    console.log('🔍 Verifying cleanup results...');

    const tables = ['letters', 'letter_versions', 'issuances', 'audit_logs', 'approvals'];

    try {
        for (const table of tables) {
            try {
                const [result]: any = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`📊 Table ${table}: ${result[0].count} records remaining.`);
            } catch (e: any) {
                console.error(`⚠️ Exception counting ${table}:`, e.message);
            }
        }

        try {
            const [result]: any = await pool.query(
                "SELECT COUNT(*) as count FROM letters WHERE status = 'DRAFT'"
            );
            console.log(`📝 Remaining DRAFT letters: ${result[0].count}`);
        } catch (e: any) {
            console.error(`⚠️ Exception counting DRAFT letters:`, e.message);
        }

        console.log('🏁 Verification complete.');
    } finally {
        await pool.end();
    }
}

verify();
