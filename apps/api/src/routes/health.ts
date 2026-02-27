import { Router, Request, Response } from 'express';

export const healthRoutes = () => {
    const router = Router();
    router.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'mcc-issuance-api' });
    });
    return router;
};
