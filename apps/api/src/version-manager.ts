import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const handleLetterVersionUpdate = async (
    supabase: SupabaseClient,
    letterId: string,
    content: string,
    createdBy: string
) => {
    // 1. Get current max version
    // We select the version_number from letter_versions where letter_id matches.
    // We order by version_number descending and limit to 1.
    const { data: versions, error: versionError } = await supabase
        .from('letter_versions')
        .select('version_number')
        .eq('letter_id', letterId)
        .order('version_number', { ascending: false })
        .limit(1);

    if (versionError) {
        throw new Error(`Failed to fetch versions: ${versionError.message}`);
    }

    const currentVersion = versions && versions.length > 0 ? versions[0].version_number : 0;
    const nextVersion = currentVersion + 1;

    // 2. Calculate Hash
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // 3. Insert new version
    const { error: insertError } = await supabase
        .from('letter_versions')
        .insert({
            letter_id: letterId,
            version_number: nextVersion,
            content: content,
            content_hash: contentHash,
            created_by: createdBy
        });

    if (insertError) {
        throw new Error(`Failed to insert version: ${insertError.message}`);
    }

    return { version: nextVersion, hash: contentHash };
};
