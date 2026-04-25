import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne, execute } from './db';
import { uuidv4 } from './uuid';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production.');
}
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_EMAIL = 'admin@mcc.local';

export function signToken(userId: string): string {
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { sub: string } {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
}

async function getFirstAvailableUser() {
    const user = await queryOne<{ id: string; email: string }>(
        'SELECT id, email FROM users ORDER BY created_at ASC LIMIT 1'
    );

    if (!user) {
        return null;
    }

    const roles = await query<{ role: string }>(
        'SELECT role FROM user_roles WHERE user_id = ?',
        [user.id]
    );

    return {
        user,
        roles: roles.map((row) => row.role)
    };
}

const registerHandler = async (req: Request, res: Response) => {
    if (process.env.ALLOW_REGISTRATION !== 'true') {
        return res.status(403).json({ error: 'Registration is disabled.' });
    }

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
};

const loginHandler = async (req: Request, res: Response) => {
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

        if (!user && process.env.DEMO_MODE === 'true' && email === DEMO_EMAIL) {
            user = {
                id: DEMO_USER_ID,
                email: DEMO_EMAIL,
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
};

const meHandler = async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        if (process.env.DEMO_MODE === 'true') {
            const fallback = await getFirstAvailableUser();
            if (fallback) {
                return res.json(fallback);
            }
        }
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
            if (process.env.DEMO_MODE === 'true') {
                if (payload.sub === DEMO_USER_ID) {
                    return res.json({
                        user: { id: DEMO_USER_ID, email: DEMO_EMAIL },
                        roles: ['ADMIN', 'APPROVER', 'ISSUER'],
                    });
                }
                const fallback = await getFirstAvailableUser();
                if (fallback) {
                    return res.json(fallback);
                }
            }
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
        if (process.env.DEMO_MODE === 'true') {
            const fallback = await getFirstAvailableUser();
            if (fallback) {
                return res.json(fallback);
            }
        }
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

router.post('/auth/register', registerHandler);
router.post('/register', registerHandler);

router.post('/auth/login', loginHandler);
router.post('/login', loginHandler);

router.get('/auth/me', meHandler);
router.get('/me', meHandler);

export default router;
