// auth.js — Supabase Auth wrapper.
// Provides signIn / signUp / signInGoogle / signOut / getUser and a single
// onAuthChange subscription that fans out to multiple listeners.
(function () {
  if (!window.sb) {
    window.SupabaseAuth = {
      enabled: false,
      getUser() { return null; },
      getSession() { return null; },
      async signIn() { throw new Error('Supabase 클라이언트 없음'); },
      async signUp() { throw new Error('Supabase 클라이언트 없음'); },
      async signInGoogle() { throw new Error('Supabase 클라이언트 없음'); },
      async sendPhoneOtp() { throw new Error('Supabase 클라이언트 없음'); },
      async verifyPhoneOtp() { throw new Error('Supabase 클라이언트 없음'); },
      async signOut() { /* no-op */ },
      onAuthChange() { return () => {}; }
    };
    return;
  }

  const listeners = new Set();
  let currentUser = null;
  let currentSession = null;
  let initialFired = false;

  function emit(event) {
    listeners.forEach(fn => {
      try { fn(currentUser, event, currentSession); }
      catch (e) { console.error('[auth] listener error:', e); }
    });
  }

  window.sb.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    currentUser = session?.user ?? null;
    emit(event);
  });

  window.sb.auth.getSession().then(({ data }) => {
    currentSession = data.session;
    currentUser = data.session?.user ?? null;
    if (!initialFired) {
      initialFired = true;
      emit('INITIAL_SESSION');
    }
  }).catch(e => console.warn('[auth] getSession failed:', e));

  window.SupabaseAuth = {
    enabled: true,
    getUser() { return currentUser; },
    getSession() { return currentSession; },
    async signUp(email, password) {
      const { data, error } = await window.sb.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },
    async signIn(email, password) {
      const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async signInGoogle() {
      const { data, error } = await window.sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      return data;
    },
    // SMS OTP step 1: ask Supabase to send the code. Phone must be E.164
    // (e.g. "+821012345678"). Caller is responsible for normalising input.
    async sendPhoneOtp(phone) {
      const { data, error } = await window.sb.auth.signInWithOtp({ phone });
      if (error) throw error;
      return data;
    },
    // SMS OTP step 2: exchange the 6-digit code for a session.
    async verifyPhoneOtp(phone, token) {
      const { data, error } = await window.sb.auth.verifyOtp({ phone, token, type: 'sms' });
      if (error) throw error;
      return data;
    },
    async signOut() {
      const { error } = await window.sb.auth.signOut();
      if (error) throw error;
    },
    onAuthChange(fn) {
      listeners.add(fn);
      if (initialFired) {
        try { fn(currentUser, 'INITIAL_SESSION', currentSession); } catch (_) {}
      }
      return () => listeners.delete(fn);
    }
  };
})();
