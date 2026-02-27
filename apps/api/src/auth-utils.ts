import { query } from './db';

export async function verifyApproverRole(
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  try {
    const userRoles = await query<{ role: string }>(
      'SELECT role FROM user_roles WHERE user_id = ?',
      [userId]
    );

    if (!userRoles || userRoles.length === 0) {
      return false;
    }

    const allowedRoles = ['APPROVER', 'ADMIN'];
    return userRoles.some((r) => allowedRoles.includes(r.role));
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return false;
  }
}
