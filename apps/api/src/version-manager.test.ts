import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLetterVersionUpdate } from './version-manager';

describe('handleLetterVersionUpdate', () => {
    let mockSupabase: any;

    beforeEach(() => {
        mockSupabase = {
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
        };
    });

    it('should insert version 1 when no previous versions exist', async () => {
        // Mock finding no versions
        mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });
        // Mock successful insert
        mockSupabase.insert.mockResolvedValueOnce({ error: null });

        const result = await handleLetterVersionUpdate(mockSupabase, 'letter-123', 'some content', 'user-1');

        expect(result.version).toBe(1);
        expect(mockSupabase.from).toHaveBeenCalledWith('letter_versions');
        expect(mockSupabase.insert).toHaveBeenCalledWith({
            letter_id: 'letter-123',
            version_number: 1,
            content: 'some content',
            content_hash: expect.any(String),
            created_by: 'user-1'
        });
    });

    it('should increment version number when versions exist', async () => {
        // Mock finding version 5
        mockSupabase.limit.mockResolvedValueOnce({ data: [{ version_number: 5 }], error: null });
        mockSupabase.insert.mockResolvedValueOnce({ error: null });

        const result = await handleLetterVersionUpdate(mockSupabase, 'letter-123', 'new content', 'user-1');

        expect(result.version).toBe(6);
        expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
            version_number: 6
        }));
    });

    it('should throw error if fetching versions fails', async () => {
        mockSupabase.limit.mockResolvedValueOnce({ data: null, error: { message: 'DB Error' } });

        await expect(handleLetterVersionUpdate(mockSupabase, 'id', 'c', 'u'))
            .rejects.toThrow('Failed to fetch versions: DB Error');
    });

    it('should throw error if inserting version fails', async () => {
        mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });
        mockSupabase.insert.mockResolvedValueOnce({ error: { message: 'Insert Error' } });

        await expect(handleLetterVersionUpdate(mockSupabase, 'id', 'c', 'u'))
            .rejects.toThrow('Failed to insert version: Insert Error');
    });
});
