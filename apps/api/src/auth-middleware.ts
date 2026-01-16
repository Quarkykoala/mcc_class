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
            supabase: SupabaseClient; // Also attaching supabase instance for convenience if needed
        }
    }
}

export const authMiddleware = (supabase: SupabaseClient) => async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = req.header('x-user-id');

    if (!userId) {
        // For local dev, we could default to Alice, but better to enforce header for testing "log in"
        // However, the instructions imply we should be able to simulate users.
        // If no header, we return 401 to enforce the new security model.
        return res.status(401).json({ error: 'Missing x-user-id header' });
    }

    // Fetch roles
    const { data: roles, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

    if (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Auth verification failed' });
    }

    req.user = {
        id: userId,
        roles: roles ? roles.map((r: any) => r.role) : []
    };
    req.supabase = supabase;

    next();
};
