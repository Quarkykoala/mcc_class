import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '../apps/api/.env' });

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mcc_letters',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
});

export async function query<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
    const [rows] = await pool.execute<T[]>(sql, params ?? []);
    return rows;
}

export async function queryOne<T = any>(sql: string, params?: unknown[]): Promise<T | null> {
    const rows = await query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

export async function execute(sql: string, params?: unknown[]): Promise<mysql.ResultSetHeader> {
    const [result] = await pool.execute<mysql.ResultSetHeader>(sql, params ?? []);
    return result;
}

export { pool };
export default { query, queryOne, execute, pool };
