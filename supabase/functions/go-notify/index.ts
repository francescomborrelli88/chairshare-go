// ChairShare Go · avviso email al freelance per ogni nuova prenotazione o richiesta di un cliente.
// Viene chiamata dal database (trigger go_notify) con { kind: 'appointment' | 'request', id }.
// Non accetta destinatari dall'esterno: legge il record con la chiave di servizio e scrive solo
// al freelance proprietario, una sola volta per record (tabella go_notifications).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://app.chairshare.it";
const FROM = Deno.env.get("GO_MAIL_FROM") ?? "ChairShare Go <notifiche@chairshare.it>";
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const ora = (t: string) => String(t ?? "").slice(0, 5);
function data(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${GIORNI[dt.getUTCDay()]} ${d} ${MESI[m - 1]}`;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

function email(titolo: string, righe: [string, string][], bottone: string, link: string, nota: string) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#F7F7F7;font-family:Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:28px">
    <tr><td style="font-size:14px;font-weight:bold;color:#C2085A;padding-bottom:6px">ChairShare Go</td></tr>
    <tr><td style="font-size:22px;font-weight:bold;line-height:1.25;padding-bottom:18px">${esc(titolo)}</td></tr>
    ${righe.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #EBEBEB;font-size:15px"><span style="color:#6A6A6A">${esc(k)}</span><br><strong>${esc(v)}</strong></td></tr>`).join("")}
    <tr><td style="padding-top:22px"><a href="${link}" style="display:inline-block;background:#C2085A;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 22px;border-radius:12px">${esc(bottone)}</a></td></tr>
    <tr><td style="padding-top:18px;font-size:13px;color:#6A6A6A;line-height:1.45">${esc(nota)}</td></tr>
  </table>
  <p style="font-size:12px;color:#6A6A6A">Ricevi questa email perché hai un profilo da professionista su ChairShare.</p>
  </td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  let body: { kind?: string; id?: string };
  try { body = await req.json(); } catch { return json({ error: "json" }, 400); }
  const { kind, id } = body;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || (kind !== "appointment" && kind !== "request")) return json({ error: "dati" }, 400);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "RESEND_API_KEY mancante" }, 500);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // una sola email per record
  const { error: dup } = await sb.from("go_notifications").insert({ kind, ref_id: id });
  if (dup) return json({ ok: true, skipped: "già inviata" });

  let freelanceId: string, titolo: string, oggetto: string, righe: [string, string][], bottone: string, link: string, nota: string;

  if (kind === "appointment") {
    const { data: a } = await sb.from("client_appointments")
      .select("freelance_id, client_name, client_phone, service_name, service_price, day, start_time, end_time, block_id")
      .eq("id", id).single();
    if (!a) return json({ error: "non trovato" }, 404);
    let luogo = "";
    if (a.block_id) {
      const { data: b } = await sb.from("chair_blocks").select("spaces(name, city, zone)").eq("id", a.block_id).single();
      const s = (b as any)?.spaces;
      if (s) luogo = [s.name, s.zone || s.city].filter(Boolean).join(" · ");
    }
    freelanceId = a.freelance_id;
    titolo = `Nuova prenotazione: ${a.client_name}`;
    oggetto = `Nuova prenotazione · ${data(a.day)} alle ${ora(a.start_time)}`;
    righe = [["Quando", `${data(a.day)}, ${ora(a.start_time)}–${ora(a.end_time)}`], ["Cliente", `${a.client_name} · ${a.client_phone}`],
      ["Servizio", `${a.service_name} · ${a.service_price} €`], ...(luogo ? [["Dove", luogo] as [string, string]] : [])];
    bottone = "Apri l'agenda"; link = `${APP_URL}/#/agenda`;
    nota = "Il cliente ha già ricevuto la conferma con l'orario. Se devi spostare l'appuntamento, scrivigli su WhatsApp dall'app.";
  } else {
    const { data: r } = await sb.from("appointment_requests")
      .select("freelance_id, client_name, client_phone, service_name, service_price, day, slot, zones").eq("id", id).single();
    if (!r) return json({ error: "non trovato" }, 404);
    freelanceId = r.freelance_id;
    titolo = `Nuova richiesta per ${data(r.day)}`;
    oggetto = `Nuova richiesta · ${data(r.day)} · ${(r.zones ?? []).join(" o ")}`;
    righe = [["Giorno", `${data(r.day)}, ${r.slot}`], ["Zone", (r.zones ?? []).join(" o ")], ["Cliente", `${r.client_name} · ${r.client_phone}`],
      ["Servizio", `${r.service_name} · ${r.service_price} €`]];
    bottone = "Vedi le richieste"; link = `${APP_URL}/#/richieste`;
    nota = "Quel giorno non hai ancora una sede. Prenota uno spazio in una delle zone scelte dal cliente per confermarlo. La richiesta scade dopo 48 ore.";
  }

  const { data: u } = await sb.auth.admin.getUserById(freelanceId);
  const to = u?.user?.email;
  if (!to) return json({ error: "email freelance mancante" }, 404);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: oggetto, html: email(titolo, righe, bottone, link, nota) }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Resend", res.status, t);
    await sb.from("go_notifications").delete().eq("kind", kind).eq("ref_id", id); // si potrà riprovare
    return json({ error: "invio non riuscito", status: res.status }, 502);
  }
  return json({ ok: true });
});
