import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifyApproverRole } from './auth-utils';
const mockQuery = vi.fn();
vi.mock('./db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
describe('verifyApproverRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('returns true if user has APPROVER role', async () => {
    mockQuery.mockResolvedValue([{ role: 'APPROVER' }]);
    const result = await verifyApproverRole('user-123');
    expect(result).toBe(true);
  });
  it('returns true if user has ADMIN role', async () => {
    mockQuery.mockResolvedValue([{ role: 'ADMIN' }]);
    const result = await verifyApproverRole('user-123');
    expect(result).toBe(true);
  });
  it('returns false if user has neither role', async () => {
    mockQuery.mockResolvedValue([{ role: 'USER' }]);
    const result = await verifyApproverRole('user-123');
    expect(result).toBe(false);
  });
  it('returns false if user has no roles', async () => {
    mockQuery.mockResolvedValue([]);
    const result = await verifyApproverRole('user-123');
    expect(result).toBe(false);
  });
  it('returns false if query throws', async () => {
    mockQuery.mockRejectedValue(new Error('DB Error'));
    const result = await verifyApproverRole('user-123');
    expect(result).toBe(false);
  });
  it('logs error if query throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValue(new Error('DB Error'));
    const result = await verifyApproverRole('user-123');
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching user roles'), expect.any(Error));
    consoleSpy.mockRestore();
  });
  it('returns false if userId is missing', async () => {
    const result = await verifyApproverRole('');
    expect(result).toBe(false);
  });
});
