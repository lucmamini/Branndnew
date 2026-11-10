-- BranndNew Dashboard – Datenbank-Struktur für Supabase
-- Einmal komplett im Supabase "SQL Editor" ausführen (Run).
-- Danach unten bei "TEAM" eure E-Mail-Adressen eintragen und den Block ebenfalls ausführen.

-- ===== Team (wer ins Dashboard darf) =====
create table if not exists public.team (
  email text primary key,
  name  text not null
);

-- Prüft, ob die eingeloggte Person im Team ist
create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.team where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- ===== Anfragen (kommen automatisch von der Website) =====
create table if not exists public.anfragen (
  id               uuid primary key default gen_random_uuid(),
  erstellt_am      timestamptz not null default now(),
  quelle           text not null default 'kontaktformular' check (quelle in ('anfragewagen', 'kontaktformular', 'manuell')),
  name             text not null check (char_length(name) between 1 and 200),
  firma            text check (char_length(firma) <= 200),
  email            text check (char_length(email) <= 200),
  telefon          text check (char_length(telefon) <= 100),
  paket            text check (char_length(paket) <= 100),
  positionen       jsonb not null default '[]'::jsonb,
  summe_einmalig   numeric(10,2) not null default 0,
  summe_monatlich  numeric(10,2) not null default 0,
  rabatt           boolean not null default false,
  nachricht        text check (char_length(nachricht) <= 5000),
  status           text not null default 'neu' check (status in ('neu', 'in_kontakt', 'angebot', 'gewonnen', 'verloren')),
  zustaendig       text,
  notiz            text,
  kunde_id         uuid
);

-- ===== Kunden =====
create table if not exists public.kunden (
  id              uuid primary key default gen_random_uuid(),
  erstellt_am     timestamptz not null default now(),
  firma           text not null,
  ansprechpartner text,
  email           text,
  telefon         text,
  branche         text,
  adresse         text,
  zustaendig      text,
  notizen         text,
  anfrage_id      uuid references public.anfragen(id) on delete set null
);

alter table public.anfragen
  drop constraint if exists anfragen_kunde_fk,
  add constraint anfragen_kunde_fk foreign key (kunde_id) references public.kunden(id) on delete set null;

-- ===== Aufträge =====
create table if not exists public.auftraege (
  id           uuid primary key default gen_random_uuid(),
  erstellt_am  timestamptz not null default now(),
  kunde_id     uuid references public.kunden(id) on delete cascade,
  titel        text not null,
  betrag       numeric(10,2) not null default 0,
  art          text not null default 'einmalig' check (art in ('einmalig', 'monatlich')),
  status       text not null default 'geplant' check (status in ('geplant', 'in_arbeit', 'fertig', 'storniert')),
  rechnung     text not null default 'offen' check (rechnung in ('offen', 'gestellt', 'bezahlt')),
  abgabe_am    date,
  zustaendig   text,
  notiz        text
);

-- ===== Aufgaben =====
create table if not exists public.aufgaben (
  id           uuid primary key default gen_random_uuid(),
  erstellt_am  timestamptz not null default now(),
  titel        text not null,
  kunde_id     uuid references public.kunden(id) on delete cascade,
  zustaendig   text,
  faellig_am   date,
  erledigt     boolean not null default false,
  notiz        text
);

-- ===== Zugriffsregeln (Row Level Security) =====
alter table public.team      enable row level security;
alter table public.anfragen  enable row level security;
alter table public.kunden    enable row level security;
alter table public.auftraege enable row level security;
alter table public.aufgaben  enable row level security;

-- Website-Besucher (anon) dürfen NUR neue Anfragen anlegen – nichts lesen, ändern oder löschen.
drop policy if exists "website_neue_anfrage" on public.anfragen;
create policy "website_neue_anfrage" on public.anfragen
  for insert to anon
  with check (status = 'neu' and quelle in ('anfragewagen', 'kontaktformular') and zustaendig is null and notiz is null and kunde_id is null);

-- Das Team darf alles
drop policy if exists "team_anfragen" on public.anfragen;
create policy "team_anfragen" on public.anfragen for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team_kunden" on public.kunden;
create policy "team_kunden" on public.kunden for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team_auftraege" on public.auftraege;
create policy "team_auftraege" on public.auftraege for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team_aufgaben" on public.aufgaben;
create policy "team_aufgaben" on public.aufgaben for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team_lesen" on public.team;
create policy "team_lesen" on public.team for select to authenticated using (public.is_team());

-- ===== TEAM: hier eure echten E-Mail-Adressen eintragen =====
-- (dieselben Adressen, mit denen ihr euch unter Authentication → Users anlegt)
insert into public.team (email, name) values
  ('LUCA@BEISPIEL.DE', 'Luca'),
  ('NOAH@BEISPIEL.DE', 'Noah')
on conflict (email) do update set name = excluded.name;
