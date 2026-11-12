-- Rechnungen und Firmendaten für das BranndNew-Dashboard
-- Einmal im Supabase "SQL Editor" ausführen.

-- Fortlaufende Kundennummer (K-0001, K-0002 …)
alter table public.kunden add column if not exists kundennr serial;

-- Rechnungen
create table if not exists public.rechnungen (
  id              uuid primary key default gen_random_uuid(),
  erstellt_am     timestamptz not null default now(),
  nummer          text not null unique,                       -- z. B. BN-2026-001
  kunde_id        uuid not null references public.kunden(id) on delete restrict,  -- Rechnungen müssen 10 Jahre aufbewahrt werden
  empfaenger      text not null,                              -- Anschrift zum Zeitpunkt der Rechnung
  anrede          text,
  rechnungsdatum  date not null default current_date,
  leistungsdatum  date,
  faellig_am      date,
  positionen      jsonb not null default '[]'::jsonb,         -- [{titel, beschreibung, menge, preis}]
  summe           numeric(10,2) not null default 0,
  status          text not null default 'offen' check (status in ('offen', 'bezahlt', 'storniert')),
  auftrag_ids     uuid[] not null default '{}',
  erstellt_von    text,
  notiz           text
);

alter table public.rechnungen enable row level security;
drop policy if exists "team_rechnungen" on public.rechnungen;
create policy "team_rechnungen" on public.rechnungen for all to authenticated using (public.is_team()) with check (public.is_team());

-- Firmendaten für Briefkopf und Rechnungsfuß (im Dashboard unter Rechnungen → Firmendaten änderbar)
insert into public.einstellungen (schluessel, wert) values
  ('firma_telefon', '0176 46673798'),
  ('firma_bank', ''),
  ('firma_iban', ''),
  ('firma_bic', ''),
  ('firma_steuernr', ''),
  ('firma_zahlungsziel', '14')
on conflict (schluessel) do nothing;
