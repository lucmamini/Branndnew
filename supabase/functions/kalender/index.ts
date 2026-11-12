// Supabase Edge Function "kalender"
//
// 1) Kalender-Abo für Apple Kalender (iPhone/Mac):
//    GET /functions/v1/kalender?token=<ics_token>&wer=<Name>
//    Liefert Termine, fällige Aufgaben und Abgabetermine als .ics.
//    Ohne "wer" kommt der komplette Team-Kalender.
//
// 2) Apple-Kalender im Dashboard anzeigen:
//    GET /functions/v1/kalender?quelle=<id>   (mit Login des Teammitglieds)
//    Holt den öffentlichen iCloud-Kalender und gibt ihn ans Dashboard weiter.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });
  const u = new URL(req.url);
  try {
    if (u.searchParams.get("quelle")) return await proxy(req, u.searchParams.get("quelle")!);
    return await feed(u);
  } catch (e) {
    console.error(e);
    return new Response("Fehler", { status: 500, headers: cors });
  }
});

// ---------- Teil 2: iCloud-Kalender durchreichen ----------
async function teamName(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  const mail = data?.user?.email?.toLowerCase();
  if (error || !mail) return null;
  const { data: team } = await admin.from("team").select("email, name");
  return (team || []).find((t) => t.email.toLowerCase() === mail)?.name ?? null;
}

async function proxy(req: Request, id: string) {
  if (!(await teamName(req))) return new Response("Forbidden", { status: 403, headers: cors });
  const { data: q } = await admin.from("kalender_quellen").select("url").eq("id", id).maybeSingle();
  if (!q) return new Response("Not found", { status: 404, headers: cors });
  const url = q.url.replace(/^webcal:\/\//i, "https://");
  if (!/^https:\/\//i.test(url)) return new Response("Bad url", { status: 400, headers: cors });
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "follow" });
  if (!r.ok) return new Response("Kalender nicht erreichbar (" + r.status + ")", { status: 502, headers: cors });
  const text = (await r.text()).slice(0, 5_000_000);
  if (!text.includes("BEGIN:VCALENDAR")) return new Response("Kein Kalender", { status: 502, headers: cors });
  return new Response(text, { headers: { ...cors, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---------- Teil 1: Abo-Feed für Apple Kalender ----------
const esc = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
};
const d8 = (d: string) => d.slice(0, 10).replaceAll("-", "");
const t6 = (t: string) => t.slice(0, 8).replaceAll(":", "").padEnd(6, "0");
const nextDay = (d: string) => { const x = new Date(d.slice(0, 10) + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const plusHour = (t: string) => { const h = Math.min(+t.slice(0, 2) + 1, 23); return String(h).padStart(2, "0") + t.slice(2, 8); };
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

const VTZ = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

function event(uid: string, title: string, datum: string, von: string | null, bis: string | null, extra: string[] = []) {
  const l = ["BEGIN:VEVENT", "UID:" + uid + "@branndnew.de", "DTSTAMP:" + stamp, "SUMMARY:" + esc(title)];
  if (von) {
    l.push("DTSTART;TZID=Europe/Berlin:" + d8(datum) + "T" + t6(von));
    l.push("DTEND;TZID=Europe/Berlin:" + d8(datum) + "T" + t6(bis && bis > von ? bis : plusHour(von)));
  } else {
    l.push("DTSTART;VALUE=DATE:" + d8(datum), "DTEND;VALUE=DATE:" + d8(nextDay(datum)), "TRANSP:TRANSPARENT");
  }
  return [...l, ...extra, "END:VEVENT"];
}

async function feed(u: URL) {
  const token = u.searchParams.get("token") || "";
  const { data: s } = await admin.from("einstellungen").select("wert").eq("schluessel", "ics_token").maybeSingle();
  if (!s || !token || token !== s.wert) return new Response("Forbidden", { status: 403 });
  const wer = u.searchParams.get("wer");
  const fuer = (x: string | null, inklOffen = false) => !wer || x === wer || x === "Alle" || (inklOffen && !x);

  const [ter, auf, abg, kun] = await Promise.all([
    admin.from("termine").select("*"),
    admin.from("aufgaben").select("*").eq("erledigt", false).not("faellig_am", "is", null),
    admin.from("auftraege").select("*").in("status", ["geplant", "in_arbeit"]).not("abgabe_am", "is", null),
    admin.from("kunden").select("id, firma"),
  ]);
  const kName = (id: string | null) => (kun.data || []).find((k) => k.id === id)?.firma;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BranndNew//Dashboard//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc("BranndNew" + (wer ? " – " + wer : " – Team")), "X-WR-TIMEZONE:Europe/Berlin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M", ...VTZ,
  ];
  for (const t of ter.data || []) {
    if (!fuer(t.wer)) continue;
    const desc = [t.wer && t.wer !== wer ? "Für: " + t.wer : "", kName(t.kunde_id) ? "Kunde: " + kName(t.kunde_id) : "", t.notiz || ""].filter(Boolean).join("\n");
    lines.push(...event("termin-" + t.id, t.titel, t.datum, t.von, t.bis, [
      ...(t.ort ? ["LOCATION:" + esc(t.ort)] : []), ...(desc ? ["DESCRIPTION:" + esc(desc)] : []),
    ]));
  }
  for (const a of auf.data || []) {
    if (!fuer(a.zustaendig)) continue;
    const desc = [a.zustaendig ? "Zuständig: " + a.zustaendig : "", kName(a.kunde_id) ? "Kunde: " + kName(a.kunde_id) : "", a.notiz || ""].filter(Boolean).join("\n");
    lines.push(...event("aufgabe-" + a.id, "☐ " + a.titel, a.faellig_am, null, null, desc ? ["DESCRIPTION:" + esc(desc)] : []));
  }
  for (const o of abg.data || []) {
    if (!fuer(o.zustaendig, true)) continue;
    lines.push(...event("abgabe-" + o.id, "Abgabe: " + o.titel + (kName(o.kunde_id) ? " (" + kName(o.kunde_id) + ")" : ""), o.abgabe_am, null, null));
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="branndnew.ics"', "Cache-Control": "no-store" },
  });
}
