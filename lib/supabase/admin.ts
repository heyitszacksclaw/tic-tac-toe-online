import { createClient } from '@supabase/supabase-js';

// Admin client with service_role key — only use in API route handlers
// This bypasses RLS for server-side game operations
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
