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

async function testDelete() {
    const pool = mysql.createPool(config);
    console.log('🧪 Testing deletion with MySQL...');

    try {
        const [letters] = await pool.query('SELECT id FROM letters LIMIT 1');

        if (!letters || letters.length === 0) {
            console.log('No letters to test with.');
            return;
        }

        const oneLetter = letters[0];
        console.log(`Attempting to delete letter ${oneLetter.id}...`);

        const [result] = await pool.query('DELETE FROM letters WHERE id = ?', [oneLetter.id]);

        if (result.affectedRows > 0) {
            console.log('✅ Deletion succeeded');
        } else {
            console.log('❌ Deletion failed or no rows affected');
        }

        const [countResult] = await pool.query('SELECT COUNT(*) as count FROM letters');
        console.log(`📊 Remaining count: ${countResult[0].count}`);
    } finally {
        await pool.end();
    }
}

testDelete();
