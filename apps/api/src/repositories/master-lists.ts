import { query } from '../db';
import { TtlCache } from '../cache/ttl-cache';

// Increase TTL to 5 minutes (300,000 ms) for static data
const cache = new TtlCache<any[]>(300_000);

const buildKey = (prefix: string, context?: string | null) => `${prefix}:${context ?? 'all'}`;

export async function getDepartments(context?: string | null) {
    const key = buildKey('departments', context);
    const cached = cache.get(key);
    if (cached) return cached;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (context) {
        conditions.push('context = ?');
        params.push(String(context));
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query<any>(`SELECT * FROM departments ${where}`, params);
    cache.set(key, rows);
    return rows;
}

export async function getTags(context?: string | null) {
    const key = buildKey('tags', context);
    const cached = cache.get(key);
    if (cached) return cached;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (context) {
        conditions.push('context = ?');
        params.push(String(context));
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query<any>(`SELECT * FROM tags ${where}`, params);
    cache.set(key, rows);
    return rows;
}

export function clearMasterListCache() {
    cache.clear();
}
