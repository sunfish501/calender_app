-- theme_shares: per-user shareable theme packs (theme + its events).
--
-- Run once in Supabase Dashboard:
--   Database -> SQL Editor -> New query -> paste this -> Run.
--
-- Schema notes
--   code        : 8-char share code (see js/themeShare.js generateCode)
--   payload     : { v:1, theme:{name,color,image}, events:[{date,item},...] }
--   created_by  : owner (so they can delete their own shares)
--
-- RLS policies
--   read   : any signed-in user can fetch ANY share by code (code = secret)
--   insert : authenticated; created_by must equal auth.uid()
--   delete : owner only

create table if not exists public.theme_shares (
  code        text primary key,
  payload     jsonb not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

alter table public.theme_shares enable row level security;

drop policy if exists "anyone signed-in can read shares" on public.theme_shares;
create policy "anyone signed-in can read shares"
  on public.theme_shares for select
  to authenticated
  using (true);

drop policy if exists "users can insert their own share" on public.theme_shares;
create policy "users can insert their own share"
  on public.theme_shares for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "users can delete their own share" on public.theme_shares;
create policy "users can delete their own share"
  on public.theme_shares for delete
  to authenticated
  using (auth.uid() = created_by);

create index if not exists theme_shares_created_by_idx
  on public.theme_shares(created_by);
