import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockExecute = vi.fn();

vi.mock('./db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
  transaction: vi.fn(),
  queryWithConn: vi.fn(),
  queryOneWithConn: vi.fn(),
  executeWithConn: vi.fn(),
}));

vi.mock('./auth-middleware', () => ({
  authMiddleware: () => (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', roles: ['ADMIN', 'APPROVER', 'ISSUER'] };
    next();
  }
}));

vi.mock('./auth-routes', () => {
  return { default: (req: any, res: any, next: any) => next(), verifyToken: vi.fn() };
});

vi.mock('./version-manager', () => ({
  handleLetterVersionUpdate: vi.fn(async () => ({ version: 2, hash: 'hash' }))
}));

import { app } from './app';

describe('POST /api/letters (Save Draft)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockExecute.mockResolvedValue({ affectedRows: 1, insertId: 0 });
  });

  it('updates a draft and persists selected tags', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000001', context: 'COMPANY', department_id: '00000000-0000-0000-0000-000000000002', status: 'DRAFT', created_by: 'user-1' })
      .mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000001', content: 'updated content', status: 'DRAFT' });

    const res = await request(app).post('/api/letters').send({
      id: '00000000-0000-0000-0000-000000000001', context: 'COMPANY', content: 'updated content', tag_ids: ['00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004']
    });

    expect(res.status).toBe(200);
    // Verify tags were deleted and re-inserted
    const executeCalls = mockExecute.mock.calls.map(c => c[0]);
    expect(executeCalls.some((sql: string) => sql.includes('DELETE FROM letter_tags'))).toBe(true);
    expect(executeCalls.some((sql: string) => sql.includes('INSERT INTO letter_tags'))).toBe(true);
  });

  it('rejects empty draft content', async () => {
    const res = await request(app).post('/api/letters').send({
      id: 'l1', content: ''
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('content is required.');
  });
});
