// auth-ui.js — login modal + logout button. Wires Supabase Auth state to
// claim_orphan_events and a full user_data pull on first sign-in.
(function () {
  if (!window.SupabaseAuth?.enabled) return;

  const CLAIM_FLAG_KEY = 'calendar-supabase-claimed-v1';
  // Set right before calling signIn/signUp/signInGoogle so onSignedIn can tell
  // a fresh user-triggered login from a SIGNED_IN that fires on session restore.
  const PENDING_SIGNIN_KEY = 'sb-fresh-signin-pending';
  let modal = null;
  let profileWrap = null;
  let profileBtn  = null;
  let profileMenu = null;
  let profileOpen = false;

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
    ));
  }

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
  <h2 id="sb-auth-title" style="margin:0 0 18px;font-size:20px;text-align:center;color:#222;">달력 로그인</h2>

  <!-- view: id/password -->
  <div id="sb-view-email">
    <input id="sb-auth-id" type="text" placeholder="아이디 (4~20자, 영문/숫자/_)" autocomplete="username"
           style="width:100%;padding:10px 12px;border:1px solid #d8d8dc;border-radius:8px;margin-bottom:8px;box-sizing:border-box;font-size:14px;">
    <input id="sb-auth-pw" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="current-password"
           style="width:100%;padding:10px 12px;border:1px solid #d8d8dc;border-radius:8px;margin-bottom:10px;box-sizing:border-box;font-size:14px;">
    <div id="sb-auth-msg" style="color:#c33;font-size:12px;margin-bottom:8px;min-height:16px;line-height:1.3;"></div>
    <button id="sb-auth-signin" style="width:100%;padding:11px;background:#2874e0;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;margin-bottom:10px;">로그인</button>
    <div style="text-align:center;font-size:13px;color:#666;margin-bottom:14px;">
      계정이 없으신가요? <a id="sb-auth-signup-link" href="signup.html" style="color:#2874e0;text-decoration:none;font-weight:500;">회원가입</a>
    </div>
    <div style="text-align:center;color:#aaa;font-size:12px;margin:0 0 10px;position:relative;">
      <span style="background:#fff;padding:0 12px;position:relative;z-index:1;">또는</span>
      <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#eee;"></div>
    </div>
    <button id="sb-auth-google" style="width:100%;padding:11px;background:#fff;color:#444;border:1px solid #d8d8dc;border-radius:8px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"/>
        <path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691"/>
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"/>
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"/>
      </svg>
      <span>Google로 계속</span>
    </button>
    <button id="sb-auth-go-phone" style="width:100%;padding:11px;background:#fff;color:#444;border:1px solid #d8d8dc;border-radius:8px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:10px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
      </svg>
      <span>전화번호로 계속</span>
    </button>
  </div>

  <!-- view: phone step 1 (enter number) -->
  <div id="sb-view-phone1" style="display:none;">
    <input id="sb-phone-input" type="tel" placeholder="010-1234-5678" autocomplete="tel"
           style="width:100%;padding:10px 12px;border:1px solid #d8d8dc;border-radius:8px;margin-bottom:6px;box-sizing:border-box;font-size:14px;">
    <div style="color:#888;font-size:11px;margin-bottom:10px;line-height:1.4;">
      한국 번호는 010… 으로 입력 (자동으로 +82 변환).<br>
      해외 번호는 +국가코드 형식으로 직접 입력.
    </div>
    <div id="sb-phone-msg" style="color:#c33;font-size:12px;margin-bottom:8px;min-height:16px;line-height:1.3;"></div>
    <button id="sb-phone-send" style="width:100%;padding:11px;background:#2874e0;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;margin-bottom:8px;">인증번호 받기</button>
    <button id="sb-phone-back1" style="width:100%;padding:9px;background:#fff;color:#666;border:1px solid #e0e0e3;border-radius:8px;cursor:pointer;font-size:13px;">← 이메일/Google 로 돌아가기</button>
  </div>

  <!-- view: phone step 2 (enter OTP) -->
  <div id="sb-view-phone2" style="display:none;">
    <div id="sb-phone-target" style="color:#444;font-size:13px;margin-bottom:10px;text-align:center;"></div>
    <input id="sb-otp-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
           placeholder="6자리 인증번호" autocomplete="one-time-code"
           style="width:100%;padding:10px 12px;border:1px solid #d8d8dc;border-radius:8px;margin-bottom:10px;box-sizing:border-box;font-size:18px;text-align:center;letter-spacing:6px;">
    <div id="sb-otp-msg" style="color:#c33;font-size:12px;margin-bottom:8px;min-height:16px;line-height:1.3;"></div>
    <button id="sb-otp-verify" style="width:100%;padding:11px;background:#2874e0;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;margin-bottom:6px;">확인</button>
    <button id="sb-otp-resend" style="width:100%;padding:9px;background:#fff;color:#2874e0;border:1px solid #2874e0;border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:8px;">인증번호 다시 보내기</button>
    <button id="sb-phone-back2" style="width:100%;padding:9px;background:#fff;color:#666;border:1px solid #e0e0e3;border-radius:8px;cursor:pointer;font-size:13px;">← 번호 다시 입력</button>
  </div>
