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

async function listRecords() {
    const pool = mysql.createPool(config);
    console.log('--- Current Letters ---');

    try {
        const [letters] = await pool.query(
            'SELECT id, status, created_at FROM letters ORDER BY created_at DESC'
        );

        if (letters.length === 0) {
            console.log('No letters found.');
            return;
        }

        letters.forEach((l: any, i: number) => {
            console.log(`${i + 1}: [${l.id}] (${l.status}) - ${l.created_at}`);
        });

        console.log('\n--- Total Records ---');
        console.log(`Count: ${letters.length}`);
    } finally {
        await pool.end();
    }
}

listRecords();
