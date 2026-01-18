import { Request, Response, NextFunction } from 'express';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

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

export const authMiddleware = (supabaseUrl: string, supabaseKey: string) => async (
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
        // For demo mode, we just use a fresh client with the key (no user token)
        // Or we could mock it. But let's just create a base client.
        const demoClient = createClient(supabaseUrl, supabaseKey);
        req.supabase = demoClient;
        return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    // Create a scoped client for this request (acts as the user)
    const scopedClient = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: { Authorization: authHeader }
        }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await scopedClient.auth.getUser(token);

    if (authError || !user) {
        console.error('Auth verification failed:', authError);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch roles using the scoped client (relies on RLS 'Users can read own roles')
    const { data: roles, error: rolesError } = await scopedClient
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
    req.supabase = scopedClient;

    next();
};
