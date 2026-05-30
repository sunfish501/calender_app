// backup.js — full-state backup & restore
// Supabase: user_backups table (optional, see SQL in backup modal)
// File: JSON export/import (always available)
(function () {
  'use strict';

  const CFG_KEY = 'calendar-backup-config-v1';

  const BACKUP_KEYS = [
    'calendar-events-v1',
    'calendar-themes-v1',
    'calendar-user-profile-v2',
    'calendar-day-templates-v1',
    'calendar-day-widget-values-v1',
    'calendar-motto-v1',
    'calendar-neis-school-v1',
    'calendar-theme-filter-v1',
    'calendar-circles-v1',
    'calendar-starred-v1',
    'calendar-wk-cell-values-v1',
    'calendar-wk-cell-designs-v1',
    'calendar-continuous-view-v1',
    'calendar-show-past-v1',
    'calendar-notified-v1',
  ];

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); }
    catch { return {}; }
  }

  function setConfig(patch) {
    const cfg = Object.assign(getConfig(), patch);
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch {}
    return cfg;
  }

  // ── 데이터 수집 / 복원 ──────────────────────────────────────────────────────
  function collect() {
    const snap = { _v: 2, _ts: new Date().toISOString() };
    BACKUP_KEYS.forEach(k => {
      const raw = localStorage.getItem(k);
      if (raw != null) snap[k] = raw;
    });
    return snap;
  }

  function restore(snap) {
    if (!snap || snap._v !== 2)
      throw new Error('올바른 백업 파일이 아닙니다 (버전 불일치)');
    BACKUP_KEYS.forEach(k => {
      if (snap[k] !== undefined) {
        try { localStorage.setItem(k, snap[k]); } catch {}
      }
    });
  }

  // ── 파일 백업 ───────────────────────────────────────────────────────────────
  function exportToFile() {
    const snap = collect();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const d    = new Date();
    const ymd  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    a.href = url;
    a.download = `달력_백업_${ymd}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setConfig({ lastBackup: Date.now(), lastBackupType: 'file' });
  }

  function importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const snap = JSON.parse(e.target.result);
          restore(snap);
          resolve(snap._ts);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
      reader.readAsText(file);
    });
  }

  // ── Supabase 클라우드 백업 ──────────────────────────────────────────────────
  // 테이블이 아직 안 만들어진 경우를 폭넓게 감지한다.
  //   42P01      : Postgres "relation does not exist"
  //   PGRST205   : PostgREST "Could not find the table ... in the schema cache"
  // (이전엔 42P01 만 봐서, PostgREST 스키마 캐시 오류는 못 잡고 원문이 그대로 노출됐다.)
  function isTableMissing(error) {
    const blob = [error?.message, error?.details, error?.hint, error?.code]
      .filter(Boolean).join(' ');
    return /42P01|PGRST205|does not exist|schema cache|could not find the table/i.test(blob);
  }

  async function backupToCloud(label) {
    if (!window.sb) throw new Error('Supabase 클라이언트 없음');
    const user = window.SupabaseAuth?.getUser();
    if (!user) throw new Error('로그인이 필요합니다');
    const snap = collect();
    const { error } = await window.sb.from('user_backups').insert({
      user_id:     user.id,
      backup_data: snap,
      label:       label || new Date().toLocaleDateString('ko-KR'),
    });
    if (error) {
      if (isTableMissing(error)) throw new Error('TABLE_MISSING');
      throw error;
    }
    setConfig({ lastBackup: Date.now(), lastBackupType: 'cloud' });
    // 최근 7개만 보존
    try {
      const { data: rows } = await window.sb
        .from('user_backups').select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (rows && rows.length > 7) {
        const ids = rows.slice(7).map(r => r.id);
        await window.sb.from('user_backups').delete().in('id', ids);
      }
    } catch {}
  }

  async function listCloudBackups() {
    if (!window.sb) return [];
    const user = window.SupabaseAuth?.getUser();
    if (!user) return [];
    const { data, error } = await window.sb
      .from('user_backups')
      .select('id, label, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      if (isTableMissing(error)) return null; // table missing
      return [];
    }
    return data || [];
  }

  async function restoreFromCloud(backupId) {
    if (!window.sb) throw new Error('Supabase 없음');
    const { data, error } = await window.sb
      .from('user_backups').select('backup_data')
      .eq('id', backupId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('백업을 찾을 수 없습니다');
    restore(data.backup_data);
  }

  async function deleteCloudBackup(backupId) {
    if (!window.sb) throw new Error('Supabase 없음');
    const { error } = await window.sb
      .from('user_backups').delete().eq('id', backupId);
    if (error) throw error;
  }

  // ── 자동 백업 ──────────────────────────────────────────────────────────────
  function checkAutoBackup() {
    const cfg = getConfig();
    const schedule = cfg.schedule || 'manual';
    if (schedule === 'manual') return;
    const ms = { daily: 86_400_000, weekly: 604_800_000, monthly: 2_592_000_000 };
    const interval = ms[schedule];
    if (!interval) return;
    if (Date.now() - (cfg.lastBackup || 0) < interval) return;
    if (window.sb && window.SupabaseAuth?.getUser()) {
      backupToCloud('자동 백업').catch(e => console.warn('[backup] auto failed:', e));
    }
  }

  window.CalendarBackup = {
    getConfig, setConfig,
    collect, restore,
    exportToFile, importFromFile,
    backupToCloud, listCloudBackups, restoreFromCloud, deleteCloudBackup,
    checkAutoBackup,
    BACKUP_KEYS,
  };
})();
