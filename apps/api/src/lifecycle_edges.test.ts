import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockExecute = vi.fn();
const mockTransaction = vi.fn();

vi.mock('./db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args),
  queryWithConn: vi.fn(),
  queryOneWithConn: vi.fn(),
  executeWithConn: vi.fn(),
}));

vi.mock('./auth-middleware', () => ({
  authMiddleware: () => (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', roles: ['APPROVER'] };
    next();
  }
}));

vi.mock('./auth-routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Router } = require('express');
  return { default: Router(), verifyToken: vi.fn() };
});

vi.mock('./version-manager', () => ({
  handleLetterVersionUpdate: vi.fn(async () => ({ version: 2, hash: 'hash' }))
}));

import { app } from './app';

describe('lifecycle edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockExecute.mockResolvedValue({ affectedRows: 1, insertId: 0 });
  });

  it('rejects submit without approvers', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'l1', status: 'DRAFT', committee_id: null, created_by: 'user-1', department_id: 'd1' });
    mockQuery.mockResolvedValueOnce([]); // no assignments
    const res = await request(app).post('/api/letters/l1/submit').send({});
    expect(res.status).toBe(400);
  });

  it('rejects approve when not assigned', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'l1', status: 'SUBMITTED', committee_id: null, created_by: 'user-1', department_id: 'd1' });
    mockQueryOne.mockResolvedValueOnce(null); // no assignment
    const res = await request(app).post('/api/letters/l1/approve').send({});
    expect(res.status).toBe(403);
  });

  it('rejects issue when not approved', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'l1', status: 'SUBMITTED', department_id: 'd1', created_by: 'user-1', context: 'COMPANY' });
    const res = await request(app).post('/api/letters/l1/issue').send({});
    expect(res.status).toBe(400);
  });
});