</div>`;
    document.body.appendChild(modal);

    const title = modal.querySelector('#sb-auth-title');
    const viewEmail  = modal.querySelector('#sb-view-email');
    const viewPhone1 = modal.querySelector('#sb-view-phone1');
    const viewPhone2 = modal.querySelector('#sb-view-phone2');

    const idInput = modal.querySelector('#sb-auth-id');
    const pw    = modal.querySelector('#sb-auth-pw');
    const msg   = modal.querySelector('#sb-auth-msg');
    const sin   = modal.querySelector('#sb-auth-signin');
    const goog  = modal.querySelector('#sb-auth-google');
    const goPhone = modal.querySelector('#sb-auth-go-phone');

    const phoneInput = modal.querySelector('#sb-phone-input');
    const phoneMsg   = modal.querySelector('#sb-phone-msg');
    const phoneSend  = modal.querySelector('#sb-phone-send');
    const phoneBack1 = modal.querySelector('#sb-phone-back1');

    const phoneTarget = modal.querySelector('#sb-phone-target');
    const otpInput   = modal.querySelector('#sb-otp-input');
    const otpMsg     = modal.querySelector('#sb-otp-msg');
    const otpVerify  = modal.querySelector('#sb-otp-verify');
    const otpResend  = modal.querySelector('#sb-otp-resend');
    const phoneBack2 = modal.querySelector('#sb-phone-back2');

    const allBtns = [sin, goog, goPhone, phoneSend, phoneBack1, otpVerify, otpResend, phoneBack2];

    let normalisedPhone = '';  // last phone we sent OTP to, in E.164

    function showView(name) {
      viewEmail.style.display  = name === 'email'  ? '' : 'none';
      viewPhone1.style.display = name === 'phone1' ? '' : 'none';
      viewPhone2.style.display = name === 'phone2' ? '' : 'none';
      title.textContent =
        name === 'email'  ? '달력 로그인' :
        name === 'phone1' ? '전화번호 입력' :
                            '인증번호 입력';
    }

    function normalisePhone(raw) {
      const cleaned = String(raw || '').replace(/[\s\-()]/g, '');
      if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;             // already E.164
      if (/^0\d{9,10}$/.test(cleaned))  return '+82' + cleaned.slice(1);  // Korean local
      return null;
    }

    function setMsg(text, color) {
      msg.style.color = color || '#c33';
      msg.textContent = text || '';
    }

    async function doSignIn() {
      const id = idInput.value.trim();
      if (!id || !pw.value) { setMsg('아이디/비밀번호 입력'); return; }
      if (!window.SupabaseAuth.isValidId(id)) {
        setMsg('아이디는 4~20자 영문/숫자/_ 만 가능합니다');
        return;
      }
      setMsg(''); setBusy(allBtns, true);
      try {
        sessionStorage.setItem(PENDING_SIGNIN_KEY, '1');
        await window.SupabaseAuth.signInWithId(id, pw.value);
      } catch (e) {
        sessionStorage.removeItem(PENDING_SIGNIN_KEY);
        const m = e.message || '로그인 실패';
        // Supabase returns this for both wrong-password AND non-existent user.
        if (/invalid login/i.test(m)) setMsg('아이디 또는 비밀번호가 올바르지 않습니다');
        else setMsg(m);
      } finally { setBusy(allBtns, false); }
    }
    async function doGoogle() {
      setMsg(''); setBusy(allBtns, true);
      try {
        sessionStorage.setItem(PENDING_SIGNIN_KEY, '1');
        await window.SupabaseAuth.signInGoogle();
      } catch (e) {
        sessionStorage.removeItem(PENDING_SIGNIN_KEY);
        setMsg(e.message || 'Google 로그인 실패');
        setBusy(allBtns, false);
      }
    }

    function setPhoneMsg(text, color) {
      phoneMsg.style.color = color || '#c33';
      phoneMsg.textContent = text || '';
    }
    function setOtpMsg(text, color) {
      otpMsg.style.color = color || '#c33';
      otpMsg.textContent = text || '';
    }

    async function doSendOtp() {
      const e164 = normalisePhone(phoneInput.value);
      if (!e164) {
        setPhoneMsg('번호 형식이 올바르지 않습니다 (예: 010-1234-5678 또는 +1...)');
        return;
      }
      setPhoneMsg(''); setBusy(allBtns, true);
      try {
        await window.SupabaseAuth.sendPhoneOtp(e164);
        normalisedPhone = e164;
        phoneTarget.textContent = e164 + ' 으로 인증번호를 보냈습니다';
        otpInput.value = '';
        setOtpMsg('');
        showView('phone2');
        setTimeout(() => otpInput.focus(), 50);
      } catch (e) {
        const m = e.message || 'SMS 전송 실패';
        // Common Supabase error when phone provider isn't configured yet.
        if (/provider.*not.*enabled/i.test(m) || /phone.*not.*configured/i.test(m)) {
          setPhoneMsg('Supabase 에 SMS provider 가 아직 연결되지 않았습니다');
        } else {
          setPhoneMsg(m);
        }
      } finally { setBusy(allBtns, false); }
    }

    async function doVerifyOtp() {
      const token = (otpInput.value || '').trim();
      if (!/^\d{6}$/.test(token)) { setOtpMsg('6자리 숫자를 입력하세요'); return; }
      if (!normalisedPhone)       { setOtpMsg('전화번호 다시 입력하세요'); showView('phone1'); return; }
      setOtpMsg(''); setBusy(allBtns, true);
      try {
        sessionStorage.setItem(PENDING_SIGNIN_KEY, '1');
        await window.SupabaseAuth.verifyPhoneOtp(normalisedPhone, token);
        // SIGNED_IN will fire; onSignedIn handles the rest.
      } catch (e) {
        sessionStorage.removeItem(PENDING_SIGNIN_KEY);
        setOtpMsg(e.message || '인증 실패');
      } finally { setBusy(allBtns, false); }
    }

    sin.onclick = doSignIn;
    goog.onclick = doGoogle;
    goPhone.onclick = () => {
      phoneInput.value = '';
      setPhoneMsg('');
      showView('phone1');
      setTimeout(() => phoneInput.focus(), 50);
    };
    phoneBack1.onclick = () => showView('email');
    phoneBack2.onclick = () => showView('phone1');
    phoneSend.onclick  = doSendOtp;
    otpVerify.onclick  = doVerifyOtp;
    otpResend.onclick  = doSendOtp;

    pw.addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
    idInput.addEventListener('keydown', e => { if (e.key === 'Enter') pw.focus(); });
    phoneInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSendOtp(); });
    otpInput.addEventListener('keydown',   e => { if (e.key === 'Enter') doVerifyOtp(); });

    return modal;
  }

  // ─── 아이디 설정 모달 (Google/전화 로그인 후 최초 1회) ───
  // Supabase Auth는 OAuth/SMS 사용자에 대해 id metadata가 없음.
  // 표시명/공유 목적상 사용자가 직접 4~20자 ID를 한 번만 등록.
  let idSetupModal = null;
  function buildIdSetupModal() {
    if (idSetupModal) return idSetupModal;
    idSetupModal = document.createElement('div');
    idSetupModal.id = 'sb-idsetup-modal';
    idSetupModal.style.cssText = [
      'position:fixed','inset:0','z-index:100050',
      'background:rgba(0,0,0,.5)','backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'display:none','align-items:center','justify-content:center',
      'font:14px -apple-system,BlinkMacSystemFont,"Segoe UI","Roboto","Malgun Gothic",sans-serif'
    ].join(';');
    idSetupModal.innerHTML = `
