import { createClient } from '@supabase/supabase-js';

// Anon key + RLS (read-only). Safe for server components.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);
