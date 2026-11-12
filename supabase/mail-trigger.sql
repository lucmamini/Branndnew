-- Schickt bei jeder neuen Anfrage eine E-Mail (über die Edge Function "anfrage-mail").
-- WEBHOOK_SECRET_HIER durch denselben Wert ersetzen, der in Supabase als Secret WEBHOOK_SECRET hinterlegt ist.
create extension if not exists pg_net;

create or replace function public.anfrage_mail_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://qjrljfmoifkboucciabm.supabase.co/functions/v1/anfrage-mail',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'WEBHOOK_SECRET_HIER'),
    body    := jsonb_build_object('type', 'INSERT', 'table', 'anfragen', 'record', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function public.anfrage_mail_trigger() from public, anon, authenticated;

drop trigger if exists anfrage_mail on public.anfragen;
create trigger anfrage_mail
  after insert on public.anfragen
  for each row execute function public.anfrage_mail_trigger();
