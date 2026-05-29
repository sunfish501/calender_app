// userDataSync.js — sync miscellaneous localStorage keys to the user_data
// KV table. Activated only while a user is signed in via Supabase Auth.
(function () {
  const KEYS = [
    'calendar-themes-v1',
    'calendar-color-preset-v1',
    'calendar-neis-school-v1',
    'calendar-memos-v1',
    'calendar-postits-v1',
    'calendar-starred-dates-v1',
    'calendar-circles-v1',
    'calendar-notify-enabled-v1',
    'calendar-continuous-view-v1'
  ];
  const KEY_SET = new Set(KEYS);
  const pushTimers = {};

  function userId() {
    return window.SupabaseAuth?.getUser()?.id || null;
  }

  function read(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  function writeQuiet(key, value) {
    const raw = (typeof value === 'string') ? value : JSON.stringify(value);
    const orig = Storage.prototype.__sbOriginalSetItem || Storage.prototype.setItem;
    orig.call(localStorage, key, raw);
  }

  async function pushKey(key) {
    if (!window.sb) return { ok: false, reason: 'no-client' };
    const uid = userId();
    if (!uid) return { ok: false, reason: 'not-authed' };
    if (!KEY_SET.has(key)) return { ok: false, reason: 'not-tracked' };
    const value = read(key);
    if (value === null) {
      const { error } = await window.sb
        .from('user_data')
        .delete()
        .eq('user_id', uid)
        .eq('key', key);
      return { ok: !error, error };
    }
    const { error } = await window.sb
      .from('user_data')
      .upsert({ user_id: uid, key, value }, { onConflict: 'user_id,key' });
    return { ok: !error, error };
  }

  async function pushAll() {
    if (!userId()) return { ok: false, reason: 'not-authed' };
    const results = await Promise.all(KEYS.map(k => pushKey(k)));
    const failed = results.filter(r => !r.ok && r.reason !== 'not-authed');
    return { ok: failed.length === 0, failed: failed.length };
  }

  async function pullAll() {
    if (!window.sb) return { ok: false, reason: 'no-client' };
    const uid = userId();
    if (!uid) return { ok: false, reason: 'not-authed' };
    const { data, error } = await window.sb
      .from('user_data')
      .select('key, value')
      .eq('user_id', uid)
      .in('key', KEYS);
    if (error) {
      if (window.SUPABASE_BANNER) window.SUPABASE_BANNER('user_data 읽기 실패', error.message);
      return { ok: false, error };
    }
    let restored = 0;
    for (const row of (data || [])) {
      if (!KEY_SET.has(row.key)) continue;
      writeQuiet(row.key, row.value);
      restored++;
    }
    return { ok: true, restored };
  }

  // Monkey-patch localStorage.setItem so any tracked key is automatically pushed
  // (debounced 600ms). Bypassed by writeQuiet() which uses the saved original.
  if (!Storage.prototype.__sbOriginalSetItem) {
    Storage.prototype.__sbOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      Storage.prototype.__sbOriginalSetItem.call(this, k, v);
      if (this === localStorage && KEY_SET.has(k) && userId()) {
        clearTimeout(pushTimers[k]);
        pushTimers[k] = setTimeout(() => { pushKey(k).catch(() => {}); }, 600);
      }
    };
  }

  window.UserDataSync = { KEYS, pushKey, pushAll, pullAll };
})();
