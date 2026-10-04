import 'server-only';
import { redirect } from 'next/navigation';
import { createAuthClient } from './server';
import { getSupabaseConfig } from './config';
import { isAdmin } from '@/server/admin-access';

export async function getAdmin() {
  if (!getSupabaseConfig()) return null;
  const client = await createAuthClient();
  // Odpowiedź Auth potwierdza tożsamość; nie ufamy danym sesji z cookies.
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const { db } = await import('@/db/client');
  return await isAdmin(db, user.id) ? user : null;
}

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/login');
  return admin;
}
