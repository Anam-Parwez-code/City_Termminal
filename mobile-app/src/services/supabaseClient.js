import { createClient } from '@supabase/supabase-js';

// Keep these in sync with your Supabase project values.
// For production, move these to secure runtime/env config.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'REPLACE_WITH_SUPABASE_ANON_KEY'
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

