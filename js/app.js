// ChairShare Go · app del freelance
(function () {
  const G = window.GO, C = window.GO_CONFIG, esc = G.esc, ic = G.icon;
  const root = document.getElementById('root');
  const isDemo = new URLSearchParams(location.search).has('demo') || sessionStorage.getItem('go-demo') === '1';
  if (isDemo) sessionStorage.setItem('go-demo', '1');

  let D = null;           // livello dati
  let S = null;           // stato caricato
  let agendaDay = G.oggi();
  let filtroClienti = '';

  // ------------------------------------------------------------ avvio
  async function avvio() {
    try {
      D = isDemo ? window.GO_DATA.creaDemo() : window.GO_DATA.creaSupa();
    } catch (e) {
      root.innerHTML = `<div class="view no-nav"><div class="empty">Impossibile caricare l'app. Controlla la connessione e riprova.<button class="btn" onclick="location.reload()">Riprova</button></div></div>`;
      return;
    }
    if (isDemo) document.body.insertAdjacentHTML('beforeend', '<div class="demo-flag">DEMO</div>');
    D.onAuth(s => { if (!s && S) { S = null; vistaLogin(); } });
    const s = await D.session();
    if (!s) return vistaLogin();
    await ricarica();
  }

  async function ricarica() {
    if (!S) root.innerHTML = '<div class="loading"><div class="spinner" aria-label="Caricamento"></div></div>';
    try {
      S = await D.load();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="view no-nav"><div class="empty">${esc(G.errore(e))}<button class="btn" id="retry">Riprova</button></div></div>`;
      document.getElementById('retry').onclick = ricarica;
      return;
    }
    if (S.profile.role !== 'guest') return vistaSoloFreelance();
    render();
  }

  // ------------------------------------------------------------ login
  function vistaLogin(msg) {
    root.innerHTML = `
    <main class="view no-nav" style="justify-content:space-between">
      <div class="stack" style="gap:26px">
        ${G.lockup('lg')}
        <div class="stack">
          <h1 class="hero-t">Lo spazio quando ti serve, l'agenda sempre gratis.</h1>
          <p class="muted">Zero commissioni sui tuoi clienti. Accedi con il tuo account ChairShare da professionista.</p>
        </div>
        <form id="f-login" class="stack" novalidate>
          <div class="field"><label for="l-email">Email</label>
            <input class="input" id="l-email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="l-pass">Password</label>
            <input class="input" id="l-pass" type="password" autocomplete="current-password"></div>
          <p class="form-err" id="l-err" role="alert">${esc(msg || '')}</p>
          <button class="btn primary block" type="submit">Accedi</button>
          <button class="btn plain" type="button" id="l-magic">Accedi con un link via email</button>
        </form>
      </div>
      <div class="stack center small">
        <a href="${esc(C.SITO_URL)}" class="muted">Non hai un account? Registrati su ChairShare come professionista</a>
        <a href="?demo=1" class="muted">Guarda la demo</a>
      </div>
    </main>`;
    const err = document.getElementById('l-err');
    document.getElementById('f-login').onsubmit = async e => {
      e.preventDefault();
      const email = document.getElementById('l-email').value.trim(), pass = document.getElementById('l-pass').value;
      if (!email || !pass) { err.textContent = 'Inserisci email e password.'; return; }
      const b = e.submitter; b.disabled = true; err.textContent = '';
      try { await D.login(email, pass); await ricarica(); } catch (x) { err.textContent = G.errore(x); b.disabled = false; }
    };
    document.getElementById('l-magic').onclick = async () => {
      const email = document.getElementById('l-email').value.trim();
      if (!email) { err.textContent = 'Scrivi prima la tua email.'; return; }
      try { await D.magicLink(email); err.textContent = ''; G.toast('Ti abbiamo mandato un link di accesso via email.'); }
      catch (x) { err.textContent = G.errore(x); }
    };
  }

  function vistaSoloFreelance() {
    root.innerHTML = `<main class="view no-nav">${G.lockup('lg')}
      <div class="card"><h1 class="h2">L'agenda è per i professionisti</h1>
      <p class="muted">Il tuo account è registrato come Host. Gestisci i tuoi spazi e le prenotazioni dal sito ChairShare.</p>
      <a class="btn primary" href="${esc(C.SITO_URL)}">Vai al sito</a>
      <button class="btn" id="esci">Esci</button></div></main>`;
    document.getElementById('esci').onclick = () => D.logout();
  }

  // ------------------------------------------------------------ dati derivati
  const zonaDi = b => (b.spaces && (b.spaces.zone || b.spaces.city)) || 'Sede';
  const nomeSpazio = b => (b.spaces && b.spaces.name) || 'Postazione';
  const attivi = () => S.appts.filter(a => a.status !== 'cancelled');
  const bloccoDi = day => S.blocks.filter(b => b.day === day);
  const appDi = day => attivi().filter(a => a.day === day).sort((a, b) => G.min(a.start_time) - G.min(b.start_time));
  const eventiDi = day => S.events.filter(e => e.day === day).sort((a, b) => G.min(a.start_time) - G.min(b.start_time));
  function richiesteAperte() {
    const now = Date.now(), t = G.oggi();
    return S.requests.filter(r => r.status === 'pending' && r.day > t && new Date(r.expires_at).getTime() > now);
  }
  const richiesteDi = day => richiesteAperte().filter(r => r.day === day);
  function oreRimaste(r) { return Math.max(1, Math.round((new Date(r.expires_at).getTime() - Date.now()) / 3600e3)); }
  function linkPersonale() { return (C.APP_URL || location.origin) + '/go/' + (S.profile.slug || ''); }
  function linkRicerca(zona, day) {
    // il sito accetta solo lettere minuscole, numeri e trattini (es. marano-di-napoli)
    const slug = String(zona || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return slug.length >= 2 ? C.SEARCH_URL.replace('{citta}', slug) : C.SITO_URL;
  }
  // "al Vomero", "a Marano di Napoli": i quartieri con articolo più comuni prendono "al"
  function aZona(z) {
    return /^(vomero|centro|borgo|rione|corso|lungomare|porto|quartiere|parco)\b/i.test(z) ? `al ${z}` : `a ${z}`;
  }
  function primoNome() { return String(S.profile.full_name || '').trim().split(/\s+/)[0] || ''; }

  // ------------------------------------------------------------ router
  const TABS = [
    ['oggi', 'Oggi', 'home'], ['agenda', 'Agenda', 'cal'], ['richieste', 'Richieste', 'inbox'],
    ['clienti', 'Clienti', 'users'], ['profilo', 'Profilo', 'user']
  ];
  function tab() { const h = location.hash.replace('#/', ''); return TABS.some(t => t[0] === h) ? h : 'oggi'; }
  window.addEventListener('hashchange', () => { if (S) render(); });

  function render() {
    const t = tab();
    const viste = { oggi: vOggi, agenda: vAgenda, richieste: vRichieste, clienti: vClienti, profilo: vProfilo };
    const nRich = S.features.requests ? richiesteAperte().length : 0;
    root.innerHTML = `<main class="view" id="main">${viste[t]()}</main>
      ${t === 'agenda' ? `<button type="button" class="fab" data-act="add" aria-label="Aggiungi appuntamento o impegno">${ic('plus', 26)}</button>` : ''}
      <nav class="nav" aria-label="Navigazione principale"><div class="nav-in">
      ${TABS.map(([k, l, i]) => `<a href="#/${k}" ${k === t ? 'aria-current="page"' : ''}>${ic(i, 24)}${k === 'richieste' && nRich ? `<span class="cnt">${nRich}</span>` : ''}${l}</a>`).join('')}
      </div></nav>`;
    window.scrollTo(0, 0);
    if (t === 'profilo') montaQR();
  }

  // ------------------------------------------------------------ componenti
  function giornata(day) {
    const blocchi = bloccoDi(day), ev = S.features.events ? eventiDi(day) : [];
    if (!blocchi.length && !ev.length) return '';
    const items = [
      ...blocchi.map(b => ({ s: G.min(b.start_time), html: boxBlocco(b) })),
      ...ev.map(e => ({ s: G.min(e.start_time), html: `<button type="button" class="eventbox" data-act="evento" data-id="${esc(e.id)}" style="width:100%;text-align:left;cursor:pointer"><span><strong>${G.ora(e.start_time)} – ${G.ora(e.end_time)}</strong> · ${esc(e.title)}</span><span>Solo per te</span></button>` }))
    ].sort((a, b) => a.s - b.s);
    return items.map(i => i.html).join('');
  }

  function boxBlocco(b) {
    const ap = appDi(b.day).filter(a => !a.block_id || a.block_id === b.id);
    const inizio = G.min(b.start_time), fine = G.min(b.end_time);
    const passato = b.day === G.oggi() ? G.oraMinuti() : (b.day < G.oggi() ? 24 * 60 : -1);
    let righe = '';
    for (let m = inizio; m < fine;) {
      const a = ap.find(x => G.min(x.start_time) <= m && G.min(x.end_time) > m);
      if (a) {
        righe += `<button type="button" class="slot ${a.status === 'completed' ? 'done' : ''}" data-act="app" data-id="${esc(a.id)}"><span class="t">${G.ora(a.start_time)}</span><span class="grow">${esc(G.nomeBreve(a.client_name))} · ${esc(a.service_name)}</span>${a.status === 'completed' ? ic('check', 16) : ''}</button>`;
        m = Math.max(G.min(a.end_time), m + 60);
      } else {
        const libero = m + 60 > passato;
        const online = G.prenotabile(b.day, m, S.profile.booking_notice_hours);   // oltre il preavviso: lo aggiungi tu
        righe += libero
          ? `<button type="button" class="slot free" data-act="nuovo" data-block="${esc(b.id)}" data-ora="${G.hhmm(m)}"><span class="t">${G.hhmm(m)}</span><span>${online ? 'Libero, prenotabile online' : 'Libero · tocca per aggiungere'}</span></button>`
          : `<div class="slot free" style="opacity:.5;cursor:default"><span class="t">${G.hhmm(m)}</span><span>Libero</span></div>`;
        m += 60;
      }
    }
    return `<div class="blockbox"><div class="bh"><span>${G.ora(b.start_time)} – ${G.ora(b.end_time)} · ${esc(nomeSpazio(b))}</span><span>${esc(zonaDi(b))}</span></div>${righe}</div>`;
  }

  function bannerRichieste() {
    if (!S.features.requests) return '';
    const aperte = richiesteAperte();
    if (!aperte.length) return '';
    const day = aperte.map(r => r.day).sort()[0];
    const delGiorno = richiesteDi(day);
    const perZona = {};
    delGiorno.forEach(r => { perZona[r.zones[0]] = (perZona[r.zones[0]] || 0) + 1; });
    const zone = Object.entries(perZona).sort((a, b) => b[1] - a[1]);
    const valore = delGiorno.reduce((s, r) => s + Number(r.service_price || 0), 0);
    const haSede = bloccoDi(day).length > 0;
    const testoZone = zone.map(([z, n]) => `${n} ${aZona(z)}`).join(', ');
    return `<section class="card tint" aria-label="Richieste in attesa">
      <div class="stack s6"><strong style="font-size:16px">${delGiorno.length} ${delGiorno.length === 1 ? 'richiesta' : 'richieste'} per ${esc(G.dataLunga(day).toLowerCase())}</strong>
      <span class="small" style="color:var(--ink-2)">${esc(testoZone)} · ${G.euro(valore)} potenziali.${haSede ? '' : ' Non hai ancora una sede quel giorno.'}</span></div>
      ${haSede
        ? `<a class="btn primary" href="#/richieste">Conferma le richieste</a>`
        : `<a class="btn primary" href="${esc(linkRicerca(zone[0][0], day))}" target="_blank" rel="noopener">Trova uno spazio ${esc(aZona(zone[0][0]))}</a>`}
    </section>`;
  }

  function cardPrimiPassi() {
    const fatto1 = !!S.profile.full_name, fatto2 = S.services.length > 0;
    const fatto3 = (S.features.zones ? S.profile.work_zones.length > 0 : true);
    const fatto4 = localStorage.getItem('go-condiviso') === '1';
    if (fatto2 && fatto3 && fatto4) return '';
    const passi = [
      [fatto1, 'Completa il profilo', 'Nome e foto sul sito ChairShare', null],
      [fatto2, 'Crea il listino', 'Servizi a ore intere, con il prezzo', '#/profilo'],
      ...(S.features.zones ? [[fatto3, 'Indica le tue zone', 'Dove sei disposto a lavorare', '#/profilo']] : []),
      [fatto4, 'Condividi il tuo link', 'WhatsApp, bio di Instagram, QR code', '#/profilo']
    ];
    const cur = passi.findIndex(p => !p[0]);
    return `<section class="stack" aria-label="Per iniziare"><h2 class="h2">Per iniziare</h2><ol class="steps">
      ${passi.map((p, i) => `<li class="${p[0] ? 'done' : (i === cur ? 'cur' : '')}"><span class="n">${p[0] ? ic('check', 16) : i + 1}</span>
      <div class="grow stack" style="gap:2px"><strong>${p[1]}</strong><span class="small muted">${p[2]}</span></div>
      ${!p[0] && p[3] ? `<a class="btn sm" href="${p[3]}">Vai</a>` : ''}</li>`).join('')}
    </ol></section>`;
  }

  function prossimoApp() {
    const t = G.oggi(), now = G.oraMinuti();
    return attivi().filter(a => a.status === 'confirmed' && (a.day > t || (a.day === t && G.min(a.end_time) > now)))
      .sort((a, b) => (a.day + a.start_time).localeCompare(b.day + b.start_time))[0];
  }
  function quando(a) {
    const t = G.oggi();
    if (a.day === t) {
      const diff = G.min(a.start_time) - G.oraMinuti();
      if (diff <= 0) return 'In corso';
      if (diff < 90) return `Tra ${diff} min`;
      return `Oggi alle ${G.ora(a.start_time)}`;
    }
    if (a.day === G.addDays(t, 1)) return `Domani alle ${G.ora(a.start_time)}`;
    return `${G.dataMedia(a.day)} alle ${G.ora(a.start_time)}`;
  }

  // ------------------------------------------------------------ viste
  function vOggi() {
    const t = G.oggi(), p = prossimoApp();
    const b = p ? S.blocks.find(x => x.id === p.block_id) : null;
    const giorno = giornata(t);
    const domani = G.addDays(t, 1), nDomani = appDi(domani).filter(a => a.status === 'confirmed').length;
    return `
    <div class="row between">${G.lockup()}<button type="button" class="pill-btn" data-act="condividi">${ic('share', 18)}Il tuo link</button></div>
    <header class="stack" style="gap:2px"><span class="sub muted small">${esc(G.dataLunga(t))}</span>
      <h1 class="h1">Ciao ${esc(primoNome())}</h1></header>
    ${bannerRichieste()}
    ${cardPrimiPassi()}
    ${p ? `<section class="card raised" aria-label="Prossimo appuntamento">
      <span class="kicker">Prossimo · ${esc(quando(p))}</span>
      <div class="stack" style="gap:2px"><strong style="font-size:20px">${G.ora(p.start_time)} – ${G.ora(p.end_time)}</strong>
      <span>${esc(G.nomeBreve(p.client_name))} · ${esc(p.service_name)}</span></div>
      ${b ? `<div class="place">${ic('pin', 16)}${esc(nomeSpazio(b))} · ${esc(zonaDi(b))}</div>` : ''}
      <div class="btns"><a class="btn" href="${esc(G.waLink(p.client_phone, `Ciao ${G.nomeBreve(p.client_name).split(' ')[0]}, ti ricordo il nostro appuntamento ${quando(p).toLowerCase()}.`))}" target="_blank" rel="noopener">WhatsApp</a>
      ${b ? `<a class="btn" href="${esc(G.mapsLink(nomeSpazio(b) + ' ' + (b.spaces.city || '')))}" target="_blank" rel="noopener">Naviga</a>` : ''}</div>
    </section>` : ''}
    <section class="stack" aria-label="La tua giornata"><h2 class="h2">La tua giornata</h2>
      ${giorno || `<div class="empty">Oggi non hai postazioni né impegni.<a class="btn outline" href="${esc(C.SITO_URL)}" target="_blank" rel="noopener">Prenota uno spazio</a></div>`}
    </section>
    ${nDomani ? `<section class="card soft"><div class="row between"><span><strong>Domani hai ${nDomani} ${nDomani === 1 ? 'cliente' : 'clienti'}</strong><br><span class="small muted">Manda il promemoria su WhatsApp</span></span>
      <a class="btn sm" href="#/agenda" data-act="vai-domani">Apri</a></div></section>` : ''}
    ${cardInstalla()}`;
  }

  function cardInstalla() {
    if (G.installata()) return '';
    if (G.puoInstallare()) return `<section class="card soft"><div class="row between"><span class="small"><strong>Installa l'app</strong><br>Aprila dalla schermata Home come un'app.</span><button class="btn sm primary" data-act="installa">Installa</button></div></section>`;
    if (G.iOS()) return `<section class="card soft"><p class="small"><strong>Installa l'app su iPhone:</strong> tocca ${ic('share', 14, 'style="vertical-align:-2px"')} Condividi in Safari, poi “Aggiungi alla schermata Home”.</p></section>`;
    return '';
  }

  function vAgenda() {
    const lun = G.lunediDi(agendaDay), t = G.oggi();
    const giorni = Array.from({ length: 7 }, (_, i) => G.addDays(lun, i));
    const mese = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(agendaDay + 'T12:00:00Z'));
    const rq = richiesteDi(agendaDay);
    const contenuto = giornata(agendaDay);
    return `
    <header class="head"><h1 class="h1" style="text-transform:capitalize">${esc(mese)}</h1>
      <div class="row" style="gap:6px">
        <button type="button" class="icon-btn" data-act="sett" data-d="-7" aria-label="Settimana precedente">${ic('left', 18)}</button>
        <button type="button" class="icon-btn" data-act="sett" data-d="7" aria-label="Settimana successiva">${ic('right', 18)}</button></div></header>
    <div class="week" role="group" aria-label="Giorni della settimana">
      ${giorni.map(d => {
        const nr = richiesteDi(d).length, hasB = bloccoDi(d).length, hasE = S.features.events && eventiDi(d).length;
        const cls = ['dayb', d === agendaDay ? 'sel' : '', nr && !hasB ? 'req' : '', d === t ? 'today' : ''].join(' ');
        return `<button type="button" class="${cls}" data-act="giorno" data-d="${d}" aria-pressed="${d === agendaDay}" aria-label="${esc(G.dataLunga(d))}">
          <span class="dn">${G.giornoBreve(d)}</span><strong>${G.numero(d)}</strong>
          ${nr && !hasB ? `<span class="rq">${nr} rich.</span>` : (hasB ? '<span class="dot b"></span>' : (hasE ? '<span class="dot g"></span>' : '<span class="dot"></span>'))}</button>`;
      }).join('')}
    </div>
    <section class="stack" aria-label="${esc(G.dataLunga(agendaDay))}">
      <div class="row between"><h2 class="h2">${esc(G.dataLunga(agendaDay))}</h2>${agendaDay !== t ? `<button type="button" class="btn link sm" data-act="giorno" data-d="${t}">Oggi</button>` : ''}</div>
      ${rq.length && !bloccoDi(agendaDay).length ? `<a class="card tint" href="#/richieste" style="text-decoration:none;color:inherit"><strong>${rq.length} ${rq.length === 1 ? 'richiesta' : 'richieste'} per questo giorno</strong><span class="small" style="color:var(--ink-2)">Prenota uno spazio per confermarle</span></a>` : ''}
      ${contenuto || `<div class="empty">Nessuna postazione né impegno.<a class="btn outline sm" href="${esc(linkRicerca('', agendaDay))}" target="_blank" rel="noopener">Trova uno spazio</a></div>`}
    </section>
    <div class="legend"><span><i style="background:var(--block);border:1px solid var(--slot-line)"></i>Postazione: prenotabile online</span>${S.features.events ? '<span><i style="background:var(--grey);border:1px solid var(--field)"></i>Impegno personale</span>' : ''}</div>`;
  }

  function vRichieste() {
    if (!S.features.requests) {
      return `<header class="stack s6"><h1 class="h1">Richieste</h1></header>
      <div class="empty">Le richieste per i giorni senza sede si attivano dopo l'aggiornamento del database.</div>`;
    }
    const aperte = richiesteAperte();
    const giorni = [...new Set(aperte.map(r => r.day))].sort();
    return `<header class="stack s6"><h1 class="h1">Richieste</h1>
      <p class="lead">Clienti che ti vogliono in una delle tue zone, nei giorni in cui non hai ancora una sede.</p></header>
      ${giorni.length ? giorni.map(cardGiornoRichieste).join('') : `<div class="empty">Nessuna richiesta in attesa.<span class="small">Condividi il tuo link: i clienti possono chiederti anche i giorni in cui non hai ancora una sede.</span><button class="btn outline sm" data-act="condividi">Condividi il link</button></div>`}`;
  }

  function cardGiornoRichieste(day) {
    const rq = richiesteDi(day), blocchi = bloccoDi(day);
    const zoneSede = blocchi.map(zonaDi);
    const valore = rq.reduce((s, r) => s + Number(r.service_price || 0), 0);
    const scad = Math.min(...rq.map(oreRimaste));
    const gruppi = {};
    rq.forEach(r => { (gruppi[r.zones[0]] = gruppi[r.zones[0]] || []).push(r); });
    const ordine = Object.keys(gruppi).sort((a, b) => gruppi[b].length - gruppi[a].length);
    return `<section class="card raised" aria-label="${esc(G.dataLunga(day))}">
      <div class="row between" style="align-items:flex-start"><div class="stack" style="gap:2px"><h2 class="h2">${esc(G.dataLunga(day))}</h2>
      <span class="small" style="color:var(--ink-2)">${rq.length} ${rq.length === 1 ? 'richiesta' : 'richieste'} · <strong style="color:var(--ink)">${G.euro(valore)} potenziali</strong></span></div>
      <span class="badge ${scad < 44 ? 'warn' : ''}">Scade tra ${scad} h</span></div>
      ${blocchi.length ? `<div class="info">${ic('pin', 16)}<span>Quel giorno hai una sede a <strong>${esc(zoneSede.join(', '))}</strong>.</span></div>` : ''}
      ${ordine.map((z, i) => {
        const lista = gruppi[z];
        const tot = lista.reduce((s, r) => s + Number(r.service_price || 0), 0);
        return `<div class="zonebox ${i === 0 ? 'hot' : ''}">
          <div class="row between small"><strong class="row" style="gap:6px">${ic('pin', 16)}${esc(z)}</strong><span style="color:var(--ink-2)">${lista.length} · ${G.euro(tot)}</span></div>
          ${lista.map(r => rigaRichiesta(r, zoneSede)).join('')}
          ${blocchi.length ? '' : `<a class="btn ${i === 0 ? 'primary' : 'outline'}" href="${esc(linkRicerca(z, day))}" target="_blank" rel="noopener">Trova uno spazio ${esc(aZona(z))}</a>`}
        </div>`;
      }).join('')}
      <div class="info">${ic('info', 16)}<span>Confermi solo le richieste della zona in cui hai la sede. Agli altri clienti chiedi su WhatsApp se vogliono venire o cambiare data.</span></div>
    </section>`;
  }

  function rigaRichiesta(r, zoneSede) {
    const solo = r.zones.length === 1 ? `Solo ${r.zones[0]}` : r.zones.join(' o ');
    const inZona = zoneSede.length && r.zones.some(z => zoneSede.some(s => s.toLowerCase() === z.toLowerCase()));
    let azione = '';
    if (zoneSede.length && inZona) azione = `<button class="btn sm primary" data-act="conferma-rq" data-id="${esc(r.id)}">Conferma</button>`;
    else if (zoneSede.length) azione = `<a class="btn sm" href="${esc(G.waLink(r.client_phone, `Ciao ${r.client_name.split(' ')[0]}, ${G.dataLunga(r.day).toLowerCase()} sarò ${aZona(zoneSede[0])}. Ti va bene venire lì, o preferisci un altro giorno?`))}" target="_blank" rel="noopener">Chiedi</a>`;
    return `<div class="req-item" style="flex-direction:column;align-items:stretch">
      <div class="row between" style="align-items:flex-start"><div class="stack" style="gap:2px"><span><strong>${esc(G.nomeBreve(r.client_name))}</strong> · ${esc(r.slot)}</span>
        <span class="tiny muted">${esc(r.service_name)} · ${G.durata(r.service_duration)} · ${G.euro(r.service_price)}</span></div>
        <button type="button" class="icon-btn" style="width:36px;height:36px" data-act="rifiuta-rq" data-id="${esc(r.id)}" aria-label="Rifiuta la richiesta di ${esc(r.client_name)}">${ic('x', 16)}</button></div>
      <div class="row between"><span class="badge">${esc(solo)}</span>${azione}</div></div>`;
  }

  function rubrica() {
    const map = new Map(), t = G.oggi();
    const norm = p => String(p || '').replace(/[^0-9]/g, '').slice(-10);
    attivi().forEach(a => {
      const k = norm(a.client_phone);
      const c = map.get(k) || { nome: a.client_name, tel: a.client_phone, visite: 0, ultima: null, prossimo: null };
      if (a.day < t || a.status === 'completed') { c.visite++; if (!c.ultima || a.day > c.ultima) c.ultima = a.day; }
      else if (!c.prossimo || (a.day + a.start_time) < (c.prossimo.day + c.prossimo.start_time)) c.prossimo = a;
      c.nome = a.client_name; map.set(k, c);
    });
    if (S.features.requests) richiesteAperte().forEach(r => {
      const k = norm(r.client_phone);
      if (!map.has(k)) map.set(k, { nome: r.client_name, tel: r.client_phone, visite: 0, ultima: null, prossimo: null, richiesta: r.day });
    });
    return [...map.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
  }

  function vClienti() {
    const tutti = rubrica();
    const q = filtroClienti.toLowerCase();
    const lista = q ? tutti.filter(c => c.nome.toLowerCase().includes(q) || String(c.tel).includes(q)) : tutti;
    const t = G.oggi();
    const daRecensire = attivi().filter(a => (a.status === 'completed' || a.day < t) && a.day >= G.addDays(t, -3))
      .sort((a, b) => (b.day + b.start_time).localeCompare(a.day + a.start_time))[0];
    const sub = c => {
      if (c.prossimo) return c.prossimo.day === t ? `Oggi alle ${G.ora(c.prossimo.start_time)}` : `Prossimo: ${G.dataMedia(c.prossimo.day)}`;
      if (c.richiesta) return `Nuovo · richiesta per ${G.dataMedia(c.richiesta)}`;
      return c.ultima ? `Ultima visita ${G.dataMedia(c.ultima)}` : '';
    };
    return `<header class="row between" style="align-items:baseline"><h1 class="h1">Clienti</h1><span class="small muted">${tutti.length} in rubrica</span></header>
      <div class="field"><label for="cerca">Cerca cliente</label><input class="input search" id="cerca" type="search" placeholder="Nome o telefono" value="${esc(filtroClienti)}"></div>
      ${daRecensire && S.profile.slug ? `<section class="card tint"><div class="row"><span class="avatar brand" aria-hidden="true">${esc(G.iniziali(daRecensire.client_name))}</span>
        <div class="stack" style="gap:2px"><strong>${esc(G.nomeBreve(daRecensire.client_name))}</strong><span class="small" style="color:var(--ink-2)">${daRecensire.day === G.addDays(t, -1) ? 'Seduta di ieri' : 'Seduta del ' + esc(G.dataMedia(daRecensire.day))}</span></div></div>
        <a class="btn primary" href="${esc(G.waLink(daRecensire.client_phone, `Ciao ${daRecensire.client_name.split(' ')[0]}, grazie per la fiducia! Se ti va, lasciami una recensione qui: ${C.REVIEW_URL.replace('{slug}', S.profile.slug)}`))}" target="_blank" rel="noopener">Chiedi una recensione su WhatsApp</a></section>` : ''}
      <ul class="list" aria-label="Rubrica" id="rubrica">
        ${lista.length ? lista.map(c => `<li><span class="avatar" aria-hidden="true">${esc(G.iniziali(c.nome))}</span>
          <div class="grow stack" style="gap:2px"><strong>${esc(G.nomeBreve(c.nome))}</strong><span class="small muted">${esc(sub(c))}${c.visite ? ` · ${c.visite} ${c.visite === 1 ? 'visita' : 'visite'}` : ''}</span></div>
          <a class="icon-btn" href="${esc(G.waLink(c.tel, ''))}" target="_blank" rel="noopener" aria-label="Scrivi su WhatsApp a ${esc(c.nome)}">${ic('chat')}</a></li>`).join('')
          : `<li><span class="muted">${tutti.length ? 'Nessun cliente trovato.' : 'I clienti compaiono qui dopo la prima prenotazione.'}</span></li>`}
      </ul>`;
  }

  function vProfilo() {
    const pr = S.profile, link = pr.slug ? linkPersonale() : '';
    const r = S.rating;
    return `<h1 class="h1">Profilo</h1>
    <section class="card raised" aria-label="La tua pagina pubblica">
      <div class="row" style="gap:14px"><span class="avatar lg" aria-hidden="true">${esc(G.iniziali(pr.full_name))}</span>
        <div class="stack" style="gap:2px"><strong style="font-size:18px">${esc(pr.full_name || 'Il tuo nome')}</strong>
        ${r && r.count ? `<span class="small" style="color:var(--ink-2)">★ ${String(r.avg).replace('.', ',')} · ${r.count} recensioni</span>` : '<span class="small muted">Ancora nessuna recensione</span>'}</div></div>
      ${link ? `<div class="row between" style="padding:10px 12px;border-radius:12px;background:var(--soft)"><span class="small" style="font-weight:600;word-break:break-all">${esc(link.replace(/^https?:\/\//, ''))}</span>
        <button type="button" class="btn sm" data-act="copia">Copia</button></div>
        <div class="btns"><a class="btn primary sm" data-act="wa-share" href="${esc(G.waLink('', `Prenota con me qui: ${link}`))}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="btn sm" data-act="condividi">Condividi</button>
        <button type="button" class="btn sm" data-act="qr">QR code</button></div>
        <a class="btn plain" href="${esc(link + (D.demo ? '?demo=1' : ''))}" target="_blank" rel="noopener">Vedi come ti vede il cliente</a>`
        : '<p class="small muted">Il tuo link personale non è ancora attivo.</p>'}
    </section>
    ${S.features.zones ? `<section class="stack" aria-label="Zone di lavoro"><h2 class="h2">Zone di lavoro</h2>
      <div class="row wrap" style="gap:8px">${pr.work_zones.map((z, i) => `<span class="chip">${esc(z)}<button type="button" data-act="rm-zona" data-i="${i}" aria-label="Rimuovi ${esc(z)}">${ic('x', 14)}</button></span>`).join('')}
      ${pr.work_zones.length < 6 ? '<button type="button" class="chip add" data-act="add-zona">+ Zona</button>' : ''}</div>
      <span class="tiny muted">I clienti scelgono in quali di queste zone sono disposti a venire.</span></section>` : ''}
    <section class="stack s6" aria-label="Listino"><div class="row between"><h2 class="h2">Listino</h2><button type="button" class="btn link" data-act="add-serv">+ Aggiungi</button></div>
      ${S.services.length ? S.services.map(s => `<div class="line-row"><span>${esc(s.name)} <span class="muted">· ${G.durata(s.duration_min)}</span></span>
        <span class="row" style="gap:6px"><strong>${G.euro(s.price)}</strong><button type="button" class="icon-btn" style="width:36px;height:36px;border:none" data-act="rm-serv" data-id="${esc(s.id)}" aria-label="Elimina ${esc(s.name)}">${ic('trash', 16)}</button></span></div>`).join('')
        : '<div class="empty">Aggiungi il primo servizio: i clienti lo vedranno sulla tua pagina.</div>'}
    </section>
    <section class="stack s6" aria-label="Regole"><h2 class="h2">Regole di prenotazione</h2>
      <div class="line-row" style="align-items:center"><label for="pv">Prenotazione online</label>
        ${S.features.notice ? `<select class="input" id="pv" style="width:auto;min-height:40px;font-size:14px">${G.PREAVVISI.map(([h, t]) => `<option value="${h}" ${h === S.profile.booking_notice_hours ? 'selected' : ''}>${t}</option>`).join('')}</select>`
          : `<span class="muted">${esc(G.testoPreavviso(0))}</span>`}</div>
      <p class="tiny muted">I clienti vedono solo gli orari che rispettano il preavviso. Tu puoi sempre aggiungere un cliente a mano.</p>
      <div class="line-row"><span>Cancellazione gratuita</span><span class="muted">fino a 24 h prima</span></div></section>
    ${cardInstalla()}
    <div class="stack"><a class="btn" href="${esc(C.SITO_URL)}" target="_blank" rel="noopener">Vai al sito ChairShare</a>
    <button type="button" class="btn plain" data-act="esci">Esci</button></div>`;
  }

  // ------------------------------------------------------------ sheet
  function sheetApp(a) {
    const b = S.blocks.find(x => x.id === a.block_id);
    const fatto = a.status === 'completed';
    G.sheet(`${G.ora(a.start_time)} – ${G.ora(a.end_time)}`, `
      <div class="stack" style="gap:2px"><strong style="font-size:17px">${esc(a.client_name)}</strong>
      <span class="muted">${esc(a.service_name)} · ${G.euro(a.service_price)} · ${esc(G.dataLunga(a.day))}</span></div>
      ${b ? `<div class="place">${ic('pin', 16)}${esc(nomeSpazio(b))} · ${esc(zonaDi(b))}</div>` : ''}
      ${a.private_notes ? `<p class="small" style="background:var(--soft);padding:10px;border-radius:10px">${esc(a.private_notes)}</p>` : ''}
      <a class="btn primary" href="${esc(G.waLink(a.client_phone, `Ciao ${a.client_name.split(' ')[0]}, ti ricordo l'appuntamento di ${G.dataLunga(a.day).toLowerCase()} alle ${G.ora(a.start_time)}${b ? ' ' + aZona(zonaDi(b)) : ''}.`))}" target="_blank" rel="noopener">${ic('chat', 18)}Promemoria su WhatsApp</a>
      ${fatto ? '<span class="badge ok" style="align-self:flex-start">Completato</span>' : `<button type="button" class="btn" id="s-fatto">Segna come completato</button>`}
      ${fatto ? '' : `<button type="button" class="btn plain" id="s-annulla" style="color:#B3261E">Annulla appuntamento</button>`}`,
      w => {
        const f = w.querySelector('#s-fatto'), x = w.querySelector('#s-annulla');
        if (f) f.onclick = () => azione(() => D.updateAppt(a.id, { status: 'completed' }), 'Segnato come completato');
        if (x) x.onclick = () => {
          if (x.dataset.ok) azione(() => D.updateAppt(a.id, { status: 'cancelled' }), 'Appuntamento annullato. Avvisa il cliente.');
          else { x.dataset.ok = '1'; x.textContent = 'Tocca di nuovo per confermare'; }
        };
      });
  }

  function sheetNuovo(blockId, oraDefault, preset) {
    const b = S.blocks.find(x => x.id === blockId);
    if (!S.services.length) { G.toast('Prima aggiungi un servizio al listino.'); location.hash = '#/profilo'; return; }
    const ore = [];
    for (let m = G.min(b.start_time); m < G.min(b.end_time); m += 60) ore.push(G.hhmm(m));
    G.sheet(preset ? 'Conferma richiesta' : 'Nuovo appuntamento', `
      <p class="small muted">${esc(G.dataLunga(b.day))} · ${esc(nomeSpazio(b))} · ${esc(zonaDi(b))}</p>
      <form id="f-new" class="stack" novalidate>
        ${preset ? `<p><strong>${esc(preset.client_name)}</strong> · ${esc(preset.service_name)} · preferisce ${esc(preset.slot)}</p>` : `
        <div class="field"><label for="n-serv">Servizio</label><select class="input" id="n-serv">${S.services.map(s => `<option value="${esc(s.id)}">${esc(s.name)} · ${G.durata(s.duration_min)} · ${G.euro(s.price)}</option>`).join('')}</select></div>`}
        <div class="field"><label for="n-ora">Orario</label><select class="input" id="n-ora">${ore.map(o => `<option ${o === oraDefault ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        ${preset ? '' : `<div class="field"><label for="n-nome">Nome e cognome del cliente</label><input class="input" id="n-nome" autocomplete="off" required></div>
        <div class="field"><label for="n-tel">Cellulare</label><input class="input" id="n-tel" type="tel" autocomplete="off" required></div>`}
        <p class="form-err" id="n-err" role="alert"></p>
        <button class="btn primary" type="submit">${preset ? 'Conferma e avvisa il cliente' : 'Aggiungi'}</button>
      </form>`, w => {
      w.querySelector('#f-new').onsubmit = async e => {
        e.preventDefault();
        const err = w.querySelector('#n-err'), btn = e.submitter; err.textContent = ''; btn.disabled = true;
        const ora = w.querySelector('#n-ora').value;
        try {
          if (preset) {
            await D.confirmRequest(preset.id, blockId, ora);
            const msg = `Ciao ${preset.client_name.split(' ')[0]}, confermato! Ci vediamo ${G.dataLunga(b.day).toLowerCase()} alle ${ora} ${aZona(zonaDi(b))}. Ti mando l'indirizzo esatto qui.`;
            G.chiudiSheet(); await ricarica();
            G.sheet('Richiesta confermata', `<p>Avvisa ${esc(preset.client_name)} su WhatsApp con l'orario e l'indirizzo.</p>
              <a class="btn primary" href="${esc(G.waLink(preset.client_phone, msg))}" target="_blank" rel="noopener">${ic('chat', 18)}Avvisa su WhatsApp</a>`);
            return;
          }
          const nome = w.querySelector('#n-nome').value.trim(), tel = w.querySelector('#n-tel').value.trim();
          if (nome.length < 2 || tel.replace(/\D/g, '').length < 6) throw new Error('DATI_NON_VALIDI');
          await D.addAppt(blockId, w.querySelector('#n-serv').value, ora, nome, tel);
          G.chiudiSheet(); G.toast('Appuntamento aggiunto'); await ricarica();
        } catch (x) { err.textContent = G.errore(x); btn.disabled = false; }
      };
    });
  }

  function sheetAggiungi() {
    const blocchi = bloccoDi(agendaDay);
    G.sheet('Aggiungi', `<p class="small muted">${esc(G.dataLunga(agendaDay))}</p>
      ${blocchi.map(b => `<button type="button" class="btn" data-b="${esc(b.id)}">Appuntamento · ${G.ora(b.start_time)}–${G.ora(b.end_time)} ${esc(zonaDi(b))}</button>`).join('')}
      ${blocchi.length ? '' : '<p class="small">Per gli appuntamenti online serve una postazione quel giorno.</p>'}
      ${S.features.events ? '<button type="button" class="btn" id="a-ev">Impegno personale</button>' : ''}
      <a class="btn outline" href="${esc(linkRicerca('', agendaDay))}" target="_blank" rel="noopener">Prenota uno spazio</a>`, w => {
      w.querySelectorAll('[data-b]').forEach(x => x.onclick = () => sheetNuovo(x.dataset.b, null));
      const ev = w.querySelector('#a-ev'); if (ev) ev.onclick = sheetEvento;
    });
  }

  function sheetEvento() {
    const ore = Array.from({ length: 16 }, (_, i) => G.hhmm((7 + i) * 60));
    G.sheet('Impegno personale', `<form id="f-ev" class="stack" novalidate>
      <p class="small muted">${esc(G.dataLunga(agendaDay))} · visibile solo a te</p>
      <div class="field"><label for="e-t">Titolo</label><input class="input" id="e-t" maxlength="80" placeholder="Es. Commercialista" required></div>
      <div class="btns"><div class="field"><label for="e-s">Dalle</label><select class="input" id="e-s">${ore.map(o => `<option ${o === '15:00' ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="field"><label for="e-e">Alle</label><select class="input" id="e-e">${ore.map(o => `<option ${o === '16:00' ? 'selected' : ''}>${o}</option>`).join('')}<option>23:00</option></select></div></div>
      <p class="form-err" id="e-err" role="alert"></p><button class="btn primary" type="submit">Salva</button></form>`, w => {
      w.querySelector('#f-ev').onsubmit = async e => {
        e.preventDefault();
        const title = w.querySelector('#e-t').value.trim(), s = w.querySelector('#e-s').value, en = w.querySelector('#e-e').value;
        const err = w.querySelector('#e-err');
        if (!title) { err.textContent = 'Scrivi un titolo.'; return; }
        if (G.min(en) <= G.min(s)) { err.textContent = 'L\'orario di fine deve essere dopo l\'inizio.'; return; }
        await azione(() => D.addEvent({ day: agendaDay, start_time: s, end_time: en, title }), 'Impegno salvato');
      };
    });
  }

  function sheetServizio() {
    G.sheet('Nuovo servizio', `<form id="f-sv" class="stack" novalidate>
      <div class="field"><label for="v-n">Nome</label><input class="input" id="v-n" maxlength="60" placeholder="Es. Sessione individuale" required></div>
      <div class="btns"><div class="field"><label for="v-d">Durata</label><select class="input" id="v-d">${[1, 2, 3, 4, 5, 6, 8].map(h => `<option value="${h * 60}">${h} ${h === 1 ? 'ora' : 'ore'}</option>`).join('')}</select></div>
      <div class="field"><label for="v-p">Prezzo (€)</label><input class="input" id="v-p" type="number" inputmode="decimal" min="0" max="99999" step="1" required></div></div>
      <p class="form-err" id="v-err" role="alert"></p><button class="btn primary" type="submit">Aggiungi al listino</button></form>`, w => {
      w.querySelector('#f-sv').onsubmit = async e => {
        e.preventDefault();
        const name = w.querySelector('#v-n').value.trim(), price = Number(w.querySelector('#v-p').value), dur = Number(w.querySelector('#v-d').value);
        if (name.length < 2) { w.querySelector('#v-err').textContent = 'Il nome deve avere almeno 2 caratteri.'; return; }
        if (!(price >= 0) || w.querySelector('#v-p').value === '') { w.querySelector('#v-err').textContent = 'Inserisci il prezzo.'; return; }
        await azione(() => D.addService({ name, duration_min: dur, price }), 'Servizio aggiunto');
      };
    });
  }

  function sheetZona() {
    G.sheet('Nuova zona', `<form id="f-z" class="stack" novalidate>
      <div class="field"><label for="z-n">Quartiere o comune</label><input class="input" id="z-n" maxlength="40" placeholder="Es. Vomero, Marano di Napoli" required></div>
      <p class="small muted">Scrivila come appare negli annunci di ChairShare, così le richieste si abbinano alla sede giusta.</p>
      <button class="btn primary" type="submit">Aggiungi</button></form>`, w => {
      w.querySelector('#f-z').onsubmit = async e => {
        e.preventDefault();
        const z = w.querySelector('#z-n').value.trim().replace(/\s+/g, ' ');
        if (z.length < 2) return;
        if (S.profile.work_zones.some(x => x.toLowerCase() === z.toLowerCase())) { G.chiudiSheet(); return; }
        await azione(() => D.setZones([...S.profile.work_zones, z]), 'Zona aggiunta');
      };
    });
  }

  function sheetQR() {
    G.sheet('Il tuo QR code', `<div class="qr" id="qr-box" role="img" aria-label="QR code del tuo link"></div>
      <p class="small muted center">I clienti lo inquadrano con la fotocamera e arrivano alla tua pagina.</p>`);
    disegnaQR(document.getElementById('qr-box'), linkPersonale());
  }
  function montaQR() { /* il QR si genera solo quando lo si apre */ }
  function disegnaQR(box, testo) {
    const fai = () => { const q = window.qrcode(0, 'M'); q.addData(testo); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); };
    if (window.qrcode) return fai();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    s.onload = fai; s.onerror = () => { box.innerHTML = '<p class="small muted">QR non disponibile offline.</p>'; };
    document.head.appendChild(s);
  }

  async function condividi() {
    if (!S.profile.slug) return G.toast('Il link non è ancora attivo.');
    const url = linkPersonale();
    localStorage.setItem('go-condiviso', '1');
    if (navigator.share) { try { await navigator.share({ title: S.profile.full_name, text: 'Prenota con me', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    await copia(url);
  }
  async function copia(t) {
    try { await navigator.clipboard.writeText(t); G.toast('Link copiato'); }
    catch (e) { G.toast(t); }
    localStorage.setItem('go-condiviso', '1');
  }

  async function azione(fn, ok) {
    try { await fn(); G.chiudiSheet(); if (ok) G.toast(ok); await ricarica(); }
    catch (e) { console.error(e); G.toast(G.errore(e)); }
  }

  // ------------------------------------------------------------ eventi
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    switch (a) {
      case 'condividi': e.preventDefault(); condividi(); break;
      case 'copia': copia(linkPersonale()); break;
      case 'wa-share': localStorage.setItem('go-condiviso', '1'); break;
      case 'qr': localStorage.setItem('go-condiviso', '1'); sheetQR(); break;
      case 'app': sheetApp(S.appts.find(x => x.id === el.dataset.id)); break;
      case 'nuovo': sheetNuovo(el.dataset.block, el.dataset.ora); break;
      case 'evento': {
        const ev = S.events.find(x => x.id === el.dataset.id);
        G.sheet(ev.title, `<p class="muted">${esc(G.dataLunga(ev.day))} · ${G.ora(ev.start_time)} – ${G.ora(ev.end_time)}</p><button class="btn" id="ev-rm">Elimina impegno</button>`,
          w => { w.querySelector('#ev-rm').onclick = () => azione(() => D.deleteEvent(ev.id), 'Impegno eliminato'); });
        break;
      }
      case 'giorno': agendaDay = el.dataset.d; render(); break;
      case 'sett': agendaDay = G.addDays(agendaDay, Number(el.dataset.d)); render(); break;
      case 'vai-domani': agendaDay = G.addDays(G.oggi(), 1); break;
      case 'add': sheetAggiungi(); break;
      case 'conferma-rq': {
        const r = S.requests.find(x => x.id === el.dataset.id);
        const b = bloccoDi(r.day).find(x => r.zones.some(z => z.toLowerCase() === zonaDi(x).toLowerCase())) || bloccoDi(r.day)[0];
        const ore = []; for (let m = G.min(b.start_time); m < G.min(b.end_time); m += 60) ore.push(G.hhmm(m));
        const pref = ore.find(o => (r.slot === 'mattina' ? G.min(o) < 13 * 60 : G.min(o) >= 14 * 60)) || ore[0];
        sheetNuovo(b.id, pref, r); break;
      }
      case 'rifiuta-rq': {
        const r = S.requests.find(x => x.id === el.dataset.id);
        G.sheet('Rifiuta richiesta', `<p>Vuoi rifiutare la richiesta di <strong>${esc(r.client_name)}</strong>? Puoi avvisarlo su WhatsApp.</p>
          <a class="btn" href="${esc(G.waLink(r.client_phone, `Ciao ${r.client_name.split(' ')[0]}, purtroppo ${G.dataLunga(r.day).toLowerCase()} non riesco. Ti va un altro giorno? Ecco le mie date: ${linkPersonale()}`))}" target="_blank" rel="noopener">Proponi un'altra data su WhatsApp</a>
          <button class="btn primary" id="rq-no">Rifiuta</button>`, w => { w.querySelector('#rq-no').onclick = () => azione(() => D.declineRequest(r.id), 'Richiesta rifiutata'); });
        break;
      }
      case 'add-serv': sheetServizio(); break;
      case 'rm-serv': {
        const s = S.services.find(x => x.id === el.dataset.id);
        G.sheet('Eliminare il servizio?', `<p>${esc(s.name)} non sarà più prenotabile. Gli appuntamenti già presi restano.</p><button class="btn primary" id="sv-rm">Elimina</button>`,
          w => { w.querySelector('#sv-rm').onclick = () => azione(() => D.deleteService(s.id), 'Servizio eliminato'); });
        break;
      }
      case 'add-zona': sheetZona(); break;
      case 'rm-zona': { const z = S.profile.work_zones.filter((_, i) => i !== Number(el.dataset.i)); azione(() => D.setZones(z), 'Zona rimossa'); break; }
      case 'installa': G.installa().then(() => render()); break;
      case 'esci': D.logout().then(() => { S = null; vistaLogin(); }); break;
    }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'pv') {
      const h = Number(e.target.value);
      azione(() => D.setNotice(h), 'Preavviso: ' + G.testoPreavviso(h).toLowerCase());
    }
  });
  root.addEventListener('input', e => {
    if (e.target.id === 'cerca') {
      filtroClienti = e.target.value;
      const pos = e.target.selectionStart; render();
      const c = document.getElementById('cerca'); c.focus(); c.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener('go:installabile', () => { if (S && (tab() === 'oggi' || tab() === 'profilo')) render(); });

  G.registraSW();
  avvio();
})();
