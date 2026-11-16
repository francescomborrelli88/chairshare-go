// Funzioni comuni a app e pagina cliente
(function () {
  const TZ = 'Europe/Rome';
  const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const GIORNI_BREVI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
    'settembre', 'ottobre', 'novembre', 'dicembre'];

  // Data di oggi (fuso Roma) come 'YYYY-MM-DD'
  function oggi() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  // Ora attuale a Roma in minuti dalla mezzanotte
  function oraMinuti() {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const [h, m] = p.split(':').map(Number);
    return h * 60 + m;
  }
  function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function fmtDay(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { const d = parseDay(s); d.setUTCDate(d.getUTCDate() + n); return fmtDay(d); }
  function dow(s) { return parseDay(s).getUTCDay(); }
  function giorno(s) { return GIORNI[dow(s)]; }
  function giornoBreve(s) { return GIORNI_BREVI[dow(s)]; }
  function numero(s) { return parseDay(s).getUTCDate(); }
  function dataLunga(s) { const d = parseDay(s); return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`; }
  function dataMedia(s) { const d = parseDay(s); return `${GIORNI_BREVI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()].slice(0, 3)}`; }
  function lunediDi(s) { const n = (dow(s) + 6) % 7; return addDays(s, -n); }

  // 'HH:MM' <-> minuti
  function min(t) { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function ora(t) { return String(t || '').slice(0, 5); }

  // Testo sicuro per l'HTML
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function euro(n) {
    const v = Number(n || 0);
    return (Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')) + ' €';
  }
  function durata(minuti) { const h = Math.round(minuti / 60); return h + ' h'; }
  function iniziali(nome) {
    return String(nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
  }
  function nomeBreve(nome) {
    const p = String(nome || '').trim().split(/\s+/);
    return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : (p[0] || '');
  }
  // Numero per wa.me: solo cifre, prefisso 39 se manca
  function waNumero(tel) {
    let t = String(tel || '').replace(/[^0-9+]/g, '');
    if (t.startsWith('+')) t = t.slice(1);
    else if (t.startsWith('00')) t = t.slice(2);
    else if (t.length <= 10) t = '39' + t;
    return t;
  }
  function waLink(tel, testo) {
    const base = tel ? `https://wa.me/${waNumero(tel)}` : 'https://wa.me/';
    return base + '?text=' + encodeURIComponent(testo || '');
  }
  function mapsLink(q) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }

  // Messaggi di errore leggibili per i codici del database
  const ERRORI = {
    DATI_NON_VALIDI: 'Controlla nome e numero di telefono.',
    SLOT_NON_DISPONIBILE: 'Questo orario non è più disponibile.',
    SLOT_OCCUPATO: 'Qualcuno ha appena prenotato questo orario. Scegline un altro.',
    SERVIZIO_NON_TROVATO: 'Servizio non trovato.',
    ORARIO_NON_VALIDO: 'Orario non valido.',
    FUORI_FASCIA: 'Il servizio non entra nella fascia disponibile.',
    ORARIO_PASSATO: 'Questo orario è troppo vicino o già passato.',
    PREAVVISO_GIORNO_PRIMA: 'Si può prenotare al massimo entro il giorno prima.',
    TROPPE_PRENOTAZIONI: 'Hai già troppe prenotazioni attive con questo numero.',
    TROPPE_RICHIESTE: 'Hai già troppe richieste aperte con questo numero.',
    DATA_NON_VALIDA: 'Data non valida.',
    ZONA_NON_VALIDA: 'Scegli almeno una zona.',
    FASCIA_NON_VALIDA: 'Scegli mattina o pomeriggio.',
    RICHIESTA_CHIUSA: 'Questa richiesta è già stata gestita.',
    BLOCCO_NON_VALIDO: 'Scegli una tua postazione di quel giorno.',
    NON_AUTORIZZATO: 'Operazione non consentita.'
  };
  function errore(e) {
    const m = (e && (e.message || e.error_description)) || String(e || '');
    for (const k in ERRORI) if (m.includes(k)) return ERRORI[k];
    if (/Invalid login credentials/i.test(m)) return 'Email o password non corrette.';
    if (/Email not confirmed/i.test(m)) return 'Devi prima confermare la tua email.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Connessione assente. Riprova.';
    return 'Qualcosa è andato storto. Riprova tra poco.';
  }
  // true se la funzione/tabella non esiste ancora nel database (script 001 non eseguito)
  function mancaNelDb(e) {
    const c = e && e.code;
    return c === 'PGRST202' || c === 'PGRST205' || c === '42P01' || c === '42883' || c === 'PGRST204' || c === '42703';
  }

  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // Icone (SVG a tratto, ereditano il colore)
  const I = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M16 4.1a4 4 0 0 1 0 7.8M22 21c0-3-1.8-5.6-4.5-6.6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 18l6-6-6-6"/>',
    check: '<path d="M5 12.5 10 17l9-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'
  };
  function icon(n, size = 20, extra = '') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${I[n] || ''}</svg>`;
  }
  const LOGO = '<svg viewBox="0 0 512 512" fill="none" stroke="#FFFFFF" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M190 120v170h150M190 290l-22 112M340 290l22 112M190 200h96"/></svg>';

  // Bottom sheet (finestra dal basso) riutilizzabile
  function sheet(titolo, html, onMount) {
    chiudiSheet();
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap'; wrap.id = 'sheet';
    wrap.innerHTML = `<div class="sheet-bg" data-close></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
        <header class="sheet-h"><h2 id="sheet-t">${esc(titolo)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Chiudi">${icon('x')}</button></header>
        <div class="sheet-b">${html}</div></section>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) chiudiSheet(); });
    requestAnimationFrame(() => wrap.classList.add('open'));
    const primo = wrap.querySelector('input,select,textarea,button:not([data-close])');
    if (primo) setTimeout(() => primo.focus(), 120);
    if (onMount) onMount(wrap);
    return wrap;
  }
  function chiudiSheet() { const s = document.getElementById('sheet'); if (s) s.remove(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiSheet(); });

  // File .ics per aggiungere l'appuntamento al calendario
  function icsLink({ day, start, end, title, location }) {
    const d = day.replace(/-/g, '');
    const t = s => String(s).slice(0, 5).replace(':', '') + '00';
    const testo = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ChairShare Go//IT', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '@chairshare.it',
      'DTSTART;TZID=Europe/Rome:' + d + 'T' + t(start),
      'DTEND;TZID=Europe/Rome:' + d + 'T' + t(end),
      'SUMMARY:' + String(title).replace(/[,;\n]/g, ' '),
      'LOCATION:' + String(location || '').replace(/[,;\n]/g, ' '),
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(testo);
  }

  // Installazione PWA
  let promptInstall = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstall = e; document.dispatchEvent(new Event('go:installabile')); });
  function installata() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function iOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  async function installa() {
    if (promptInstall) { promptInstall.prompt(); await promptInstall.userChoice; promptInstall = null; return true; }
    return false;
  }
  function puoInstallare() { return !!promptInstall; }

  function registraSW() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
  }

  window.GO = {
    oggi, oraMinuti, addDays, giorno, giornoBreve, numero, dataLunga, dataMedia, lunediDi, dow,
    min, hhmm, ora, esc, euro, durata, iniziali, nomeBreve, waLink, mapsLink, errore, mancaNelDb,
    toast, icon, LOGO, sheet, chiudiSheet, icsLink, installata, iOS, installa, puoInstallare, registraSW
  };
})();