<div style="background:#fff;padding:28px;border-radius:16px;width:380px;max-width:92vw;box-shadow:0 1px 2px rgba(60,64,67,.3),0 8px 24px rgba(60,64,67,.18);">
  <div style="text-align:center;margin-bottom:18px;">
    <div style="width:56px;height:56px;border-radius:14px;background:#e8f0fe;color:#1a73e8;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    </div>
    <h2 style="margin:0;font-size:18px;font-weight:500;color:#202124;">사용할 아이디를 정해주세요</h2>
    <p style="margin:6px 0 0;font-size:13px;color:#5f6368;line-height:1.5;">
      친구에게 공유하거나 표시할 때 쓰입니다.<br>한 번만 설정하면 됩니다.
    </p>
  </div>
  <label style="display:block;font-size:12px;color:#5f6368;margin-bottom:5px;">아이디</label>
  <input id="sb-idsetup-input" type="text" placeholder="예) hong_gildong"
         autocomplete="username" maxlength="20"
         style="width:100%;padding:11px 13px;border:1px solid #dadce0;border-radius:8px;font:14px ui-monospace,SFMono-Regular,Menlo,monospace;box-sizing:border-box;">
  <div style="color:#5f6368;font-size:11px;margin:5px 2px 0;line-height:1.4;">
    4~20자 · 영문/숫자/_ 만 가능
  </div>
  <div id="sb-idsetup-msg" style="color:#d93025;font-size:12px;min-height:16px;margin-top:8px;line-height:1.4;"></div>
  <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
    <button id="sb-idsetup-skip" style="padding:9px 16px;background:transparent;color:#5f6368;border:none;border-radius:6px;cursor:pointer;font:500 13px inherit;">나중에</button>
    <button id="sb-idsetup-save" style="padding:9px 18px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font:500 13px inherit;">저장</button>
  </div>
