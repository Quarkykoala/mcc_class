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

async function keepFiveOnly() {
    const pool = mysql.createPool(config);
    console.log('🧹 Starting Explicit Keep-5 Cleanup...');

    try {
        // 1. Get all letters
        const [letters] = await pool.query(
            'SELECT id, created_at FROM letters ORDER BY created_at DESC'
        );

        console.log(`📊 Initial count: ${letters.length}`);

        if (letters.length <= 5) {
            console.log('✅ 5 or fewer letters remain.');
            return;
        }

        const toDelete = letters.slice(5).map((l: any) => l.id);
        console.log(`🗑️  Attempting to delete ${toDelete.length} records...`);

        // Delete in chunks
        for (let i = 0; i < toDelete.length; i += 10) {
            const chunk = toDelete.slice(i, i + 10);
            const placeholders = chunk.map(() => '?').join(',');
            
            try {
                await pool.query(`DELETE FROM letters WHERE id IN (${placeholders})`, chunk);
                console.log(`✅ Deleted chunk ${Math.floor(i / 10) + 1}`);
            } catch (delErr: any) {
                console.error(`❌ Delete Error (Chunk ${i}):`, delErr.message);
            }
        }

        const [countResult]: any = await pool.query('SELECT COUNT(*) as count FROM letters');
        console.log(`📊 Final count: ${countResult[0].count}`);
    } finally {
        await pool.end();
    }
}

keepFiveOnly();
