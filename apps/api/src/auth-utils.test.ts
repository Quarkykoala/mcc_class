import { describe, expect, it, vi } from 'vitest';
import { verifyApproverRole } from './auth-utils';
import { SupabaseClient } from '@supabase/supabase-js';

describe('verifyApproverRole', () => {
  it('returns true if user has APPROVER role', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ role: 'APPROVER' }],
        error: null
      })
    } as unknown as SupabaseClient;

    const result = await verifyApproverRole(mockSupabase, 'user-123');
    expect(result).toBe(true);
  });

  it('returns true if user has ADMIN role', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ role: 'ADMIN' }],
        error: null
      })
    } as unknown as SupabaseClient;

    const result = await verifyApproverRole(mockSupabase, 'user-123');
    expect(result).toBe(true);
  });

  it('returns false if user has neither role', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ role: 'USER' }],
        error: null
      })
    } as unknown as SupabaseClient;

    const result = await verifyApproverRole(mockSupabase, 'user-123');
    expect(result).toBe(false);
  });

  it('returns false if user has no roles', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [],
        error: null
      })
    } as unknown as SupabaseClient;

    const result = await verifyApproverRole(mockSupabase, 'user-123');
    expect(result).toBe(false);
  });

  it('returns false if supabase returns error', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB Error' }
      })
    } as unknown as SupabaseClient;

    const result = await verifyApproverRole(mockSupabase, 'user-123');
    expect(result).toBe(false);
  });

    it('returns false if userId is missing', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
         data: [{ role: 'APPROVER' }],
        error: null
      })
    } as unknown as SupabaseClient;

    const result = await verifyApproverRole(mockSupabase, '');
    expect(result).toBe(false);
  });
});
