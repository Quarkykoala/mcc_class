import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool: Pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mcc_letters',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
});

type QueryParams = unknown[] | [];

export async function query<T = RowDataPacket>(sql: string, params?: QueryParams): Promise<T[]> {
    try {
        const [rows] = await pool.query<(T & RowDataPacket)[]>(sql, params ?? []);
        return rows;
    } catch (err) {
        if (process.env.DEMO_MODE === 'true') {
            console.log(`🏗️ Demo mode mock for SQL: ${sql.substring(0, 50)}...`);
            // Basic mocking logic for Demo Mode
            if (sql.includes('FROM letters')) return [] as any;
            if (sql.includes('FROM departments')) return [{ id: '1', name: 'Operations' }] as any;
            if (sql.includes('FROM user_roles')) return [{ role: 'ADMIN' }] as any;
            return [] as any;
        }
        throw err;
    }
}

export async function queryOne<T = RowDataPacket>(sql: string, params?: QueryParams): Promise<T | null> {
    try {
        const rows = await query<T>(sql, params);
        return rows.length > 0 ? rows[0] : null;
    } catch (err) {
        if (process.env.DEMO_MODE === 'true') return null;
        throw err;
    }
}

export async function execute(sql: string, params?: QueryParams): Promise<ResultSetHeader> {
    const [result] = await pool.query<ResultSetHeader>(sql, params ?? []);
    return result;
}

export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

export async function queryWithConn<T = RowDataPacket>(conn: PoolConnection, sql: string, params?: QueryParams): Promise<T[]> {
    const [rows] = await conn.query<(T & RowDataPacket)[]>(sql, params ?? []);
    return rows;
}

export async function queryOneWithConn<T = RowDataPacket>(conn: PoolConnection, sql: string, params?: QueryParams): Promise<T | null> {
    const rows = await queryWithConn<T>(conn, sql, params);
    return rows.length > 0 ? rows[0] : null;
}

export async function executeWithConn(conn: PoolConnection, sql: string, params?: QueryParams): Promise<ResultSetHeader> {
    const [result] = await conn.query<ResultSetHeader>(sql, params ?? []);
    return result;
}

export { pool };
export default { query, queryOne, execute, transaction, queryWithConn, queryOneWithConn, executeWithConn, pool };
