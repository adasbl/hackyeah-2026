import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';

export async function createAuthClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('AUTH_NOT_CONFIGURED');
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components nie zapisują cookies; odświeża je middleware.
        }
      },
    },
  });
}
