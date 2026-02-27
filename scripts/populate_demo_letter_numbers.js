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

async function run() {
    const pool = mysql.createPool(config);
    console.log('🚀 Starting robust demo data population...');

    try {
        // 1. Fetch current data
        const [letters] = await pool.query(
            'SELECT id, status, created_at, letter_number FROM letters ORDER BY created_at ASC'
        );

        console.log(`📝 Total letters: ${letters.length}`);

        // 2. Pass 1: Set ALL to a temporary very high, safe range
        console.log('🧹 Clearing 1-1000 range to avoid unique conflicts...');
        for (let i = 0; i < letters.length; i++) {
            const l: any = letters[i];
            const tempNum = 2000000 + i;
            const [result]: any = await pool.query(
                'UPDATE letters SET letter_number = ? WHERE id = ?',
                [tempNum, l.id]
            );

            if (result.affectedRows === 0) {
                console.log(`❌ Temp update failed for ${l.id.slice(0, 8)}`);
            }
        }

        // 3. Pass 2: Assign numbers to ISSUED (1, 2, 3...)
        // and set others to high unique range
        console.log('🔢 Finalizing numbers...');
        let seq = 1;
        let issuedCount = 0;
        let otherCount = 0;

        for (let i = 0; i < letters.length; i++) {
            const l: any = letters[i];
            let target;
            if (l.status === 'ISSUED') {
                target = seq++;
                issuedCount++;
            } else {
                target = 10000 + i;
                otherCount++;
            }

            const [result]: any = await pool.query(
                'UPDATE letters SET letter_number = ? WHERE id = ?',
                [target, l.id]
            );

            if (result.affectedRows > 0) {
                if (l.status === 'ISSUED') {
                    console.log(`✅ ${l.id.slice(0, 8)} (ISSUED) -> #${target}`);
                } else {
                    console.log(`✅ ${l.id.slice(0, 8)} (${l.status}) -> [Hidden Number]`);
                }
            } else {
                console.log(`❌ Final update failed for ${l.id.slice(0, 8)} (target: ${target})`);
            }
        }

        console.log(`\n--- Summary ---`);
        console.log(`✅ ISSUED letters numbered: ${issuedCount}`);
        console.log(`✅ Other letters handled: ${otherCount}`);
        console.log('✨ Data population complete!');
    } finally {
        await pool.end();
    }
}

run().catch(console.error);
