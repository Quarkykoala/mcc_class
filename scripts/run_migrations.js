import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const config = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mcc_letters'
};

// Note: This script is now deprecated since MySQL schema is managed via 
// the init-db.ts script which reads mysql/schema.sql

async function runMigrations() {
    console.log('⚠️ This migration script is deprecated.');
    console.log('Use "npm run db:init" to initialize the MySQL database instead.');
    console.log('\nAlternatively, you can manually run migrations from mysql/schema.sql');
    
    // Optionally, run the schema directly
    const schemaPath = path.join(__dirname, '../mysql/schema.sql');
    if (fs.existsSync(schemaPath)) {
        console.log(`\nFound schema at: ${schemaPath}`);
        console.log('Run: mysql -u root -p mcc_letters < mysql/schema.sql');
    }
}

runMigrations();
