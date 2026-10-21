/**
 * Supabase is optional while developing: without these variables the app runs
 * in "preview mode" (no sign-in, nothing saved) so the UI can still be built
 * and checked.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
