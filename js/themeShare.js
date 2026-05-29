// themeShare.js — publish a theme (+ events with that theme_id) as an
// 8-char share code, and fetch / import shares by code. Backed by the
// public.theme_shares table; see README / sql/theme_shares.sql.
(function () {
  // Avoid look-alikes (0/O, 1/I/L).
  const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const CODE_LEN      = 8;
  const MAX_PAYLOAD_BYTES = 900 * 1024;  // ~900KB, well under the 1MB DB row limit
  const MAX_INSERT_RETRIES = 5;

  function generateCode() {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
  }

  function normaliseCode(raw) {
    return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // Supabase / PostgREST reports a missing table several different ways
  // depending on whether the SQL layer or the REST schema cache caught it.
  function isMissingTableError(err) {
    if (!err) return false;
    const m = (err.message || '') + ' ' + (err.details || '') + ' ' + (err.hint || '');
    return /theme_shares/i.test(m) && (
      /does not exist/i.test(m) ||
      /schema cache/i.test(m) ||
      /not found/i.test(m) ||
      err.code === 'PGRST205' ||  // PostgREST: Could not find the table
      err.code === '42P01'        // Postgres: undefined_table
    );
  }

  // payload shape: { theme: {name,color,image}, events: [{date, item}, ...], v: 1 }
  async function publishShare(payload) {
    if (!window.sb) throw new Error('Supabase 클라이언트가 없습니다');
    const user = window.SupabaseAuth?.getUser();
    if (!user) throw new Error('공유하려면 먼저 로그인하세요');

    const bytes = new Blob([JSON.stringify(payload)]).size;
    if (bytes > MAX_PAYLOAD_BYTES) {
      throw new Error(`공유 데이터가 너무 큽니다 (${Math.round(bytes/1024)}KB). 이미지가 큰 경우 줄여보세요.`);
    }

    let lastErr = null;
    for (let i = 0; i < MAX_INSERT_RETRIES; i++) {
      const code = generateCode();
      const { error } = await window.sb.from('theme_shares').insert({
        code,
        payload,
        created_by: user.id
      });
      if (!error) return code;
      lastErr = error;
      // Postgres unique_violation — retry with a different code.
      if (error.code !== '23505') break;
    }
    if (lastErr && isMissingTableError(lastErr)) {
      throw new Error('theme_shares 테이블이 없습니다. 관리자에게 SQL 설정을 요청하세요.');
    }
    throw lastErr || new Error('공유 코드 생성에 실패했습니다');
  }

  async function fetchShare(rawCode) {
    if (!window.sb) throw new Error('Supabase 클라이언트가 없습니다');
    const user = window.SupabaseAuth?.getUser();
    if (!user) throw new Error('가져오려면 먼저 로그인하세요');

    const code = normaliseCode(rawCode);
    if (code.length !== CODE_LEN) {
      throw new Error(`코드는 ${CODE_LEN}자리입니다`);
    }

    const { data, error } = await window.sb
      .from('theme_shares')
      .select('payload, created_at, created_by')
      .eq('code', code)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        throw new Error('theme_shares 테이블이 없습니다. 관리자에게 SQL 설정을 요청하세요.');
      }
      throw error;
    }
    if (!data) throw new Error('해당 코드의 공유를 찾을 수 없습니다');
    return { code, ...data };
  }

  // Owner-side: overwrite an existing share with a new payload. RLS only
  // lets the original creator update; others will get an empty result.
  async function updateShare(rawCode, payload) {
    if (!window.sb) throw new Error('Supabase 클라이언트가 없습니다');
    const user = window.SupabaseAuth?.getUser();
    if (!user) throw new Error('업데이트하려면 먼저 로그인하세요');
    const bytes = new Blob([JSON.stringify(payload)]).size;
    if (bytes > MAX_PAYLOAD_BYTES) {
      throw new Error(`공유 데이터가 너무 큽니다 (${Math.round(bytes/1024)}KB)`);
    }
    const code = normaliseCode(rawCode);
    const { data, error } = await window.sb
      .from('theme_shares')
      .update({ payload })
      .eq('code', code)
      .select('code, updated_at')
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        throw new Error('theme_shares 테이블이 없습니다. SQL 설정을 적용하세요.');
      }
      throw error;
    }
    if (!data) throw new Error('공유를 찾을 수 없거나 수정 권한이 없습니다');
    return data;
  }

  // Owner-side: remove a share row entirely.
  async function deleteShare(rawCode) {
    if (!window.sb) return;
    const code = normaliseCode(rawCode);
    const { error } = await window.sb.from('theme_shares').delete().eq('code', code);
    if (error && !isMissingTableError(error)) throw error;
  }

  // Subscriber-side: listen for UPDATE events on theme_shares and invoke
  // onChange(row) when one of `codes` is touched. Returns an unsubscribe
  // function. Safe to call with an empty set (no-op).
  function subscribeToShareUpdates(codes, onChange) {
    if (!window.sb) return () => {};
    const set = (codes instanceof Set) ? codes : new Set(codes || []);
    if (set.size === 0) return () => {};
    const ch = window.sb
      .channel('theme_shares_updates_' + Date.now() + '_' + Math.random().toString(36).slice(2,6))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'theme_shares' },
        (msg) => { const row = msg.new; if (row && set.has(row.code)) onChange(row); }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'theme_shares' },
        (msg) => { const row = msg.old; if (row && set.has(row.code)) onChange({ code: row.code, _deleted: true }); }
      )
      .subscribe();
    return () => { try { window.sb.removeChannel(ch); } catch (_) {} };
  }

  // ── 구독자 관리 ──────────────────────────────────────────────────────────────

  // 구독 등록: 테마를 가져올 때 호출 (theme_subscribers 테이블에 upsert)
  async function registerSubscriber(shareCode) {
    if (!window.sb) return;
    const user = window.SupabaseAuth?.getUser();
    if (!user) return;
    const displayName = window.SupabaseAuth?.userDisplayName(user) || '';
    try {
      await window.sb.from('theme_subscribers').upsert(
        { share_code: shareCode, user_id: user.id, display_name: displayName },
        { onConflict: 'share_code,user_id' }
      );
    } catch (e) { console.warn('[ThemeShare] registerSubscriber:', e); }
  }

  // 구독자 목록 조회 (공유자/owner용). 테이블 없으면 null 반환.
  async function fetchSubscribers(shareCode) {
    if (!window.sb) return [];
    const { data, error } = await window.sb
      .from('theme_subscribers')
      .select('id,share_code,user_id,display_name,subscribed_at')
      .eq('share_code', shareCode)
      .order('subscribed_at', { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
    return data || [];
  }

  // 구독자 추방 (row id로 삭제)
  async function kickSubscriber(subscriberRowId) {
    if (!window.sb) throw new Error('Supabase 없음');
    const { error } = await window.sb
      .from('theme_subscribers')
      .delete()
      .eq('id', subscriberRowId);
    if (error) throw error;
  }

  // 구독자 목록 실시간 구독 (owner용 모달)
  function subscribeToSubscriberList(shareCode, onChange) {
    if (!window.sb) return () => {};
    const ch = window.sb
      .channel('subs_live_' + shareCode + '_' + Date.now())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'theme_subscribers',
        filter: 'share_code=eq.' + shareCode
      }, () => onChange())
      .subscribe();
    return () => { try { window.sb.removeChannel(ch); } catch (_) {} };
  }

  // 일정 추가 브로드캐스트 (owner → subscribers)
  async function broadcastEventToSubscribers(shareCode, payload) {
    if (!window.sb) return;
    const ch = window.sb.channel('tevt_' + shareCode);
    await new Promise(res => {
      ch.subscribe(status => { if (status === 'SUBSCRIBED') res(); });
    });
    await ch.send({ type: 'broadcast', event: 'new_event', payload });
    setTimeout(() => { try { window.sb.removeChannel(ch); } catch (_) {} }, 2000);
  }

  // 새 일정 알림 수신 (subscriber용, 페이지 로드 시 호출)
  function listenForEventBroadcasts(shareCodes, onEvent) {
    if (!window.sb || !shareCodes.length) return () => {};
    const channels = shareCodes.map(code => {
      const ch = window.sb.channel('tevt_' + code);
      ch.on('broadcast', { event: 'new_event' }, ({ payload }) => onEvent(code, payload));
      ch.subscribe();
      return ch;
    });
    return () => channels.forEach(ch => { try { window.sb.removeChannel(ch); } catch (_) {} });
  }

  window.ThemeShare = {
    CODE_LEN,
    generateCode, normaliseCode,
    publishShare, fetchShare, updateShare, deleteShare,
    subscribeToShareUpdates,
    // subscriber management
    registerSubscriber, fetchSubscribers, kickSubscriber,
    subscribeToSubscriberList,
    broadcastEventToSubscribers, listenForEventBroadcasts
  };
})();
