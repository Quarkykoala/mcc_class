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
    req.user = { id: 'approver-1', roles: ['ADMIN', 'APPROVER', 'ISSUER'] };
    next();
  }
}));

vi.mock('./auth-routes', () => {
  const { Router } = require('express');
  return { default: Router(), verifyToken: vi.fn() };
});

vi.mock('./version-manager', () => ({
  handleLetterVersionUpdate: vi.fn(async () => ({ version: 2, hash: 'hash' }))
}));

import { app } from './app';

describe('approval routing flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockExecute.mockResolvedValue({ affectedRows: 1, insertId: 0 });
  });

  it('supports routing endpoint', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'l1', status: 'DRAFT', committee_id: null, created_by: 'approver-1', department_id: 'd1' });
    const res = await request(app).post('/api/letters/l1/routing').send({ tag_ids: [], cc_approver_ids: [] });
    expect(res.status).toBe(200);
  });

  it('supports submit endpoint', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'l1', status: 'DRAFT', committee_id: 'c1', created_by: 'approver-1', department_id: 'd1' });
    const res = await request(app).post('/api/letters/l1/submit').send({});
    expect(res.status).toBe(200);
  });

  it('supports create endpoint with title/job_reference', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'dept-1' })
      .mockResolvedValueOnce({ id: 'new-id', status: 'DRAFT', title: 'Offer Letter', job_reference: 'JR-1001', to_text: 'Client', cc_text: 'Ops', subject: 'Offer', signature_name: 'Alex', signature_title: 'Manager', template_key: 'official' });
    const res = await request(app).post('/api/letters').send({
      context: 'COMPANY',
      content: 'Draft content',
      title: 'Offer Letter',
      job_reference: 'JR-1001',
      to_text: 'Client',
      cc_text: 'Ops',
      subject: 'Offer',
      signature_name: 'Alex',
      signature_title: 'Manager',
      template_key: 'official',
      tag_ids: []
    });
    expect(res.status).toBe(201);
  });

  it('supports GET /api/approvals/pending happy path', async () => {
    mockQuery
      .mockResolvedValueOnce([{ letter_id: 'l1' }])
      .mockResolvedValueOnce([{ id: 'l1', context: 'COMPANY', status: 'SUBMITTED', created_by: 'approver-1', department_id: 'd1', dept_name: 'HR', title: null, job_reference: null, letter_number: null, rejection_reason: null, approval_mode: 'ALL', created_at: new Date().toISOString(), updated_at: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await request(app).get('/api/approvals/pending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('supports GET /api/approvers happy path', async () => {
    mockQuery.mockResolvedValueOnce([
      { user_id: 'approver-1', role: 'APPROVER' },
      { user_id: 'approver-1', role: 'ADMIN' },
      { user_id: 'approver-2', role: 'APPROVER' }
    ]);
    const res = await request(app).get('/api/approvers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((item: any) => item.id === 'approver-1')).toBe(true);
    const approverOne = res.body.find((item: any) => item.id === 'approver-1');
    expect(approverOne?.roles).toEqual(expect.arrayContaining(['ADMIN', 'APPROVER']));
  });

  it('POST /api/letters/bulk should return 404 after removal', async () => {
    const res = await request(app)
      .post('/api/letters/bulk')
      .send({ action: 'approve', letter_ids: ['1'] });
    expect(res.status).toBe(404);
  });

  it('supports GET /api/letters/:id/audit-logs happy path', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'l1', department_id: 'd1', created_by: 'approver-1' });
    mockQuery.mockResolvedValueOnce([{ id: 'log1', action: 'CREATE' }, { id: 'log2', action: 'SUBMIT' }]);
    const res = await request(app).get('/api/letters/l1/audit-logs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

});
