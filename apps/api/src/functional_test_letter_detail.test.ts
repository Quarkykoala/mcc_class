import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    req.user = { id: 'user-123', roles: ['USER'] };
    next();
  }
}));

vi.mock('./auth-routes', () => {
  const { Router } = require('express');
  return { default: Router(), verifyToken: vi.fn() };
});

import { app } from './app';

describe('GET /api/letters/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
  });

  it('fetches a single letter with content', async () => {
    // queryOne for letter detail
    mockQueryOne.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111', content: 'Full content of the letter', status: 'DRAFT',
      created_at: new Date().toISOString(), created_by: 'user-123',
      department_id: 'dept-1', dept_name: 'HR'
    });
    mockQueryOne.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      content: 'Full content of the letter',
      status: 'DRAFT',
      context: 'COMPANY',
      created_by: 'user-123',
      department_id: 'dept-1',
      dept_name: 'HR',
    });
    // getUserDepartmentIds (since not ADMIN)
    mockQuery
      .mockResolvedValueOnce([{ department_id: 'dept-1' }]) // user_departments
      .mockResolvedValueOnce([]) // tags
      .mockResolvedValueOnce([]); // assignments

    const res = await request(app).get('/api/letters/letter-detail-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.body.content).toBe('Full content of the letter');
  });
});
