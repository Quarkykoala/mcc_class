import { SupabaseClient } from '@supabase/supabase-js';

export async function verifyApproverRole(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  const { data: userRoles, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (error || !userRoles) {
    // Log error in a real app
    return false;
  }

  const allowedRoles = ['APPROVER', 'ADMIN'];
  return userRoles.some((r: { role: string }) => allowedRoles.includes(r.role));
}
