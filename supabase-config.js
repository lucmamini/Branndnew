/* Verbindung zur BranndNew-Datenbank (Supabase).
   Werte findest du in Supabase unter Project Settings → API (bzw. "Data API" / "API Keys").
   Diese Datei wird von der Website UND vom Dashboard genutzt – nur hier eintragen.

   url: die Project URL, z. B. "https://abcdefghijk.supabase.co"
   key: der öffentliche "anon public"- bzw. "publishable"-Key.
        NIEMALS den "service_role"- oder "secret"-Key eintragen – der wäre für alle sichtbar!

   Sind beide Felder leer, schickt die Website Anfragen wie bisher per E-Mail. */
window.BN_SUPABASE = {
  url: "https://qjrljfmoifkboucciabm.supabase.co",
  key: "sb_publishable_kC9OTgC8V3rFBUReL9doTw_0yYVnn2D"
};
