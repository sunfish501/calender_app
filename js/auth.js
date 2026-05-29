// auth.js — Supabase Auth wrapper.
// User-facing identifier is a plain ID (4–20 chars, alnum + underscore);
// internally we synthesize an email "<id>@cal-id.local" because Supabase Auth
// only supports email/phone. Email confirmation MUST be disabled in the
// Supabase Dashboard for this to work (the synthetic addresses can't receive
// real mail). Google/Phone keep their real identifiers.
(function () {
  const ID_DOMAIN = 'cal-id.local';
  function idToEmail(id)        { return String(id).toLowerCase().trim() + '@' + ID_DOMAIN; }
  function isSyntheticEmail(em) { return typeof em === 'string' && em.endsWith('@' + ID_DOMAIN); }
  function emailToId(em)        { return isSyntheticEmail(em) ? em.slice(0, -(ID_DOMAIN.length + 1)) : em; }
  function isValidId(id)        { return /^[a-zA-Z0-9_]{4,20}$/.test(String(id || '')); }
  function userDisplayName(u)   {
    if (!u) return '';
    if (isSyntheticEmail(u.email)) return emailToId(u.email);
    return u.user_metadata?.nickname || u.email || u.phone || '';
  }
  const ID_HELPERS = { idToEmail, emailToId, isSyntheticEmail, isValidId, userDisplayName };

  if (!window.sb) {
    window.SupabaseAuth = Object.assign({
      enabled: false,
      getUser() { return null; },
      getSession() { return null; },
      async signInWithId() { throw new Error('Supabase 클라이언트 없음'); },
      async signUpWithId() { throw new Error('Supabase 클라이언트 없음'); },
      async signInGoogle() { throw new Error('Supabase 클라이언트 없음'); },
      async sendPhoneOtp() { throw new Error('Supabase 클라이언트 없음'); },
      async verifyPhoneOtp() { throw new Error('Supabase 클라이언트 없음'); },
      async signOut() { /* no-op */ },
      onAuthChange() { return () => {}; }
    }, ID_HELPERS);
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

  window.SupabaseAuth = Object.assign({
    enabled: true,
    getUser() { return currentUser; },
    getSession() { return currentSession; },
    async signUpWithId(id, password, metadata) {
      if (!isValidId(id)) throw new Error('아이디는 4~20자 영문/숫자/_ 만 가능합니다');
      const { data, error } = await window.sb.auth.signUp({
        email: idToEmail(id),
        password,
        options: { data: Object.assign({ id }, metadata || {}) }
      });
      if (error) throw error;
      return data;
    },
    async signInWithId(id, password) {
      if (!isValidId(id)) throw new Error('아이디는 4~20자 영문/숫자/_ 만 가능합니다');
      const { data, error } = await window.sb.auth.signInWithPassword({
        email: idToEmail(id),
        password
      });
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
  }, ID_HELPERS);
})();
