// Supabase Edge Function "anfrage-mail"
// Wird per Database Webhook bei jeder neuen Zeile in "anfragen" aufgerufen
// und schickt die Anfrage als E-Mail an info@branndnew.de (über das IONOS-Postfach).
//
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   SMTP_USER  = info@branndnew.de
//   SMTP_PASS  = Passwort des IONOS-Postfachs
//   MAIL_TO    = info@branndnew.de          (optional, Standard = SMTP_USER)
//   SMTP_HOST  = smtp.ionos.de              (optional)

import nodemailer from "npm:nodemailer@6.9.14";

const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n) || 0);
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let payload: { type?: string; table?: string; record?: Record<string, any> };
  try { payload = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const a = payload.record;
  if (payload.type !== "INSERT" || payload.table !== "anfragen" || !a) return new Response("ignored", { status: 200 });
  if (a.quelle === "manuell") return new Response("manual entry, no mail", { status: 200 });

  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  if (!user || !pass) return new Response("SMTP not configured", { status: 500 });
  const to = Deno.env.get("MAIL_TO") || user;

  const pos: { name: string; preis: number; monatlich?: boolean }[] = Array.isArray(a.positionen) ? a.positionen : [];
  const quelle = a.quelle === "anfragewagen" ? "Anfragewagen" : "Kontaktformular";
  const titel = a.paket || (pos.length ? "Zusatzleistungen" : "Allgemeine Anfrage");
  const subject = `Neue Anfrage: ${titel}${a.firma ? " – " + a.firma : ""} (${a.name})`;

  const rows: [string, string][] = [
    ["Name", a.name],
    ["Firma", a.firma || "–"],
    ["E-Mail", a.email || "–"],
    ["Telefon", a.telefon || "–"],
    ["Paket", a.paket || "–"],
    ["Quelle", quelle],
  ];
  if (a.rabatt) rows.push(["Gründerrabatt", "möchte sich bewerben"]);

  const text = [
    `Neue Anfrage über die Website (${quelle})`, "",
    ...rows.map(([k, v]) => `${k}: ${v}`), "",
    ...(pos.length ? ["AUSWAHL", ...pos.map((p) => `- ${p.name}: ${eur(p.preis)}${p.monatlich ? " / Monat" : ""}`),
      `Einmalig: ${eur(a.summe_einmalig)}${a.summe_monatlich ? ` | Monatlich: ${eur(a.summe_monatlich)}` : ""}`, ""] : []),
    "NACHRICHT", a.nachricht || "(keine Nachricht)", "",
    "Im Dashboard ansehen: https://branndnew.de/dashboard.html",
  ].join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1F3D2B;max-width:600px">
    <h2 style="margin:0 0 12px">Neue Anfrage über die Website</h2>
    <table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#55635A;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join("")}</table>
    ${pos.length ? `<h3 style="margin:18px 0 6px">Auswahl</h3><ul style="padding-left:18px;margin:0">${pos.map((p) =>
      `<li>${esc(p.name)}: <b>${eur(p.preis)}${p.monatlich ? " / Monat" : ""}</b></li>`).join("")}</ul>
      <p style="margin:8px 0 0">Einmalig: <b>${eur(a.summe_einmalig)}</b>${a.summe_monatlich ? ` · Monatlich: <b>${eur(a.summe_monatlich)}</b>` : ""}</p>` : ""}
    <h3 style="margin:18px 0 6px">Nachricht</h3>
    <p style="white-space:pre-wrap;margin:0;background:#F7F7F2;padding:12px;border-radius:8px">${esc(a.nachricht || "(keine Nachricht)")}</p>
    <p style="margin-top:18px"><a href="https://branndnew.de/dashboard.html" style="color:#2F6B45">Im Dashboard ansehen</a></p>
  </div>`;

  const transporter = nodemailer.createTransport({
    host: Deno.env.get("SMTP_HOST") || "smtp.ionos.de",
    port: 465,          // Port 465 (SSL) – 25 und 587 sind bei Supabase gesperrt
    secure: true,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `"BranndNew Website" <${user}>`,
      to,
      replyTo: a.email || undefined,   // "Antworten" geht direkt an den Kunden
      subject,
      text,
      html,
    });
    return new Response("sent", { status: 200 });
  } catch (e) {
    console.error("Mailversand fehlgeschlagen:", e);
    return new Response("mail failed", { status: 502 });
  }
});
