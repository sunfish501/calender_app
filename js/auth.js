// auth.js — placeholder for future Supabase Auth integration.
// Current RLS is public (anon read/write); no authentication is required yet.
// When auth is enabled, expose helpers like signIn/signOut/getSession here
// and switch RLS policies to auth.uid()-based ones.
window.SupabaseAuth = {
  enabled: false,
  getUser() { return null; },
  async signIn() { throw new Error('SupabaseAuth not yet implemented'); },
  async signOut() { /* no-op */ }
};
