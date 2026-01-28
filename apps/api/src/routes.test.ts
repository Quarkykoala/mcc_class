import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const { mockSupabase } = vi.hoisted(() => {
    const mock: any = {
        from: vi.fn(),
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        eq: vi.fn(),
        single: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        rpc: vi.fn()
    };
    mock.from.mockReturnValue(mock);
    mock.select.mockReturnValue(mock);
    mock.insert.mockReturnValue(mock);
    mock.update.mockReturnValue(mock);
    mock.eq.mockReturnValue(mock);
    mock.order.mockReturnValue(mock);
    mock.limit.mockReturnValue(mock);
    
    return { mockSupabase: mock };
});

// Mock createClient
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => mockSupabase
}));

// Mock Middleware to inject User and Mock Supabase
vi.mock('./auth-middleware', () => ({
    authMiddleware: () => (req: any, res: any, next: any) => {
        req.user = { id: 'test-admin', roles: ['ADMIN'] };
        req.supabase = mockSupabase;
        next();
    }
}));

// Import app AFTER mocks
import { app } from './index';

describe('API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Re-setup chaining just in case clearAllMocks wipes return values (it usually doesn't wipe implementations but careful)
        mockSupabase.from.mockReturnValue(mockSupabase);
        mockSupabase.select.mockReturnValue(mockSupabase);
        mockSupabase.insert.mockReturnValue(mockSupabase);
        mockSupabase.update.mockReturnValue(mockSupabase);
        mockSupabase.eq.mockReturnValue(mockSupabase);
        mockSupabase.order.mockReturnValue(mockSupabase);
        mockSupabase.limit.mockReturnValue(mockSupabase);
    });

    describe('POST /api/letters/:id/reject', () => {
        it('rejects a letter successfully', async () => {
            // Mock fetch letter
            mockSupabase.single.mockResolvedValueOnce({
                data: { id: '123', status: 'DRAFT' },
                error: null
            });

            // Mock update
            mockSupabase.update.mockReturnValue(mockSupabase);
            mockSupabase.eq.mockReturnValue(mockSupabase);

            const res = await request(app)
                .post('/api/letters/123/reject')
                .send({ reason: 'Bad content' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Letter rejected.');
            expect(mockSupabase.from).toHaveBeenCalledWith('letters');
            expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
                status: 'REJECTED',
                rejection_reason: 'Bad content'
            }));
        });
    });

    describe('POST /api/letters/:id/print', () => {
        it('prints a letter successfully', async () => {
            // Mock fetch issuance
            mockSupabase.single
                .mockResolvedValueOnce({
                    data: { id: 'iss-1', print_count: 0, max_prints: 1 },
                    error: null
                })
                // Mock fetch letter for access check
                .mockResolvedValueOnce({
                    data: { department_id: 'dept-1', created_by: 'test-admin' },
                    error: null
                });

            const res = await request(app)
                .post('/api/letters/123/print')
                .send({ printer_id: 'PRINTER-1' });

            expect(res.status).toBe(200);
            expect(mockSupabase.from).toHaveBeenCalledWith('issuances');
            expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
                print_count: 1
            }));
        });

        it('fails if print limit reached', async () => {
            // Mock fetch issuance
            mockSupabase.single
                .mockResolvedValueOnce({
                    data: { id: 'iss-1', print_count: 1, max_prints: 1 },
                    error: null
                })
                // Mock fetch letter for access check
                .mockResolvedValueOnce({
                    data: { department_id: 'dept-1', created_by: 'test-admin' },
                    error: null
                });

            const res = await request(app)
                .post('/api/letters/123/print')
                .send({ printer_id: 'PRINTER-1' });

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('limit reached');
        });
    });

    describe('POST /api/letters/:id/reprint-request', () => {
        it('submits a reprint request', async () => {
             // Mock fetch issuance
             mockSupabase.single.mockResolvedValueOnce({
                data: { id: 'iss-1' },
                error: null
            });

            const res = await request(app)
                .post('/api/letters/123/reprint-request')
                .send({ reason: 'Paper jam' });

            expect(res.status).toBe(200);
            expect(mockSupabase.from).toHaveBeenCalledWith('print_requests');
            expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
                reason: 'Paper jam',
                status: 'PENDING'
            }));
        });
    });
});
