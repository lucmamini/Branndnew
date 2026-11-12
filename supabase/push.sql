-- Push-Mitteilungen aufs Handy (z. B. wenn man eine Aufgabe zugeteilt bekommt)
-- Einmal im Supabase "SQL Editor" ausführen.

-- Ein Eintrag pro Gerät, auf dem Luca oder Noah Mitteilungen erlaubt hat
create table if not exists public.push_abos (
  id           uuid primary key default gen_random_uuid(),
  erstellt_am  timestamptz not null default now(),
  wer          text not null,                -- Name aus der Tabelle "team"
  endpoint     text not null unique,         -- Adresse des Push-Dienstes (Apple/Google/Mozilla)
  p256dh       text not null,
  auth         text not null,
  geraet       text
);

alter table public.push_abos enable row level security;
drop policy if exists "team_push_abos" on public.push_abos;
create policy "team_push_abos" on public.push_abos for all to authenticated using (public.is_team()) with check (public.is_team());
