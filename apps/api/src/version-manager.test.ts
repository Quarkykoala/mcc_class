import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLetterVersionUpdate } from './version-manager';

const mockQueryOne = vi.fn();
const mockExecute = vi.fn();

vi.mock('./db', () => ({
    query: vi.fn(),
    queryOne: (...args: unknown[]) => mockQueryOne(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
}));

vi.mock('./uuid', () => ({ uuidv4: () => 'test-uuid' }));

describe('handleLetterVersionUpdate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should insert version 1 when no previous versions exist', async () => {
        mockQueryOne.mockResolvedValueOnce(null);
        mockExecute.mockResolvedValueOnce({});

        const result = await handleLetterVersionUpdate('letter-123', 'some content', 'user-1');

        expect(result.version).toBe(1);
        expect(mockExecute).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO letter_versions'),
            expect.arrayContaining(['test-uuid', 'letter-123', 1, 'some content', expect.any(String), 'user-1'])
        );
    });

    it('should increment version number when versions exist', async () => {
        mockQueryOne.mockResolvedValueOnce({ version_number: 5 });
        mockExecute.mockResolvedValueOnce({});

        const result = await handleLetterVersionUpdate('letter-123', 'new content', 'user-1');

        expect(result.version).toBe(6);
        expect(mockExecute).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO letter_versions'),
            expect.arrayContaining([expect.any(String), 'letter-123', 6, 'new content', expect.any(String), 'user-1'])
        );
    });

    it('should throw error if fetching versions fails', async () => {
        mockQueryOne.mockRejectedValueOnce(new Error('DB Error'));

        await expect(handleLetterVersionUpdate('id', 'c', 'u'))
            .rejects.toThrow('DB Error');
    });

    it('should throw error if inserting version fails', async () => {
        mockQueryOne.mockResolvedValueOnce(null);
        mockExecute.mockRejectedValueOnce(new Error('Insert Error'));

        await expect(handleLetterVersionUpdate('id', 'c', 'u'))
            .rejects.toThrow('Insert Error');
    });
});
