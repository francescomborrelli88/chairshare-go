// Accesso ai dati per l'app del freelance.
// Due versioni con gli stessi metodi: Supabase (reale) e Demo (dati di esempio, per presentazioni).
(function () {
  const G = window.GO, C = window.GO_CONFIG;

  // ---------------------------------------------------------------- Supabase
  function creaSupa() {
    if (!window.supabase) throw new Error('Libreria Supabase non caricata');
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    let uid = null;
    const ok = r => { if (r.error) throw r.error; return r.data; };

    return {
      demo: false,
      sb,
      async session() { const { data } = await sb.auth.getSession(); uid = data.session ? data.session.user.id : null; return data.session; },
      onAuth(fn) { sb.auth.onAuthStateChange((_e, s) => { uid = s ? s.user.id : null; fn(s); }); },
      async login(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async magicLink(email) {
        ok(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + '/' } }));
      },
      async logout() { await sb.auth.signOut(); },

      async load() {
        const today = G.oggi();
        const from = G.addDays(today, -60), to = G.addDays(today, 90);
        const st = { features: { zones: true, requests: true, events: true } };

        st.profile = ok(await sb.from('profiles').select('*').eq('id', uid).single());
        if (st.profile.role === 'guest' && !st.profile.slug) {
          try { st.profile.slug = ok(await sb.rpc('ensure_my_slug')); } catch (e) { /* il link resterà da creare */ }
        }
        if (!Array.isArray(st.profile.work_zones)) { st.features.zones = false; st.profile.work_zones = []; }

        const [serv, blocks, appts] = await Promise.all([
          sb.from('freelance_services').select('*').eq('user_id', uid).order('created_at'),
          sb.from('chair_blocks').select('*, spaces(name, city, zone, type)').eq('user_id', uid)
            .gte('day', from).lte('day', to).order('day').order('start_time'),
          sb.from('client_appointments').select('*').eq('freelance_id', uid)
            .gte('day', from).order('day').order('start_time')
        ]);
        st.services = ok(serv); st.blocks = ok(blocks); st.appts = ok(appts);

        const rq = await sb.from('appointment_requests').select('*').eq('freelance_id', uid)
          .gte('day', today).order('day');
        if (rq.error) { if (G.mancaNelDb(rq.error)) { st.features.requests = false; st.requests = []; } else throw rq.error; }
        else st.requests = rq.data;

        const ev = await sb.from('personal_events').select('*').eq('user_id', uid)
          .gte('day', from).lte('day', to).order('day').order('start_time');
        if (ev.error) { if (G.mancaNelDb(ev.error)) { st.features.events = false; st.events = []; } else throw ev.error; }
        else st.events = ev.data;

        if (st.profile.slug) {
          let pg = await sb.rpc('get_booking_page_by_slug', { p_slug: st.profile.slug });
          st.rating = pg.data ? { avg: pg.data.rating, count: pg.data.reviews_count } : null;
        }
        return st;
      },

      async addService(s) {
        return ok(await sb.from('freelance_services').insert({ name: s.name, duration_min: s.duration_min, price: s.price }).select().single());
      },
      async deleteService(id) { ok(await sb.from('freelance_services').delete().eq('id', id)); },
      async setZones(zones) { ok(await sb.from('profiles').update({ work_zones: zones }).eq('id', uid)); },
      async updateAppt(id, patch) { return ok(await sb.from('client_appointments').update(patch).eq('id', id).select().single()); },
      async addAppt(blockId, serviceId, start, name, phone) {
        const args = { p_block: blockId, p_service: serviceId, p_start: start, p_name: name, p_phone: phone };
        let r = await sb.rpc('go_book', args);
        if (r.error && G.mancaNelDb(r.error)) r = await sb.rpc('book_appointment', args);
        return ok(r);
      },
      async addEvent(e) { return ok(await sb.from('personal_events').insert(e).select().single()); },
      async deleteEvent(id) { ok(await sb.from('personal_events').delete().eq('id', id)); },
      async declineRequest(id) { ok(await sb.from('appointment_requests').update({ status: 'declined' }).eq('id', id)); },
      async confirmRequest(id, blockId, start) {
        return ok(await sb.rpc('go_confirm_request', { p_request: id, p_block: blockId, p_start: start }));
      }
    };
  }

  // ---------------------------------------------------------------- Demo
  function creaDemo() {
    const t = G.oggi();
    const d = n => G.addDays(t, n);
    let n = 0; const id = () => 'demo-' + (++n);
    const sp = (name, zone) => ({ name, city: 'Napoli', zone, type: 'psicoterapia' });
    const s1 = { id: id(), name: 'Sessione individuale', duration_min: 60, price: 60 };
    const s2 = { id: id(), name: 'Percorso intensivo', duration_min: 120, price: 110 };
    const b1 = { id: id(), day: t, start_time: '09:00', end_time: '13:00', spaces: sp('Studio Privato Chiaia', 'Vomero') };
    const b2 = { id: id(), day: d(2), start_time: '09:00', end_time: '17:00', spaces: sp('Studio Benessere Marano', 'Marano di Napoli') };
    const b3 = { id: id(), day: d(7), start_time: '14:00', end_time: '19:00', spaces: sp('Studio Privato Chiaia', 'Vomero') };
    const ap = (block, day, start, nome, tel, sv, status = 'confirmed') => ({
      id: id(), block_id: block, day, start_time: start, end_time: G.hhmm(G.min(start) + sv.duration_min),
      client_name: nome, client_phone: tel, service_id: sv.id, service_name: sv.name, service_duration: sv.duration_min,
      service_price: sv.price, status
    });
    const st = {
      features: { zones: true, requests: true, events: true },
      profile: { id: 'demo', full_name: 'Luca Ferri', role: 'guest', slug: 'demo', phone: '3330000000', work_zones: ['Vomero', 'Marano di Napoli'] },
      services: [s1, s2],
      blocks: [b1, b2, b3],
      appts: [
        ap(null, d(-30), '10:00', 'Davide Serra', '3331112233', s1, 'completed'),
        ap(null, d(-10), '11:00', 'Chiara Longo', '3332223344', s1, 'completed'),
        ap(null, d(-1), '16:00', 'Paolo Russo', '3334445566', s1, 'completed'),
        ap(b1.id, t, '10:00', 'Anna Martini', '3335556677', s1),
        ap(b1.id, t, '12:00', 'Paolo Russo', '3334445566', s1),
        ap(b2.id, d(2), '09:00', 'Chiara Longo', '3332223344', s1),
        ap(b2.id, d(2), '15:00', 'Anna Martini', '3335556677', s2)
      ],
      events: [{ id: id(), day: t, start_time: '15:00', end_time: '16:00', title: 'Commercialista' }],
      requests: [
        rq(d(3), 'mattina', ['Marano di Napoli'], 'Marta Bianchi', '3336667788', s1, 41),
        rq(d(3), 'pomeriggio', ['Marano di Napoli', 'Vomero'], 'Giorgio Conte', '3337778899', s1, 41),
        rq(d(3), 'mattina', ['Vomero'], 'Elena Parisi', '3338889900', s2, 40),
        rq(d(5), 'pomeriggio', ['Vomero'], 'Sara Galli', '3339990011', s1, 46)
      ],
      rating: { avg: 4.9, count: 12 }
    };
    function rq(day, slot, zones, nome, tel, sv, ore) {
      return { id: id(), day, slot, zones, client_name: nome, client_phone: tel, service_id: sv.id, service_name: sv.name,
        service_duration: sv.duration_min, service_price: sv.price, status: 'pending',
        expires_at: new Date(Date.now() + ore * 3600e3).toISOString() };
    }
    const pausa = () => new Promise(r => setTimeout(r, 150));
    return {
      demo: true,
      async session() { return { user: { id: 'demo' } }; },
      onAuth() {},
      async login() {}, async magicLink() {}, async logout() { location.href = '/'; },
      async load() { await pausa(); return JSON.parse(JSON.stringify(st)); },
      async addService(s) { const x = { id: id(), ...s }; st.services.push(x); return x; },
      async deleteService(i) { st.services = st.services.filter(s => s.id !== i); },
      async setZones(z) { st.profile.work_zones = z; },
      async updateAppt(i, p) { const a = st.appts.find(x => x.id === i); Object.assign(a, p); return a; },
      async addAppt(blockId, serviceId, start, name, phone) {
        const b = st.blocks.find(x => x.id === blockId); const sv = st.services.find(x => x.id === serviceId);
        const fine = G.min(start) + sv.duration_min;
        if (G.min(start) < G.min(b.start_time) || fine > G.min(b.end_time)) throw new Error('FUORI_FASCIA');
        if (st.appts.some(a => a.day === b.day && a.status !== 'cancelled' && G.min(start) < G.min(a.end_time) && fine > G.min(a.start_time))) throw new Error('SLOT_OCCUPATO');
        const a = ap(b.id, b.day, start, name, phone, sv); st.appts.push(a); return a;
      },
      async addEvent(e) { const x = { id: id(), ...e }; st.events.push(x); return x; },
      async deleteEvent(i) { st.events = st.events.filter(e => e.id !== i); },
      async declineRequest(i) { st.requests.find(r => r.id === i).status = 'declined'; },
      async confirmRequest(i, blockId, start) {
        const r = st.requests.find(x => x.id === i);
        const a = await this.addAppt(blockId, r.service_id, start, r.client_name, r.client_phone);
        r.status = 'confirmed'; r.appointment_id = a.id; return a;
      }
    };
  }

  window.GO_DATA = { creaSupa, creaDemo };
})();