</div>`;
    document.body.appendChild(idSetupModal);

    const input = idSetupModal.querySelector('#sb-idsetup-input');
    const msg   = idSetupModal.querySelector('#sb-idsetup-msg');
    const save  = idSetupModal.querySelector('#sb-idsetup-save');
    const skip  = idSetupModal.querySelector('#sb-idsetup-skip');

    async function doSave() {
      const id = input.value.trim();
      msg.textContent = '';
      if (!window.SupabaseAuth.isValidId(id)) {
        msg.textContent = '4~20자 영문/숫자/_ 만 가능합니다';
        input.focus();
        return;
      }
      save.disabled = true;
      const original = save.textContent;
      save.textContent = '저장 중…';
      try {
        const { error } = await window.sb.auth.updateUser({ data: { id, nickname: id } });
        if (error) throw error;
        // 저장 성공 → 영구 skip 표시 (updateUser 후 user 객체 반영이 지연돼도
        // 다음 reload 시 모달이 다시 뜨지 않게 함)
        try { localStorage.setItem(ID_SETUP_PERMA_SKIP, '1'); } catch (_) {}
        hideIdSetup();
      } catch (e) {
        msg.textContent = e.message || '저장 실패';
        save.disabled = false;
        save.textContent = original;
      }
    }
    save.onclick = doSave;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
    skip.onclick = () => {
      // "나중에" 도 영구 skip 으로 처리. 사용자가 거듭 무시한 선택을 매 로그인마다
      // 다시 물어보는 건 불쾌한 UX → ID 설정은 사용자가 프로필 메뉴에서 자발적으로
      // 다시 열 수 있도록 한다 (showIdSetup 을 전역에 노출).
      try { localStorage.setItem(ID_SETUP_PERMA_SKIP, '1'); } catch (_) {}
      try { sessionStorage.setItem('sb-idsetup-skipped', '1'); } catch (_) {}
      hideIdSetup();
    };
    return idSetupModal;
  }
  // 프로필 메뉴에서 ID 설정을 다시 열 수 있게 전역 노출
  window.SupabaseShowIdSetup = function () {
    try { localStorage.removeItem(ID_SETUP_PERMA_SKIP); } catch (_) {}
    try { sessionStorage.removeItem('sb-idsetup-skipped'); } catch (_) {}
    showIdSetup();
  };
  function showIdSetup() {
    const m = buildIdSetupModal();
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => m.querySelector('#sb-idsetup-input')?.focus(), 50);
  }
  function hideIdSetup() {
    if (idSetupModal) idSetupModal.style.display = 'none';
    document.body.style.overflow = '';
  }
  // 아이디 설정이 필요한 사용자인지 판단. 보수적으로: 명확히 "아이디가 없는
  // OAuth/전화 사용자" 일 때만 모달을 띄운다. 다음 중 하나라도 해당하면 skip:
  //  - 미로그인
  //  - 합성 이메일(id@cal-id.local) → ID 가 이메일에 박혀 있음
  //  - user_metadata.id 또는 nickname 또는 full_name 또는 name 이 이미 있음
  //    (구글 사용자는 보통 full_name / name 이 채워져 있으므로 표시명 OK)
  //  - localStorage 에 한 번 영구 skip 표시가 있음
  //  - 이번 세션에서 "나중에" 를 눌러 skip 상태
  // 모달이 무차별로 떠서 모토 박스를 가린다는 사용자 보고를 해결.
  const ID_SETUP_PERMA_SKIP = 'sb-idsetup-perm-skipped';
  function needsIdSetup(user) {
    if (!user) return false;
    if (window.SupabaseAuth.isSyntheticEmail(user.email)) return false;
    const meta = user.user_metadata || {};
    if (meta.id || meta.nickname || meta.full_name || meta.name) return false;
    if (sessionStorage.getItem('sb-idsetup-skipped') === '1') return false;
    try { if (localStorage.getItem(ID_SETUP_PERMA_SKIP) === '1') return false; } catch (_) {}
    return true;
  }

  // Pastel-ish palette; pick deterministically from the display name so the
  // same user always gets the same colour across reloads.
  const AVATAR_COLORS = ['#5b8def','#e07a5f','#7fb069','#b07ce0','#d99a3e','#3aa9a0','#d96aa6','#6b7280'];
  function colorFor(name) {
    const s = String(name || '?');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  function closeProfileMenu() {
    if (!profileMenu) return;
    profileMenu.style.display = 'none';
    profileOpen = false;
  }

  function buildProfile() {
    if (profileWrap) return profileWrap;

    profileWrap = document.createElement('div');
    profileWrap.id = 'sb-profile-wrap';
    profileWrap.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9000;display:none;font:13px system-ui,-apple-system,sans-serif;';

    profileBtn = document.createElement('button');
    profileBtn.id = 'sb-profile-btn';
    profileBtn.setAttribute('aria-label', '프로필');
    profileBtn.style.cssText = [
      'width:36px','height:36px','border-radius:50%',
      'border:none','padding:0','cursor:pointer','overflow:hidden',
      'background:#888','color:#fff','font:600 15px system-ui',
      'display:flex','align-items:center','justify-content:center',
      'box-shadow:0 1px 4px rgba(0,0,0,.18)','transition:transform .1s'
    ].join(';');
    profileBtn.onmouseenter = () => { profileBtn.style.transform = 'scale(1.05)'; };
    profileBtn.onmouseleave = () => { profileBtn.style.transform = 'scale(1)'; };

    profileMenu = document.createElement('div');
    profileMenu.id = 'sb-profile-menu';
    profileMenu.style.cssText = [
      'position:absolute','top:44px','right:0','min-width:220px',
      'background:#fff','border:1px solid #e5e5ea','border-radius:10px',
      'box-shadow:0 8px 24px rgba(0,0,0,.12)','overflow:hidden',
      'display:none'
    ].join(';');

    profileBtn.onclick = (e) => {
      e.stopPropagation();
      profileOpen = !profileOpen;
      profileMenu.style.display = profileOpen ? 'block' : 'none';
    };

    // Click outside / ESC to close
    document.addEventListener('click', (e) => {
      if (profileOpen && !profileWrap.contains(e.target)) closeProfileMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && profileOpen) closeProfileMenu();
    });

    profileWrap.appendChild(profileBtn);
    profileWrap.appendChild(profileMenu);
    document.body.appendChild(profileWrap);
    return profileWrap;
  }

  async function doSignOut(menuBtn) {
    if (menuBtn) {
      menuBtn.disabled = true;
      menuBtn.textContent = '나가는 중…';
    }
    try { await window.SupabaseAuth.signOut(); }
    catch (e) { console.warn('signOut error:', e); }
    finally {
      closeProfileMenu();
      if (menuBtn) {
        menuBtn.disabled = false;
        menuBtn.textContent = '로그아웃';
      }
    }
  }

  function showModal() {
    const m = buildModal();
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // Always reset to the email/Google view when re-opening (e.g. after sign-out).
    const ve = m.querySelector('#sb-view-email');
    const vp1 = m.querySelector('#sb-view-phone1');
    const vp2 = m.querySelector('#sb-view-phone2');
    if (ve)  ve.style.display = '';
    if (vp1) vp1.style.display = 'none';
    if (vp2) vp2.style.display = 'none';
    const t = m.querySelector('#sb-auth-title');
    if (t) t.textContent = '달력 로그인';
    setTimeout(() => m.querySelector('#sb-auth-id')?.focus(), 50);
  }
  function hideModal() {
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  function showProfile(user) {
    buildProfile();
    const name      = window.SupabaseAuth.userDisplayName(user) || '사용자';
    const meta      = user?.user_metadata || {};
    const avatarUrl = meta.avatar_url || meta.picture || '';
    const subtitle  =
      window.SupabaseAuth.isSyntheticEmail(user?.email) ? '@' + window.SupabaseAuth.emailToId(user.email) :
      user?.email ? user.email :
      user?.phone ? user.phone : '';

    // Avatar: real picture if provider gave one, otherwise initial on a colored bg.
    if (avatarUrl) {
      profileBtn.style.background = '#eee';
      profileBtn.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      profileBtn.style.background = colorFor(name);
      profileBtn.innerHTML = '';
      profileBtn.textContent = (name.charAt(0) || '?').toUpperCase();
    }
    profileBtn.title = name;

    profileMenu.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #f0f0f3;background:#fafafc;">
        <div style="font-weight:600;color:#222;font-size:14px;word-break:break-all;">${escapeHtml(name)}</div>
        ${subtitle ? `<div style="color:#888;font-size:12px;margin-top:3px;word-break:break-all;">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <button id="sb-menu-profile" style="width:100%;padding:11px 16px;background:#fff;border:none;text-align:left;cursor:pointer;font:13px system-ui,-apple-system,sans-serif;color:#222;display:flex;align-items:center;gap:8px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        프로필 설정
      </button>
      <div style="height:0.5px;background:#f0f0f3;margin:2px 0;"></div>
      <button id="sb-menu-logout" style="width:100%;padding:11px 16px;background:#fff;border:none;text-align:left;cursor:pointer;font:13px system-ui,-apple-system,sans-serif;color:#c33;display:flex;align-items:center;gap:8px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        로그아웃
      </button>
    `;
    const profileItem = profileMenu.querySelector('#sb-menu-profile');
    profileItem.onmouseenter = () => { profileItem.style.background = '#f3f6fc'; };
    profileItem.onmouseleave = () => { profileItem.style.background = '#fff'; };
    profileItem.onclick = () => {
      closeProfileMenu();
      window.__showProfileSetup?.(true);
    };
    const logoutItem = profileMenu.querySelector('#sb-menu-logout');
    logoutItem.onmouseenter = () => { logoutItem.style.background = '#fdf2f2'; };
    logoutItem.onmouseleave = () => { logoutItem.style.background = '#fff'; };
    logoutItem.onclick = () => doSignOut(logoutItem);

    profileWrap.style.display = 'block';
    closeProfileMenu();
  }
  function hideProfile() {
    if (profileWrap) profileWrap.style.display = 'none';
    closeProfileMenu();
  }

  // Disable the legacy fake-login gate so it doesn't double up with the modal
  try { localStorage.setItem('calendar-login-mode-v1', 'no-login'); } catch (_) {}

  async function onSignedIn(user, fromInitial) {
    hideModal();
    showProfile(user);

    // 구글/전화 로그인은 아이디가 없으므로 한 번만 설정 유도
    if (needsIdSetup(user)) {
      showIdSetup();
    } else {
      hideIdSetup();
    }

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

    // SIGNED_IN fires on every page-load when a session is restored from
    // localStorage — using fromInitial alone would cause an infinite reload
    // loop. Only reload when the user just triggered a sign-in in this tab.
    if (sessionStorage.getItem(PENDING_SIGNIN_KEY)) {
      sessionStorage.removeItem(PENDING_SIGNIN_KEY);
      // window.location.reload() 는 Edge --app= 모드에서 disk cache hit 으로
      // 옛 calendar.html 이 다시 로드되는 사례가 있어, URL 의 쿼리스트링을
      // 갱신해서 강제로 새 응답을 받도록 한다. server.ps1 은 ? 이후 무시.
      setTimeout(() => {
        const u = new URL(window.location.href);
        u.searchParams.set('cb', Date.now().toString());
        // 'invite' 같은 의미있는 쿼리는 보존됨 (set 으로 cb 만 갱신/추가).
        window.location.replace(u.toString());
      }, 150);
    }
  }

  function onSignedOut() {
    hideProfile();
    hideIdSetup();
    try { sessionStorage.removeItem('sb-idsetup-skipped'); } catch (_) {}
    localStorage.removeItem(CLAIM_FLAG_KEY);
    showModal();
  }

  window.SupabaseAuth.onAuthChange((user, event) => {
    if (user) onSignedIn(user, event === 'INITIAL_SESSION');
    else if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') onSignedOut();
  });
})();
