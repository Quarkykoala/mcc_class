import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                roles: string[];
            };
            supabase: SupabaseClient;
        }
    }
}

export const authMiddleware = (supabase: SupabaseClient) => async (
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
        req.supabase = supabase;
        return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        console.error('Auth verification failed:', authError);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch roles using the verified user ID
    const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

    if (rolesError) {
        console.error('Role fetch error:', rolesError);
        return res.status(500).json({ error: 'Failed to fetch user permissions' });
    }

    req.user = {
        id: user.id,
        roles: roles ? roles.map((r: any) => r.role) : []
    };
    req.supabase = supabase;

    next();
};
