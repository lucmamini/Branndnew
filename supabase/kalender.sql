-- Kalender für das BranndNew-Dashboard
-- Einmal im Supabase "SQL Editor" ausführen.

-- Termine (eigene Termine im Dashboard)
create table if not exists public.termine (
  id          uuid primary key default gen_random_uuid(),
  erstellt_am timestamptz not null default now(),
  titel       text not null,
  datum       date not null,
  von         time,            -- leer = ganztägig
  bis         time,
  wer         text not null default 'Alle',   -- 'Alle' oder ein Name aus der Tabelle team
  ort         text,
  kunde_id    uuid references public.kunden(id) on delete set null,
  notiz       text
);

-- Verbundene Apple-Kalender (öffentliche iCloud-Freigabelinks)
create table if not exists public.kalender_quellen (
  id          uuid primary key default gen_random_uuid(),
  erstellt_am timestamptz not null default now(),
  name        text not null,
  besitzer    text,
  farbe       text not null default '#8A63D2',
  url         text not null check (url ~* '^(webcal|https)://')
);

-- Einstellungen (z. B. geheimer Schlüssel für das Kalender-Abo)
create table if not exists public.einstellungen (
  schluessel text primary key,
  wert       text not null
);
insert into public.einstellungen (schluessel, wert)
values ('ics_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (schluessel) do nothing;

alter table public.termine          enable row level security;
alter table public.kalender_quellen enable row level security;
alter table public.einstellungen    enable row level security;

drop policy if exists "team_termine" on public.termine;
create policy "team_termine" on public.termine for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team_quellen" on public.kalender_quellen;
create policy "team_quellen" on public.kalender_quellen for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team_einstellungen" on public.einstellungen;
create policy "team_einstellungen" on public.einstellungen for all to authenticated using (public.is_team()) with check (public.is_team());
