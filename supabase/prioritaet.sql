-- Prioritäten für Aufgaben und Aufträge + Live-Aktualisierung im Dashboard
-- Einmal im Supabase "SQL Editor" ausführen.

alter table public.aufgaben  add column if not exists prioritaet text not null default 'mittel';
alter table public.auftraege add column if not exists prioritaet text not null default 'mittel';

alter table public.aufgaben  drop constraint if exists aufgaben_prioritaet_check;
alter table public.aufgaben  add constraint aufgaben_prioritaet_check  check (prioritaet in ('hoch', 'mittel', 'niedrig'));
alter table public.auftraege drop constraint if exists auftraege_prioritaet_check;
alter table public.auftraege add constraint auftraege_prioritaet_check check (prioritaet in ('hoch', 'mittel', 'niedrig'));

-- Live-Updates: Änderungen von Luca/Noah erscheinen sofort beim anderen (RLS gilt weiterhin)
do $$
declare t text;
begin
  foreach t in array array['anfragen', 'kunden', 'auftraege', 'aufgaben', 'termine', 'rechnungen'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
