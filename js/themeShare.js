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

  window.ThemeShare = { generateCode, normaliseCode, publishShare, fetchShare, CODE_LEN };
})();
