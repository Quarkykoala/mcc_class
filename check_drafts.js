import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, 'apps/api/.env') });

const config = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mcc_letters'
};

async function checkDrafts() {
    const pool = mysql.createPool(config);

    try {
        const [result] = await pool.query(
            "SELECT COUNT(*) as count FROM letters WHERE status = 'DRAFT'"
        );
        console.log(`Number of draft letters: ${result[0].count}`);
        process.exit(0);
    } catch (error) {
        console.error('Error fetching drafts:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

checkDrafts();
