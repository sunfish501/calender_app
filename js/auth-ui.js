// auth-ui.js — login modal + logout button. Wires Supabase Auth state to
// claim_orphan_events and a full user_data pull on first sign-in.
(function () {
  if (!window.SupabaseAuth?.enabled) return;

  const CLAIM_FLAG_KEY = 'calendar-supabase-claimed-v1';
  let modal = null;
  let logoutBtn = null;

  function setBusy(buttons, on) {
    buttons.forEach(b => { if (b) b.disabled = on; });
  }

  function buildModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'sb-auth-modal';
    modal.style.cssText = [
      'position:fixed','inset:0','z-index:100000',
      'background:rgba(0,0,0,.5)','backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'display:none','align-items:center','justify-content:center'
    ].join(';');
    modal.innerHTML = `
<div style="background:#fff;padding:28px 28px 24px;border-radius:14px;width:340px;max-width:90vw;box-shadow:0 12px 32px rgba(0,0,0,.25);font:14px/1.4 system-ui,-apple-system,sans-serif;">
  <h2 style="margin:0 0 18px;font-size:20px;text-align:center;color:#222;">달력 로그인</h2>
  <input id="sb-auth-email" type="email" placeholder="이메일" autocomplete="email"
         style="width:100%;padding:10px 12px;border:1px solid #d8d8dc;border-radius:8px;margin-bottom:8px;box-sizing:border-box;font-size:14px;">
  <input id="sb-auth-pw" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="current-password"
         style="width:100%;padding:10px 12px;border:1px solid #d8d8dc;border-radius:8px;margin-bottom:10px;box-sizing:border-box;font-size:14px;">
  <div id="sb-auth-msg" style="color:#c33;font-size:12px;margin-bottom:8px;min-height:16px;line-height:1.3;"></div>
  <button id="sb-auth-signin" style="width:100%;padding:11px;background:#2874e0;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;margin-bottom:6px;">로그인</button>
  <button id="sb-auth-signup" style="width:100%;padding:11px;background:#fff;color:#2874e0;border:1px solid #2874e0;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;margin-bottom:14px;">회원가입</button>
  <div style="text-align:center;color:#aaa;font-size:12px;margin:0 0 10px;position:relative;">
    <span style="background:#fff;padding:0 12px;position:relative;z-index:1;">또는</span>
    <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#eee;"></div>
  </div>
  <button id="sb-auth-google" style="width:100%;padding:11px;background:#fff;color:#444;border:1px solid #d8d8dc;border-radius:8px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:10px;">
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"/>
      <path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"/>
    </svg>
    <span>Google로 계속</span>
  </button>
</div>`;
    document.body.appendChild(modal);

    const email = modal.querySelector('#sb-auth-email');
    const pw    = modal.querySelector('#sb-auth-pw');
    const msg   = modal.querySelector('#sb-auth-msg');
    const sin   = modal.querySelector('#sb-auth-signin');
    const sup   = modal.querySelector('#sb-auth-signup');
    const goog  = modal.querySelector('#sb-auth-google');
    const allBtns = [sin, sup, goog];

    function setMsg(text, color) {
      msg.style.color = color || '#c33';
      msg.textContent = text || '';
    }

    async function doSignIn() {
      if (!email.value.trim() || !pw.value) { setMsg('이메일/비밀번호 입력'); return; }
      setMsg(''); setBusy(allBtns, true);
      try {
        await window.SupabaseAuth.signIn(email.value.trim(), pw.value);
      } catch (e) {
        setMsg(e.message || '로그인 실패');
      } finally { setBusy(allBtns, false); }
    }
    async function doSignUp() {
      if (!email.value.trim()) { setMsg('이메일을 입력하세요'); return; }
      if (pw.value.length < 6) { setMsg('비밀번호는 6자 이상'); return; }
      setMsg(''); setBusy(allBtns, true);
      try {
        const result = await window.SupabaseAuth.signUp(email.value.trim(), pw.value);
        if (!result?.session) {
          setMsg('확인 이메일을 보냈습니다. 인증 후 다시 로그인하세요.', '#2874e0');
        }
      } catch (e) {
        setMsg(e.message || '회원가입 실패');
      } finally { setBusy(allBtns, false); }
    }
    async function doGoogle() {
      setMsg(''); setBusy(allBtns, true);
      try {
        await window.SupabaseAuth.signInGoogle();
      } catch (e) {
        setMsg(e.message || 'Google 로그인 실패');
        setBusy(allBtns, false);
      }
    }

    sin.onclick = doSignIn;
    sup.onclick = doSignUp;
    goog.onclick = doGoogle;
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
    email.addEventListener('keydown', e => { if (e.key === 'Enter') pw.focus(); });

    return modal;
  }

  function buildLogoutBtn() {
    if (logoutBtn) return logoutBtn;
    logoutBtn = document.createElement('button');
    logoutBtn.id = 'sb-logout-btn';
    logoutBtn.textContent = '로그아웃';
    logoutBtn.style.cssText = [
      'position:fixed','top:10px','right:10px','z-index:9000',
      'padding:6px 12px','background:rgba(255,255,255,.92)',
      'border:1px solid #d8d8dc','border-radius:8px','cursor:pointer',
      'font:12px system-ui,sans-serif','color:#444',
      'box-shadow:0 1px 3px rgba(0,0,0,.08)','display:none'
    ].join(';');
    logoutBtn.onclick = async () => {
      logoutBtn.disabled = true;
      logoutBtn.textContent = '나가는 중…';
      try { await window.SupabaseAuth.signOut(); }
      catch (e) { console.warn('signOut error:', e); }
      finally {
        logoutBtn.disabled = false;
        logoutBtn.textContent = '로그아웃';
      }
    };
    document.body.appendChild(logoutBtn);
    return logoutBtn;
  }

  function showModal() {
    buildModal().style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => modal?.querySelector('#sb-auth-email')?.focus(), 50);
  }
  function hideModal() {
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  function showLogout(email) {
    const b = buildLogoutBtn();
    b.style.display = 'block';
    b.title = email ? `로그인됨: ${email}` : '로그인됨';
  }
  function hideLogout() { if (logoutBtn) logoutBtn.style.display = 'none'; }

  // Disable the legacy fake-login gate so it doesn't double up with the modal
  try { localStorage.setItem('calendar-login-mode-v1', 'no-login'); } catch (_) {}

  async function onSignedIn(user, fromInitial) {
    hideModal();
    showLogout(user.email);

    if (!localStorage.getItem(CLAIM_FLAG_KEY)) {
      try {
        const { data, error } = await window.sb.rpc('claim_orphan_events');
        if (!error) localStorage.setItem(CLAIM_FLAG_KEY, String(data || 0));
        else console.warn('[auth-ui] claim_orphan_events:', error);
      } catch (e) { console.warn('[auth-ui] claim_orphan_events:', e); }
    }

    let restored = 0;
    try {
      const r = await window.UserDataSync?.pullAll();
      restored = r?.restored || 0;
    } catch (e) { console.warn('[auth-ui] user_data pull:', e); }

    window.SupabaseSync?.forceReady();

    // On a fresh sign-in (not page-load with existing session), reload so the
    // inline calendar script re-initialises with the new session: pulls cloud
    // events via RLS and uses the freshly-restored user_data in localStorage.
    if (!fromInitial) {
      setTimeout(() => window.location.reload(), 150);
    }
  }

  function onSignedOut() {
    hideLogout();
    localStorage.removeItem(CLAIM_FLAG_KEY);
    showModal();
  }

  window.SupabaseAuth.onAuthChange((user, event) => {
    if (user) onSignedIn(user, event === 'INITIAL_SESSION');
    else if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') onSignedOut();
  });
})();
