import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

dotenv.config({ path: resolve(__dirname, '../.env') });

async function initDatabase() {
    const host = process.env.MYSQL_HOST || 'localhost';
    const port = parseInt(process.env.MYSQL_PORT || '3306');
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || '';
    const database = process.env.MYSQL_DATABASE || 'mcc_letters';

    console.log(`🔌 Connecting to MySQL at ${host}:${port}...`);

    // First connect without database to create it if needed
    const connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        multipleStatements: true,
    });

    try {
        // Create database if not exists
        console.log(`📦 Creating database '${database}' if not exists...`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        
        // Use the database
        await connection.query(`USE \`${database}\``);

        // Read and execute schema
        console.log('📋 Loading schema from mysql/schema.sql...');
        const schemaPath = resolve(__dirname, '../../../mysql/schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');

        // Split by delimiter and execute each statement
        const statements = schema.split(';').filter(s => s.trim());
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await connection.execute(statement);
                } catch (err: any) {
                    // Ignore duplicate key errors for existing tables
                    if (!err.message.includes('Duplicate key name') && !err.message.includes('already exists')) {
                        console.warn('  ⚠️ Statement warning:', err.message);
                    }
                }
            }
        }

        console.log('✅ Database initialized successfully!');
        
        // Insert seed data if needed
        const [tables] = await connection.execute('SHOW TABLES');
        if (Array.isArray(tables) && tables.length > 0) {
            console.log(`📊 Database has ${tables.length} tables.`);
        }

        const [departments] = await connection.execute('SELECT id FROM departments LIMIT 1');
        let defaultDeptId: string | null = null;
        if (Array.isArray(departments) && departments.length === 0) {
            defaultDeptId = uuidv4();
            await connection.execute('INSERT INTO departments (id, name, context) VALUES (?, ?, ?)', [
                defaultDeptId,
                'Operations',
                'COMPANY'
            ]);
            console.log('✅ Seeded default department (Operations, COMPANY).');
        } else if (Array.isArray(departments) && departments.length > 0) {
            defaultDeptId = (departments[0] as any).id;
        }

        const [users] = await connection.execute('SELECT id FROM users LIMIT 1');
        if (Array.isArray(users) && users.length === 0) {
            const demoEmail = process.env.DEMO_ADMIN_EMAIL || 'admin@mcc.local';
            const demoPassword = process.env.DEMO_ADMIN_PASSWORD || 'admin123';
            const demoUserId = uuidv4();
            const passwordHash = await bcrypt.hash(demoPassword, 10);
            await connection.execute('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [
                demoUserId,
                demoEmail,
                passwordHash
            ]);
            await connection.execute('INSERT INTO user_roles (user_id, role) VALUES (?, ?), (?, ?), (?, ?)', [
                demoUserId, 'ADMIN', demoUserId, 'APPROVER', demoUserId, 'ISSUER'
            ]);
            if (defaultDeptId) {
                await connection.execute('INSERT INTO user_departments (user_id, department_id) VALUES (?, ?)', [
                    demoUserId, defaultDeptId
                ]);
            }
            console.log(`✅ Seeded demo admin user (${demoEmail}).`);
        }

    } catch (err: any) {
        if (err.code === 'ECONNREFUSED') {
            console.error('❌ Cannot connect to MySQL. Is it running?');
        } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('❌ Access denied. Check MYSQL_USER and MYSQL_PASSWORD');
        } else {
            console.error('❌ Database initialization failed:', err.message);
        }
        process.exit(1);
    } finally {
        await connection.end();
    }
}

// Run if called directly
if (require.main === module) {
    initDatabase()
        .then(() => {
            console.log('✨ Done!');
            process.exit(0);
        })
        .catch(() => process.exit(1));
}

export { initDatabase };
