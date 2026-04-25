import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { resolve } from 'path';
import authRoutes from './auth-routes';
import { authMiddleware } from './auth-middleware';
import { publicRoutes } from './routes/public';
import { approvalsRoutes } from './routes/approvals';
import { lettersRoutes } from './routes/letters';
import { reprintsRoutes } from './routes/reprints';
import { acknowledgementsRoutes } from './routes/acknowledgements';
import { emailLinksRoutes } from './routes/email-links';
import { auditRoutes } from './routes/audit';
import { committeesRoutes } from './routes/committees';
import { tagsAdminRoutes } from './routes/tags-admin';
import { demoRoutes } from './routes/demo';
import { analyticsRoutes } from './routes/analytics';
import { attachmentsRoutes } from './routes/attachments';
import { autoRoutingRoutes } from './routes/auto-routing';
import { healthRoutes } from './routes/health';

dotenv.config({ path: resolve(__dirname, '../.env') });

const app = express();
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

app.set('trust proxy', true);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-verify-key', 'ngrok-skip-browser-warning']
}));
app.options('*', cors());
app.use(express.json({ limit: '12mb' }));

app.get('/', (_req, res) => {
    res.send(`API is running. Use <a href="${clientUrl}">${clientUrl}</a> for the web app.`);
});

// Public routes
app.use(publicRoutes());
app.use(healthRoutes());

// Auth routes before middleware
app.use('/api', authRoutes);

// Authenticated routes
app.use(authMiddleware());
app.use('/api', approvalsRoutes());
app.use('/api', lettersRoutes());
app.use('/api', reprintsRoutes());
app.use('/api', acknowledgementsRoutes());
app.use('/api', emailLinksRoutes());
app.use('/api', auditRoutes());
app.use('/api', committeesRoutes());
app.use('/api', tagsAdminRoutes());
app.use('/api', demoRoutes());
app.use('/api', analyticsRoutes());
app.use('/api', attachmentsRoutes());
app.use('/api', autoRoutingRoutes());


app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    console.error('🔥 Global error caught:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export { app };
