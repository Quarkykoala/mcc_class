import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from './db';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

export function signToken(userId: string): string {
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { sub: string } {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
}

router.post('/auth/register', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        const id = uuidv4();
        const passwordHash = await bcrypt.hash(password, 10);

        await execute(
            'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
            [id, email, passwordHash]
        );

        const token = signToken(id);

        res.status(201).json({
            user: { id, email },
            access_token: token,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        res.status(500).json({ error: message });
    }
});

router.post('/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        let user: { id: string; email: string; password_hash: string } | null = null;

        try {
            user = await queryOne<{ id: string; email: string; password_hash: string }>(
                'SELECT id, email, password_hash FROM users WHERE email = ?',
                [email]
            );
        } catch (dbErr) {
            if (process.env.DEMO_MODE === 'true') {
                console.log('🏗️ DB connection failed, using demo mode fallback for login');
            } else {
                throw dbErr;
            }
        }

        if (!user && process.env.DEMO_MODE === 'true' && email === 'admin@mcc.local') {
            user = {
                id: '00000000-0000-0000-0000-000000000001',
                email: 'admin@mcc.local',
                password_hash: await bcrypt.hash('admin123', 10)
            };
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = signToken(user.id);

        let roles: { role: string }[] = [];
        try {
            roles = await query<{ role: string }>(
                'SELECT role FROM user_roles WHERE user_id = ?',
                [user.id]
            );
        } catch (rolesErr) {
            if (process.env.DEMO_MODE === 'true') {
                console.log('🏗️ DB roles query failed, using demo fallback roles');
                roles = [{ role: 'ADMIN' }, { role: 'APPROVER' }, { role: 'ISSUER' }];
            } else {
                throw rolesErr;
            }
        }

        if (roles.length === 0 && process.env.DEMO_MODE === 'true') {
            roles = [{ role: 'ADMIN' }, { role: 'APPROVER' }, { role: 'ISSUER' }];
        }

        res.json({
            user: { id: user.id, email: user.email },
            access_token: token,
            roles: roles.map((r) => r.role),
        });
    } catch (err: unknown) {
        console.error('❌ Login error:', err);
        const message = err instanceof Error ? err.message : 'Login failed';
        res.status(500).json({ error: message });
    }
});

router.get('/auth/me', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    try {
        const token = authHeader.replace('Bearer ', '');
        const payload = verifyToken(token);

        const user = await queryOne<{ id: string; email: string }>(
            'SELECT id, email FROM users WHERE id = ?',
            [payload.sub]
        );

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        const roles = await query<{ role: string }>(
            'SELECT role FROM user_roles WHERE user_id = ?',
            [user.id]
        );

        res.json({
            user: { id: user.id, email: user.email },
            roles: roles.map((r) => r.role),
        });
    } catch (err: unknown) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
});

export default router;
