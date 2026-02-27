import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from './db';

export const handleLetterVersionUpdate = async (
    letterId: string,
    content: string,
    createdBy: string
) => {
    // 1. Get current max version
    const latest = await queryOne<{ version_number: number }>(
        'SELECT version_number FROM letter_versions WHERE letter_id = ? ORDER BY version_number DESC LIMIT 1',
        [letterId]
    );

    const currentVersion = latest ? latest.version_number : 0;
    const nextVersion = currentVersion + 1;

    // 2. Calculate Hash
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // 3. Insert new version
    const versionId = uuidv4();
    await execute(
        'INSERT INTO letter_versions (id, letter_id, version_number, content, content_hash, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [versionId, letterId, nextVersion, content, contentHash, createdBy]
    );

    return { version: nextVersion, hash: contentHash };
};
