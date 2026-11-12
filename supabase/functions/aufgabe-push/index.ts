// Supabase Edge Function "aufgabe-push"
// Wird vom Dashboard aufgerufen, nachdem eine Aufgabe gespeichert wurde.
// Schickt eine Push-Mitteilung an die Handys der zuständigen Person
// (bei "Alle" an alle im Team) – aber nie an die Person, die gerade gespeichert hat.
//
// Aufruf nur mit gültigem Login (JWT) eines Team-Mitglieds. Alle Abfragen laufen
// mit den Rechten dieses Logins, die Zugriffsregeln (RLS) gelten also weiter.
//
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (z. B. mailto:info@branndnew.de)

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const datum = (d?: string | null) => {
  if (!d) return "";
  const [y, m, t] = d.split("-");
  return `${t}.${m}.${y}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort({ error: "Method not allowed" }, 405);

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return antwort({ error: "VAPID-Schlüssel fehlen" }, 500);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:info@branndnew.de", pub, priv);

  const authHeader = req.headers.get("Authorization") || "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // Wer ruft auf? Muss im Team sein.
  const { data: u } = await db.auth.getUser();
  const email = (u?.user?.email || "").toLowerCase();
  if (!email) return antwort({ error: "Nicht angemeldet" }, 401);
  const { data: team } = await db.from("team").select("name, email");
  const ich = (team || []).find((t) => (t.email || "").toLowerCase() === email);
  if (!ich) return antwort({ error: "Kein Team-Mitglied" }, 403);

  let id = "";
  try { ({ id } = await req.json()); } catch { /* leer */ }
  if (!id) return antwort({ error: "Aufgabe fehlt" }, 400);

  const { data: a } = await db.from("aufgaben").select("id, titel, zustaendig, faellig_am, kunde_id, erledigt").eq("id", id).maybeSingle();
  if (!a || !a.zustaendig || a.erledigt) return antwort({ sent: 0, reason: "niemand zuständig" });

  const ziele = a.zustaendig === "Alle" ? (team || []).map((t) => t.name) : [a.zustaendig];
  const empfaenger = ziele.filter((n) => n && n !== ich.name);
  if (!empfaenger.length) return antwort({ sent: 0, reason: "nur für dich selbst" });

  let kunde = "";
  if (a.kunde_id) {
    const { data: k } = await db.from("kunden").select("firma").eq("id", a.kunde_id).maybeSingle();
    kunde = k?.firma || "";
  }

  const { data: abos } = await db.from("push_abos").select("id, wer, endpoint, p256dh, auth").in("wer", empfaenger);
  const nachricht = JSON.stringify({
    title: a.zustaendig === "Alle" ? "Neue Aufgabe für alle" : "Neue Aufgabe für dich",
    body: [a.titel, kunde, a.faellig_am ? "bis " + datum(a.faellig_am) : ""].filter(Boolean).join(" · ") + ` – von ${ich.name}`,
    tag: "aufgabe-" + a.id,
    url: "/dashboard.html#aufgaben",
  });

  let sent = 0;
  await Promise.all((abos || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, nachricht, { TTL: 60 * 60 * 24, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Gerät abgemeldet oder App gelöscht → Eintrag entfernen
      if (code === 404 || code === 410) await db.from("push_abos").delete().eq("id", s.id);
      else console.error("Push fehlgeschlagen:", code, (e as Error).message);
    }
  }));

  return antwort({ sent, geraete: (abos || []).length });
});
