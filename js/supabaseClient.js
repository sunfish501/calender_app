// supabaseClient.js — initialise the Supabase client and surface
// connection problems via a visible banner.
(function () {
  function showBanner(msg, detail) {
    if (document.getElementById('supabase-error-banner')) return;
    const el = document.createElement('div');
    el.id = 'supabase-error-banner';
    el.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:99999;' +
      'background:#ffe1e1;color:#7a1f1f;border-bottom:1px solid #f5b5b5;' +
      'padding:10px 16px;font:14px/1.4 system-ui,sans-serif;display:flex;' +
      'justify-content:space-between;align-items:center;gap:12px;' +
      'box-shadow:0 2px 6px rgba(0,0,0,.08);';
    const text = document.createElement('div');
    text.innerHTML =
      '<strong>Supabase 연결 실패</strong> &nbsp;' +
      msg +
      (detail ? ` <span style="opacity:.7">(${detail})</span>` : '');
    const close = document.createElement('button');
    close.textContent = '×';
    close.style.cssText =
      'border:none;background:transparent;font-size:20px;cursor:pointer;color:#7a1f1f;';
    close.onclick = () => el.remove();
    el.appendChild(text);
    el.appendChild(close);
    const mount = () => document.body && document.body.prepend(el);
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    showBanner('Supabase JS 라이브러리 로드 실패', 'CDN 차단/오프라인 가능');
    window.sb = null;
    return;
  }
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.key) {
    showBanner(
      'js/supabase-config.js 가 없거나 비어 있습니다',
      'supabase-config.example.js 를 복사해 채우세요'
    );
    window.sb = null;
    return;
  }
  if (cfg.key.startsWith('sb_secret_') || /service_role/i.test(cfg.key)) {
    showBanner('service_role 키가 감지됨', 'publishable/anon 키로 교체하세요');
    window.sb = null;
    return;
  }

  try {
    window.sb = window.supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.SUPABASE_BANNER = showBanner;
  } catch (e) {
    showBanner('Supabase 클라이언트 생성 실패', e.message || String(e));
    window.sb = null;
  }
})();
