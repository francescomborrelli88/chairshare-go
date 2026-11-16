// ChairShare Go · pagina pubblica del professionista (quella che apre il cliente)
(function () {
  const G = window.GO, C = window.GO_CONFIG, esc = G.esc, ic = G.icon;
  const root = document.getElementById('root');
  const qs = new URLSearchParams(location.search);
  const m = location.pathname.match(/\/go\/([a-z0-9-]+)/i);
  const slug = (m ? m[1] : (qs.get('u') || '')).toLowerCase();
  const isDemo = qs.has('demo') || slug === 'demo';

  let sb = null, P = null;                 // client Supabase e dati della pagina
  const st = { vista: 'home', servizio: null, giorno: null, ora: null, esito: null };

  // ------------------------------------------------------------ dati
  async function carica() {
    if (isDemo) return demo();
    if (!slug) throw new Error('NESSUN_PROFILO');
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: false } });
    let r = await sb.rpc('go_get_page', { p_slug: slug });
    if (r.error && G.mancaNelDb(r.error)) r = await sb.rpc('get_booking_page_by_slug', { p_slug: slug });
    if (r.error) throw r.error;
    if (!r.data) throw new Error('NESSUN_PROFILO');
    const d = r.data;
    d.zones = d.zones || []; d.block_zones = d.block_zones || {}; d.richieste = !!r.data.slug;
    return d;
  }
  async function prenota(blockId, serviceId, start, name, phone) {
    if (isDemo) {
      await new Promise(r => setTimeout(r, 300));
      const b = P.blocks.find(x => x.id === blockId), s = P.services.find(x => x.id === serviceId);
      P.busy.push({ block: blockId, start, end: G.hhmm(G.min(start) + s.duration) });
      return { day: b.day, start, end: G.hhmm(G.min(start) + s.duration), salon: b.salon, city: b.city, zone: zonaDi(b), address: '[Indirizzo dello studio]', freelance_phone: '' };
    }
    const args = { p_block: blockId, p_service: serviceId, p_start: start, p_name: name, p_phone: phone };
    let r = await sb.rpc('go_book', args);
    if (r.error && G.mancaNelDb(r.error)) r = await sb.rpc('book_appointment', args);
    if (r.error) throw r.error;
    return r.data;
  }
  async function richiedi(serviceId, day, slot, zones, name, phone) {
    if (isDemo) { await new Promise(r => setTimeout(r, 300)); return { token: 'demo', day, zones }; }
    const r = await sb.rpc('go_create_request', { p_slug: slug, p_service: serviceId, p_day: day, p_slot: slot, p_zones: zones, p_name: name, p_phone: phone });
    if (r.error) throw r.error;
    return r.data;
  }
  async function ritira(token) {
    if (isDemo) return true;
    const r = await sb.rpc('go_withdraw_request', { p_token: token });
    if (r.error) throw r.error;
    return r.data;
  }

  function demo() {
    const t = G.oggi(), d = n => G.addDays(t, n);
    return {
      name: 'Luca Ferri', slug: 'demo', richieste: true,
      services: [{ id: 's1', name: 'Sessione individuale', duration: 60, price: 60 }, { id: 's2', name: 'Percorso intensivo', duration: 120, price: 110 }],
      blocks: [
        { id: 'b1', day: d(1), start: '09:00', end: '13:00', salon: 'Studio privato', city: 'Napoli' },
        { id: 'b2', day: d(2), start: '09:00', end: '17:00', salon: 'Studio privato', city: 'Marano di Napoli' },
        { id: 'b3', day: d(7), start: '14:00', end: '19:00', salon: 'Studio privato', city: 'Napoli' }
      ],
      block_zones: { b1: 'Vomero', b2: 'Marano di Napoli', b3: 'Vomero' },
      busy: [{ block: 'b1', start: '10:00', end: '11:00' }, { block: 'b1', start: '12:00', end: '13:00' }, { block: 'b2', start: '11:00', end: '12:00' }],
      zones: ['Vomero', 'Marano di Napoli'],
      rating: 4.9, reviews_count: 12,
      reviews: [{ name: 'Laura T.', rating: 5, comment: 'Ascolto vero e consigli concreti. Mi sono trovata benissimo.', day: d(-6) },
        { name: 'Marco R.', rating: 5, comment: 'Puntuale e preparato, lo consiglio.', day: d(-20) }]
    };
  }

  // ------------------------------------------------------------ calcoli
  const zonaDi = b => P.block_zones[b.id] || b.city || 'Sede';
  const servizio = () => P.services.find(s => s.id === st.servizio) || P.services[0];
  function liberi(b, s) {
    const out = [], dur = s.duration, t = G.oggi();
    const limite = b.day === t ? G.oraMinuti() + C.MIN_PREAVVISO_MIN : -1;
    const occ = P.busy.filter(x => x.block === b.id);
    for (let m = G.min(b.start); m + dur <= G.min(b.end); m += 60) {
      if (m < limite) continue;
      if (occ.some(o => m < G.min(o.end) && m + dur > G.min(o.start))) continue;
      out.push(G.hhmm(m));
    }
    return out;
  }
  // Elenco giorni: quelli con sede (con orari) e quelli "su richiesta"
  function giorni(s) {
    const t = G.oggi(), perGiorno = {};
    P.blocks.forEach(b => {
      if (b.day < t) return;
      const sl = liberi(b, s);
      if (!perGiorno[b.day]) perGiorno[b.day] = { day: b.day, blocchi: [], liberi: 0 };
      perGiorno[b.day].blocchi.push(b); perGiorno[b.day].liberi += sl.length;
    });
    const conSede = Object.values(perGiorno).filter(g => g.liberi > 0);
    const out = conSede.map(g => ({ ...g, tipo: 'sede', zona: zonaDi(g.blocchi[0]) }));
    if (P.richieste && P.zones.length) {
      let aggiunti = 0;
      for (let i = 1; i <= 21 && aggiunti < 6; i++) {
        const d = G.addDays(t, i);
        if (perGiorno[d] || G.dow(d) === 0) continue;
        out.push({ day: d, tipo: 'richiesta' }); aggiunti++;
      }
    }
    return out.sort((a, b) => a.day.localeCompare(b.day));
  }

  // ------------------------------------------------------------ viste
  function render() {
    const v = { home: vHome, orario: vOrario, richiesta: vRichiesta, ok: vOk, inviata: vInviata }[st.vista];
    root.innerHTML = v();
    window.scrollTo(0, 0);
    const f = root.querySelector('h1'); if (f) f.setAttribute('tabindex', '-1');
  }

  function testa(titolo, sotto, indietro) {
    return `<header class="row" style="gap:8px"><button type="button" class="icon-btn" style="border:none" data-act="vai" data-v="${indietro}" aria-label="Indietro">${ic('left', 22)}</button>
      <div class="stack" style="gap:0"><h1 class="h2" style="font-size:18px">${esc(titolo)}</h1><span class="small muted">${esc(sotto)}</span></div></header>`;
  }

  function vHome() {
    const s = servizio(), g = s ? giorni(s).slice(0, 6) : [];
    document.title = `${P.name} · Prenota con ChairShare`;
    return `<main class="view no-nav">
      <div class="brandmini"><span class="lg">${G.LOGO}</span>Prenotazioni con ChairShare</div>
      <header class="row" style="gap:14px"><span class="avatar lg" style="width:72px;height:72px" aria-hidden="true">${esc(G.iniziali(P.name))}</span>
        <div class="stack" style="gap:3px"><h1 class="h1" style="font-size:22px">${esc(P.name)}</h1>
        ${P.reviews_count ? `<span class="small">★ ${String(P.rating).replace('.', ',')} · ${P.reviews_count} recensioni</span>` : ''}</div></header>
      ${P.zones.length ? `<section class="stack" aria-label="Dove riceve"><h2 class="h2" style="font-size:15px">Dove riceve</h2>
        <div class="row wrap" style="gap:8px">${P.zones.map(z => `<span class="chip" style="min-height:34px">${ic('pin', 14)}${esc(z)}</span>`).join('')}</div></section>` : ''}
      ${s ? `<section class="stack" aria-label="Prossime date"><h2 class="h2" style="font-size:15px">Prossime date</h2>
        ${g.length ? g.map(x => `<button type="button" class="card" data-act="giorno" data-d="${x.day}" style="flex-direction:row;justify-content:space-between;align-items:center;padding:14px;cursor:pointer;${x.tipo === 'richiesta' ? 'border-style:dashed;border-color:var(--field)' : ''}">
          <span><strong>${esc(G.dataMedia(x.day))}</strong> · ${x.tipo === 'sede' ? esc(x.zona) : 'sede da definire'}</span>
          <span class="small" style="font-weight:600;color:${x.tipo === 'sede' ? 'var(--ok)' : 'var(--ink-2)'}">${x.tipo === 'sede' ? `${x.liberi} ${x.liberi === 1 ? 'orario' : 'orari'}` : 'Su richiesta'}</span></button>`).join('')
          : '<div class="empty">Al momento non ci sono date disponibili.</div>'}
      </section>` : ''}
      <section class="stack s6" aria-label="Servizi"><h2 class="h2" style="font-size:15px">Servizi</h2>
        ${P.services.length ? P.services.map(x => `<div class="line-row"><span>${esc(x.name)} <span class="muted">· ${G.durata(x.duration)}</span></span><strong>${G.euro(x.price)}</strong></div>`).join('') : '<p class="muted small">Listino in preparazione.</p>'}
      </section>
      ${P.reviews && P.reviews.length ? `<section class="stack" aria-label="Recensioni"><h2 class="h2" style="font-size:15px">Recensioni</h2>
        ${P.reviews.slice(0, 3).map(r => `<div class="card soft" style="gap:4px"><div class="row between small"><strong>${esc(r.name)}</strong><span>${'★'.repeat(r.rating)}</span></div>${r.comment ? `<p class="small">${esc(r.comment)}</p>` : ''}</div>`).join('')}</section>` : ''}
      <p class="tiny muted center">I tuoi dati sono visibili solo a ${esc(P.name.split(' ')[0])}.</p>
    </main>
    ${s ? `<div class="bottom-cta"><button type="button" class="btn primary" data-act="prenota" style="min-height:52px;font-size:16px">Prenota</button></div>` : ''}`;
  }

  function sceltaServizio() {
    if (P.services.length < 2) return '';
    return `<fieldset style="border:none;margin:0;padding:0" class="stack s6"><legend class="h2" style="font-size:15px;margin-bottom:8px">Servizio</legend>
      ${P.services.map(s => `<label class="choice"><input type="radio" name="sv" value="${esc(s.id)}" ${s.id === servizio().id ? 'checked' : ''} data-act="servizio">
        <span class="grow">${esc(s.name)} <span class="muted" style="font-weight:500">· ${G.durata(s.duration)}</span></span><span>${G.euro(s.price)}</span></label>`).join('')}</fieldset>`;
  }

  function vOrario() {
    const s = servizio(), g = giorni(s);
    if (!st.giorno || !g.some(x => x.day === st.giorno)) st.giorno = (g.find(x => x.tipo === 'sede') || g[0] || {}).day;
    const cur = g.find(x => x.day === st.giorno);
    const blocchi = cur && cur.tipo === 'sede' ? cur.blocchi : [];
    const orari = blocchi.flatMap(b => liberi(b, s).map(o => ({ o, b })));
    if (!orari.some(x => x.o === st.ora)) st.ora = null;
    return `<main class="view no-nav">
      ${testa(s.name, `${P.name} · ${G.durata(s.duration)} · ${G.euro(s.price)}`, 'home')}
      ${sceltaServizio()}
      <div class="days" role="group" aria-label="Giorni disponibili">
        ${g.length ? g.map(x => `<button type="button" class="${x.tipo === 'richiesta' ? 'rq' : ''}" data-act="giorno" data-d="${x.day}" aria-pressed="${x.day === st.giorno}">
          <span class="dn">${G.giornoBreve(x.day)}</span><strong>${G.numero(x.day)}</strong><span class="z">${x.tipo === 'sede' ? esc(x.zona) : 'Su richiesta'}</span></button>`).join('') : ''}
      </div>
      ${!g.length ? '<div class="empty">Nessuna data disponibile per questo servizio.</div>' : ''}
      ${cur && cur.tipo === 'sede' ? `
        <div class="card soft" style="flex-direction:row;gap:10px">${ic('pin', 20, 'style="flex-shrink:0"')}<div class="stack" style="gap:2px"><strong>${esc(cur.zona)} · ${esc(blocchi[0].salon ? 'Studio' : 'Sede')}</strong>
          <span class="small" style="color:var(--ink-2)">Sede confermata. L'indirizzo completo arriva con la conferma.</span></div></div>
        <section class="stack" aria-label="Orari liberi"><h2 class="h2" style="font-size:15px">Orari liberi</h2>
          <div class="slots">${orari.map(x => `<button type="button" data-act="ora" data-o="${x.o}" data-b="${esc(x.b.id)}" aria-pressed="${x.o === st.ora}">${x.o}</button>`).join('')}</div></section>
        <form class="stack" id="f-pren" novalidate><h2 class="h2" style="font-size:15px">I tuoi dati</h2>
          <div class="field"><label for="c-nome">Nome e cognome</label><input class="input" id="c-nome" autocomplete="name" required></div>
          <div class="field"><label for="c-tel">Cellulare (per conferma e promemoria)</label><input class="input" id="c-tel" type="tel" autocomplete="tel" required></div>
          <label class="check"><input type="checkbox" id="c-priv">Accetto che i miei dati siano usati solo per gestire l'appuntamento. Sono visibili solo a ${esc(P.name.split(' ')[0])}.</label>
          <p class="form-err" id="c-err" role="alert"></p>
        </form>` : ''}
    </main>
    ${cur && cur.tipo === 'sede' ? `<div class="bottom-cta"><button type="submit" form="f-pren" class="btn primary" style="min-height:52px;font-size:16px" ${st.ora ? '' : 'disabled'}>${st.ora ? `Prenota ${esc(G.dataMedia(st.giorno))} alle ${st.ora}` : 'Scegli un orario'}</button></div>` : ''}`;
  }

  function vRichiesta() {
    const s = servizio();
    return `<main class="view no-nav">
      ${testa(G.dataLunga(st.giorno), `${s.name} · ${G.durata(s.duration)} · ${G.euro(s.price)}`, 'orario')}
      <p class="small" style="color:#333;padding:12px 14px;border-radius:12px;background:var(--soft)">${esc(P.name.split(' ')[0])} non ha ancora fissato una sede per questo giorno. Lascia una richiesta: <strong>nessun pagamento</strong>, puoi ritirarla quando vuoi.</p>
      <form class="stack" id="f-rich" novalidate style="gap:16px">
        <fieldset style="border:none;margin:0;padding:0" class="stack s6"><legend class="h2" style="font-size:15px;margin-bottom:8px">Dove sei disposto ad andare?</legend>
          ${P.zones.map((z, i) => `<label class="choice"><input type="checkbox" name="zona" value="${esc(z)}" ${i === 0 && P.zones.length === 1 ? 'checked' : ''}>${esc(z)}</label>`).join('')}
          <span class="small" style="color:var(--ink-2)">Ti confermiamo solo se ${esc(P.name.split(' ')[0])} sarà in una delle zone scelte. Altrimenti decidi tu.</span></fieldset>
        <fieldset style="border:none;margin:0;padding:0" class="stack s6"><legend class="h2" style="font-size:15px;margin-bottom:8px">Quando preferisci?</legend>
          <div class="btns"><label class="choice center"><input type="radio" name="fascia" value="mattina" checked>Mattina</label>
          <label class="choice center"><input type="radio" name="fascia" value="pomeriggio">Pomeriggio</label></div></fieldset>
        <div class="btns"><div class="field"><label for="r-nome">Nome e cognome</label><input class="input" id="r-nome" autocomplete="name"></div>
          <div class="field"><label for="r-tel">Cellulare</label><input class="input" id="r-tel" type="tel" autocomplete="tel"></div></div>
        <label class="check"><input type="checkbox" id="r-priv">Accetto che i miei dati siano usati solo per gestire la richiesta. Sono visibili solo a ${esc(P.name.split(' ')[0])}.</label>
        <p class="form-err" id="r-err" role="alert"></p>
      </form>
    </main>
    <div class="bottom-cta"><button type="submit" form="f-rich" class="btn primary" style="min-height:52px;font-size:16px">Invia richiesta</button></div>`;
  }

  function vOk() {
    const e = st.esito, s = servizio();
    const luogo = [e.address, e.city].filter(Boolean).join(', ');
    const zona = e.zone || e.city || '';
    return `<main class="view no-nav" style="gap:20px">
      <div class="stack center" style="align-items:center;padding-top:20px"><span class="success">${ic('check', 32, 'stroke-width="2.4"')}</span>
        <h1 class="h1">Prenotazione confermata</h1><p class="muted">Salva questa pagina o fai uno screenshot.</p></div>
      <section class="card" style="padding:4px 16px;gap:0" aria-label="Dettagli">
        <div class="line-row"><span class="muted">Quando</span><strong>${esc(G.dataMedia(e.day))} · ${esc(e.start)}–${esc(e.end)}</strong></div>
        <div class="line-row"><span class="muted">Con</span><strong>${esc(P.name)}</strong></div>
        <div class="line-row"><span class="muted">Servizio</span><strong>${esc(s.name)} · ${G.euro(s.price)}</strong></div></section>
      <section class="card soft" aria-label="Dove"><div class="row" style="align-items:flex-start">${ic('pin', 22, 'style="flex-shrink:0"')}
        <div class="stack" style="gap:2px"><strong>${esc(e.salon || 'Studio')}${zona ? ' · ' + esc(zona) : ''}</strong>
        <span>${esc(e.address ? luogo : 'L\'indirizzo esatto te lo invia ' + P.name.split(' ')[0] + ' su WhatsApp.')}</span>
        ${e.access_notes ? `<span class="small" style="color:var(--ink-2)">${esc(e.access_notes)}</span>` : ''}</div></div>
        <div class="btns">${e.address ? `<a class="btn sm" href="${esc(G.mapsLink(luogo))}" target="_blank" rel="noopener">Apri in Maps</a>` : ''}
        <a class="btn sm" download="appuntamento.ics" href="${esc(G.icsLink({ day: e.day, start: e.start, end: e.end, title: `${s.name} con ${P.name}`, location: luogo || zona }))}">Aggiungi al calendario</a></div></section>
      <p class="small" style="color:var(--ink-2)">Puoi spostare o annullare gratis fino a 24 ore prima.</p>
      ${e.freelance_phone ? `<a class="btn dark" href="${esc(G.waLink(e.freelance_phone, `Ciao ${P.name.split(' ')[0]}, ho prenotato ${G.dataMedia(e.day)} alle ${e.start}. Avrei bisogno di spostare o annullare.`))}" target="_blank" rel="noopener">Sposta o annulla</a>` : ''}
      <button type="button" class="btn plain" data-act="vai" data-v="home">Torna alla pagina di ${esc(P.name.split(' ')[0])}</button>
    </main>`;
  }

  function vInviata() {
    const e = st.esito;
    return `<main class="view no-nav" style="gap:20px">
      <div class="stack center" style="align-items:center;padding-top:20px"><span class="success">${ic('check', 32, 'stroke-width="2.4"')}</span>
        <h1 class="h1">Richiesta inviata</h1>
        <p class="muted">${esc(P.name.split(' ')[0])} riceve la tua richiesta per ${esc(G.dataLunga(e.day).toLowerCase())}. Appena fissa la sede ti scrive su WhatsApp con orario e indirizzo.</p></div>
      <section class="card" aria-label="Riepilogo"><div class="row" style="align-items:flex-start">${ic('pin', 20, 'style="flex-shrink:0"')}
        <span>Zone scelte: <strong>${esc((e.zones || []).join(' o '))}</strong></span></div>
        <p class="small" style="color:var(--ink-2)">Se sarà in un'altra zona, decidi tu se andare o cambiare data. Nessun pagamento.</p></section>
      <button type="button" class="btn" data-act="ritira">Ritira la richiesta</button>
      <button type="button" class="btn plain" data-act="vai" data-v="home">Torna alla pagina di ${esc(P.name.split(' ')[0])}</button>
    </main>`;
  }

  // ------------------------------------------------------------ eventi
  root.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    if (a === 'vai') { st.vista = el.dataset.v; render(); }
    if (a === 'prenota') { st.vista = 'orario'; render(); }
    if (a === 'giorno') {
      st.giorno = el.dataset.d; st.ora = null;
      const g = giorni(servizio()).find(x => x.day === st.giorno);
      st.vista = g && g.tipo === 'richiesta' ? 'richiesta' : 'orario'; render();
    }
    if (a === 'ora') {
      st.ora = el.dataset.o; st.block = el.dataset.b;
      const nome = (document.getElementById('c-nome') || {}).value, tel = (document.getElementById('c-tel') || {}).value, pr = (document.getElementById('c-priv') || {}).checked;
      render();
      if (nome) document.getElementById('c-nome').value = nome;
      if (tel) document.getElementById('c-tel').value = tel;
      if (pr) document.getElementById('c-priv').checked = true;
    }
    if (a === 'ritira') {
      el.disabled = true;
      try { await ritira(st.esito.token); G.toast('Richiesta ritirata'); st.vista = 'home'; render(); }
      catch (x) { G.toast(G.errore(x)); el.disabled = false; }
    }
  });
  root.addEventListener('change', e => {
    if (e.target.dataset.act === 'servizio') { st.servizio = e.target.value; st.ora = null; render(); }
  });
  root.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.querySelector(`button[form="${e.target.id}"]`);
    if (e.target.id === 'f-pren') {
      const err = document.getElementById('c-err');
      const nome = document.getElementById('c-nome').value.trim(), tel = document.getElementById('c-tel').value.trim();
      if (!st.ora) { err.textContent = 'Scegli un orario.'; return; }
      if (nome.length < 2 || tel.replace(/\D/g, '').length < 6) { err.textContent = 'Inserisci nome e cellulare.'; return; }
      if (!document.getElementById('c-priv').checked) { err.textContent = 'Per prenotare devi accettare l\'uso dei dati.'; return; }
      btn.disabled = true; err.textContent = '';
      try { st.esito = await prenota(st.block, servizio().id, st.ora, nome, tel); st.vista = 'ok'; render(); }
      catch (x) { err.textContent = G.errore(x); btn.disabled = false; if (/SLOT/.test(x.message || '')) { P = await carica().catch(() => P); } }
    }
    if (e.target.id === 'f-rich') {
      const err = document.getElementById('r-err');
      const zone = [...document.querySelectorAll('input[name="zona"]:checked')].map(i => i.value);
      const fascia = document.querySelector('input[name="fascia"]:checked').value;
      const nome = document.getElementById('r-nome').value.trim(), tel = document.getElementById('r-tel').value.trim();
      if (!zone.length) { err.textContent = 'Scegli almeno una zona.'; return; }
      if (nome.length < 2 || tel.replace(/\D/g, '').length < 6) { err.textContent = 'Inserisci nome e cellulare.'; return; }
      if (!document.getElementById('r-priv').checked) { err.textContent = 'Per inviare la richiesta devi accettare l\'uso dei dati.'; return; }
      btn.disabled = true; err.textContent = '';
      try { st.esito = await richiedi(servizio().id, st.giorno, fascia, zone, nome, tel); st.vista = 'inviata'; render(); }
      catch (x) { err.textContent = G.mancaNelDb(x) ? 'Le richieste non sono ancora attive. Scegli un giorno con sede.' : G.errore(x); btn.disabled = false; }
    }
  });

  // ------------------------------------------------------------ avvio
  (async () => {
    root.innerHTML = '<div class="loading"><div class="spinner" aria-label="Caricamento"></div></div>';
    try {
      P = await carica();
      if (isDemo) document.body.insertAdjacentHTML('beforeend', '<div class="demo-flag">DEMO</div>');
      render();
    } catch (e) {
      console.error(e);
      const nessuno = /NESSUN_PROFILO/.test(e.message || '');
      root.innerHTML = `<main class="view no-nav"><div class="brandmini"><span class="lg">${G.LOGO}</span>Prenotazioni con ChairShare</div>
        <div class="empty">${nessuno ? 'Questa pagina non esiste o non è più attiva.' : esc(G.errore(e))}
        <a class="btn" href="${esc(C.SITO_URL)}">Vai a ChairShare</a></div></main>`;
    }
  })();
  G.registraSW();
})();
