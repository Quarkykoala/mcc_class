import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './auth-routes';
import { query } from './db';

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                roles: string[];
            };
        }
    }
}

export const authMiddleware = () => async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // DEMO MODE BYPASS
    if (process.env.DEMO_MODE === 'true') {
        req.user = {
            id: '00000000-0000-0000-0000-000000000001',
            roles: ['ADMIN', 'APPROVER', 'ISSUER']
        };
        return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    try {
        const token = authHeader.replace('Bearer ', '');
        const payload = verifyToken(token);

        const userId = payload.sub;

        // Verify user exists
        const users = await query<{ id: string }>('SELECT id FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Fetch roles
        const roles = await query<{ role: string }>(
            'SELECT role FROM user_roles WHERE user_id = ?',
            [userId]
        );

        req.user = {
            id: userId,
            roles: roles.map((r) => r.role)
        };

        next();
    } catch (err) {
        console.error('Auth verification failed:', err);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};
