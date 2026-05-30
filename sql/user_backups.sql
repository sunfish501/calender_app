-- user_backups: per-user full-state snapshots for cloud backup/restore.
-- Used by js/backup.js (backupToCloud / listCloudBackups / restoreFromCloud).
--
-- Run once in Supabase Dashboard:
--   Database -> SQL Editor -> New query -> paste this -> Run.
--
-- Schema notes
--   user_id      : owner (auth.uid())
--   backup_data  : full snapshot { _v:2, _ts, "<localStorage key>": "<raw>" , ... }
--   label        : human label ("자동 백업", a date, etc.)
--   created_at   : used for "최근 7개만 보존" pruning + history list ordering
--
-- RLS policies (a user may only touch their own backups)
--   select / insert / delete : auth.uid() = user_id

create table if not exists public.user_backups (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  backup_data  jsonb not null,
  label        text,
  created_at   timestamptz not null default now()
);

alter table public.user_backups enable row level security;

drop policy if exists "users can read their own backups" on public.user_backups;
create policy "users can read their own backups"
  on public.user_backups for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users can insert their own backups" on public.user_backups;
create policy "users can insert their own backups"
  on public.user_backups for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can delete their own backups" on public.user_backups;
create policy "users can delete their own backups"
  on public.user_backups for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists user_backups_user_created_idx
  on public.user_backups(user_id, created_at desc);
