// events.js — Supabase sync layer for calendar events.
// Local events shape (per date):
//   "수학(1:00)"                       → plain string
//   "[시간표]\n1교시: ..."             → legacy timetable string
//   { t, tt:true, th?:"th_xxx" }       → object (timetable or themed event)
// DB row shape (public.events):
//   { date, title, is_timetable, theme_id, position }
(function () {
  const HASH_KEY = 'calendar_supabase_hashes_v1';
  let hashes = {};
  let pullAttempted = false;  // gate: block pushes until first pull settles
  try { hashes = JSON.parse(localStorage.getItem(HASH_KEY) || '{}'); } catch (_) {}

  function saveHashes() {
    try { localStorage.setItem(HASH_KEY, JSON.stringify(hashes)); } catch (_) {}
  }

  function itemToRow(date, item, idx, userId) {
    const isObj = typeof item === 'object' && item !== null;
    const title = isObj ? String(item.t ?? '') : String(item);
    const isTT = isObj
      ? !!item.tt
      : (title.startsWith('[') && title.includes(']\n'));
    return {
      date,
      title,
      is_timetable: isTT,
      theme_id: isObj && item.th ? String(item.th) : null,
      position: idx,
      user_id: userId
    };
  }

  function rowToItem(row) {
    if (row.is_timetable || row.theme_id) {
      const o = { t: row.title };
      if (row.is_timetable) o.tt = true;
      if (row.theme_id) o.th = row.theme_id;
      return o;
    }
    return row.title;
  }

  async function pull(localEvents, onChange) {
    if (!window.sb) { pullAttempted = true; return { ok: false, reason: 'no-client' }; }
    if (!window.SupabaseAuth?.getUser()) { pullAttempted = true; return { ok: true, skipped: 'not-authed' }; }
    try {
      const { data, error } = await window.sb
        .from('events')
        .select('date,title,is_timetable,theme_id,position')
        .order('date', { ascending: true })
        .order('position', { ascending: true });
      if (error) {
        if (window.SUPABASE_BANNER) window.SUPABASE_BANNER('데이터 읽기 실패', error.message);
        return { ok: false, reason: 'select-failed', error };
      }
      const byDate = {};
      for (const row of (data || [])) {
        (byDate[row.date] ||= []).push(rowToItem(row));
      }
      let changed = false;
      for (const k of Object.keys(byDate)) {
        const cur = localEvents[k];
        if (!cur || (Array.isArray(cur) && cur.length === 0)) {
          localEvents[k] = byDate[k];
          changed = true;
        }
      }
      for (const k of Object.keys(localEvents)) {
        hashes[k] = JSON.stringify(localEvents[k] || []);
      }
      saveHashes();
      pullAttempted = true;
      if (changed && typeof onChange === 'function') onChange();
      return { ok: true, merged: changed, rowCount: (data || []).length };
    } catch (e) {
      pullAttempted = true;
      if (window.SUPABASE_BANNER) window.SUPABASE_BANNER('네트워크 오류', e.message || String(e));
      return { ok: false, reason: 'exception', error: e };
    }
  }

  async function pushDate(date, items) {
    if (!window.sb) return { ok: false, reason: 'no-client' };
    const uid = window.SupabaseAuth?.getUser()?.id;
    if (!uid) return { ok: false, reason: 'not-authed' };
    const list = Array.isArray(items) ? items : [];
    const hash = JSON.stringify(list);
    if (hashes[date] === hash) return { ok: true, skipped: true };
    try {
      const del = await window.sb.from('events').delete()
        .eq('date', date)
        .eq('user_id', uid);
      if (del.error) return { ok: false, reason: 'delete-failed', error: del.error };
      if (list.length) {
        const rows = list.map((it, i) => itemToRow(date, it, i, uid));
        const ins = await window.sb.from('events').insert(rows);
        if (ins.error) return { ok: false, reason: 'insert-failed', error: ins.error };
      }
      hashes[date] = hash;
      saveHashes();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'exception', error: e };
    }
  }

  async function pushAll(localEvents) {
    if (!window.sb) return { ok: false, reason: 'no-client' };
    if (!window.SupabaseAuth?.getUser()) return { ok: true, skipped: 'not-authed' };
    // Until the first pull settles, suppress mass upload so bulk migration
    // (step B) can run intentionally instead of being triggered by init.
    if (!pullAttempted) return { ok: true, skipped: 'awaiting-pull' };
    const tasks = [];
    for (const date of Object.keys(localEvents || {})) {
      if (date.startsWith('__')) continue;
      tasks.push(pushDate(date, localEvents[date]));
    }
    const results = await Promise.all(tasks);
    const failed = results.filter(r => !r.ok && r.reason !== 'no-client');
    if (failed.length && window.SUPABASE_BANNER) {
      const first = failed[0];
      window.SUPABASE_BANNER('일부 일정 업로드 실패', first?.error?.message || first?.reason);
    }
    return { ok: failed.length === 0, total: results.length, failed: failed.length };
  }

  function resetHashes() {
    hashes = {};
    saveHashes();
  }

  window.SupabaseSync = {
    get enabled() { return !!window.sb; },
    get ready() { return pullAttempted; },
    itemToRow,
    rowToItem,
    pull,
    pushDate,
    pushAll,
    resetHashes,
    // Step B will call this: clears hashes + forces pullAttempted=true so
    // a manual full upload can run without the init gate blocking it.
    forceReady() { pullAttempted = true; }
  };
})();
