-- =====================================================================
-- ChairShare Go · script 001
-- Aggiunge: zone di lavoro, impegni personali, richieste per i giorni
-- senza sede e le funzioni usate dall'app. NON modifica tabelle o
-- funzioni già usate dal sito (book_appointment, get_booking_page...).
-- Si può rieseguire: usa IF NOT EXISTS / CREATE OR REPLACE.
-- =====================================================================

-- 1. Zone di lavoro del freelance (es. {"Vomero","Marano di Napoli"})
alter table public.profiles
  add column if not exists work_zones text[] not null default '{}';

do $$ begin
  alter table public.profiles add constraint profiles_work_zones_max
    check (coalesce(array_length(work_zones, 1), 0) <= 6);
exception when duplicate_object then null; end $$;

-- 2. Impegni personali (grigi in agenda, visibili solo al freelance)
create table if not exists public.personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time not null,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists personal_events_user_day on public.personal_events (user_id, day);
alter table public.personal_events enable row level security;

drop policy if exists pe_all_own on public.personal_events;
create policy pe_all_own on public.personal_events
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Richieste dei clienti per i giorni in cui il freelance non ha sede
create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  freelance_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid references public.freelance_services(id) on delete set null,
  service_name text not null,
  service_duration integer not null,
  service_price numeric not null,
  day date not null,
  slot text not null check (slot in ('mattina', 'pomeriggio')),
  zones text[] not null check (coalesce(array_length(zones, 1), 0) between 1 and 6),
  client_name text not null check (char_length(btrim(client_name)) between 2 and 80),
  client_phone text not null check (char_length(client_phone) between 6 and 20),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'withdrawn')),
  appointment_id uuid references public.client_appointments(id) on delete set null,
  manage_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours'
);
create index if not exists ar_freelance_day on public.appointment_requests (freelance_id, day);
alter table public.appointment_requests enable row level security;

drop policy if exists ar_select_own on public.appointment_requests;
create policy ar_select_own on public.appointment_requests
  for select to authenticated using (freelance_id = auth.uid());

drop policy if exists ar_update_own on public.appointment_requests;
create policy ar_update_own on public.appointment_requests
  for update to authenticated
  using (freelance_id = auth.uid()) with check (freelance_id = auth.uid());
-- nessuna policy di INSERT: i clienti creano richieste solo tramite go_create_request

-- 4. Pagina pubblica per l'app: quella del sito + zone e zona di ogni blocco
create or replace function public.go_get_page(p_slug text)
returns json
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  pid uuid;
  zone text[];
  base jsonb;
begin
  select id, work_zones into pid, zone from public.profiles
   where slug = lower(btrim(p_slug)) and role = 'guest';
  if pid is null then return null; end if;
  base := public.get_booking_page(pid)::jsonb;
  return (base || jsonb_build_object(
    'slug', lower(btrim(p_slug)),
    'zones', to_jsonb(coalesce(zone, '{}')),
    'block_zones', coalesce((
      select jsonb_object_agg(b.id, coalesce(nullif(btrim(sp.zone), ''), sp.city))
        from public.chair_blocks b join public.spaces sp on sp.id = b.space_id
       where b.user_id = pid and b.day >= (now() at time zone 'Europe/Rome')::date), '{}'::jsonb)
  ))::json;
end;
$$;

-- 5. Prenotazione dall'app: usa book_appointment del sito e aggiunge l'indirizzo
create or replace function public.go_book(p_block uuid, p_service uuid, p_start time,
                                          p_name text, p_phone text)
returns json
language plpgsql security definer
set search_path to 'public'
as $$
declare
  res jsonb;
  indirizzo text;
  note text;
  zona text;
begin
  res := public.book_appointment(p_block, p_service, p_start, p_name, p_phone)::jsonb;
  select c.address, c.access_notes, coalesce(nullif(btrim(sp.zone), ''), sp.city)
    into indirizzo, note, zona
    from public.chair_blocks b
    join public.spaces sp on sp.id = b.space_id
    left join public.space_contacts c on c.space_id = b.space_id
   where b.id = p_block;
  return (res || jsonb_build_object('address', indirizzo, 'access_notes', note, 'zone', zona))::json;
end;
$$;

-- 6. Richiesta del cliente per un giorno senza sede
create or replace function public.go_create_request(p_slug text, p_service uuid, p_day date,
                                                    p_slot text, p_zones text[],
                                                    p_name text, p_phone text)
returns json
language plpgsql security definer
set search_path to 'public'
as $$
declare
  pid uuid;
  zone_ok text[];
  sv public.freelance_services%rowtype;
  oggi date := (now() at time zone 'Europe/Rome')::date;
  nome text := btrim(coalesce(p_name, ''));
  tel text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  scelte text[];
  r public.appointment_requests%rowtype;
begin
  select id, work_zones into pid, zone_ok from public.profiles
   where slug = lower(btrim(p_slug)) and role = 'guest';
  if pid is null then raise exception 'PROFESSIONISTA_NON_TROVATO' using errcode = 'P0001'; end if;
  if char_length(nome) < 2 or char_length(nome) > 80 or char_length(tel) < 6 or char_length(tel) > 20 then
    raise exception 'DATI_NON_VALIDI' using errcode = 'P0001';
  end if;
  if p_slot not in ('mattina', 'pomeriggio') then raise exception 'FASCIA_NON_VALIDA' using errcode = 'P0001'; end if;
  if p_day is null or p_day <= oggi or p_day > oggi + 60 then
    raise exception 'DATA_NON_VALIDA' using errcode = 'P0001';
  end if;
  -- solo zone dichiarate dal freelance
  select array_agg(z) into scelte from unnest(p_zones) z where z = any(zone_ok);
  if coalesce(array_length(scelte, 1), 0) = 0 then raise exception 'ZONA_NON_VALIDA' using errcode = 'P0001'; end if;
  select * into sv from public.freelance_services where id = p_service and user_id = pid;
  if not found then raise exception 'SERVIZIO_NON_TROVATO' using errcode = 'P0001'; end if;
  -- anti-spam: max 3 richieste aperte per numero, 30 al giorno per freelance
  if (select count(*) from public.appointment_requests
       where client_phone = tel and status = 'pending' and expires_at > now()) >= 3
     or (select count(*) from public.appointment_requests
       where freelance_id = pid and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'TROPPE_RICHIESTE' using errcode = 'P0001';
  end if;
  insert into public.appointment_requests (freelance_id, service_id, service_name, service_duration,
                                           service_price, day, slot, zones, client_name, client_phone)
  values (pid, sv.id, sv.name, sv.duration_min, sv.price, p_day, p_slot, scelte, nome, tel)
  returning * into r;
  -- minimizzazione dati: richieste chiuse da oltre 30 giorni vengono cancellate
  delete from public.appointment_requests where day < oggi - 30;
  return json_build_object('id', r.id, 'token', r.manage_token, 'day', r.day, 'zones', r.zones);
end;
$$;

-- 7. Il cliente ritira la propria richiesta (link con token)
create or replace function public.go_withdraw_request(p_token uuid)
returns boolean
language sql security definer
set search_path to 'public'
as $$
  update public.appointment_requests set status = 'withdrawn'
   where manage_token = p_token and status = 'pending'
  returning true;
$$;

-- 8. Il freelance conferma una richiesta su un suo blocco (sceglie l'orario)
create or replace function public.go_confirm_request(p_request uuid, p_block uuid, p_start time)
returns json
language plpgsql security definer
set search_path to 'public'
as $$
declare
  r public.appointment_requests%rowtype;
  res jsonb;
begin
  select * into r from public.appointment_requests
   where id = p_request and freelance_id = auth.uid() for update;
  if not found then raise exception 'NON_AUTORIZZATO' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'RICHIESTA_CHIUSA' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.chair_blocks where id = p_block and user_id = auth.uid() and day = r.day) then
    raise exception 'BLOCCO_NON_VALIDO' using errcode = 'P0001';
  end if;
  res := public.go_book(p_block, r.service_id, p_start, r.client_name, r.client_phone)::jsonb;
  update public.appointment_requests
     set status = 'confirmed', appointment_id = (res->>'id')::uuid
   where id = r.id;
  return res::json;
end;
$$;

-- Permessi
revoke all on function public.go_get_page(text) from public;
revoke all on function public.go_book(uuid, uuid, time, text, text) from public;
revoke all on function public.go_create_request(text, uuid, date, text, text[], text, text) from public;
revoke all on function public.go_withdraw_request(uuid) from public;
revoke all on function public.go_confirm_request(uuid, uuid, time) from public;
grant execute on function public.go_get_page(text) to anon, authenticated;
grant execute on function public.go_book(uuid, uuid, time, text, text) to anon, authenticated;
grant execute on function public.go_create_request(text, uuid, date, text, text[], text, text) to anon, authenticated;
grant execute on function public.go_withdraw_request(uuid) to anon, authenticated;
grant execute on function public.go_confirm_request(uuid, uuid, time) to authenticated;

-- 001b: la conferma delle richieste è solo per utenti con accesso
revoke execute on function public.go_confirm_request(uuid, uuid, time) from anon;

-- =====================================================================
-- 002 (16/11): zone modificabili dal freelance + preavviso "entro il giorno prima"
-- =====================================================================
grant update (work_zones) on public.profiles to authenticated;

create or replace function public.go_book(p_block uuid, p_service uuid, p_start time, p_name text, p_phone text)
returns json language plpgsql security definer set search_path to 'public' as $f$
declare res jsonb; indirizzo text; note text; zona text; giorno date; titolare uuid;
begin
  select day, user_id into giorno, titolare from public.chair_blocks where id = p_block;
  if not found then raise exception 'SLOT_NON_DISPONIBILE' using errcode = 'P0001'; end if;
  -- i clienti prenotano entro il giorno prima; il freelance può sempre aggiungere a mano
  if auth.uid() is distinct from titolare and giorno <= (now() at time zone 'Europe/Rome')::date then
    raise exception 'PREAVVISO_GIORNO_PRIMA' using errcode = 'P0001';
  end if;
  res := public.book_appointment(p_block, p_service, p_start, p_name, p_phone)::jsonb;
  select c.address, c.access_notes, coalesce(nullif(btrim(sp.zone), ''), sp.city) into indirizzo, note, zona
    from public.chair_blocks b join public.spaces sp on sp.id = b.space_id
    left join public.space_contacts c on c.space_id = b.space_id where b.id = p_block;
  return (res || jsonb_build_object('address', indirizzo, 'access_notes', note, 'zone', zona))::json;
end; $f$;

-- =====================================================================
-- 003 (16/11): preavviso scelto dal freelance (0 = giorno prima, 12, 6, 3 ore; minimo 3)
-- Eseguito su Supabase come migrazione "chairshare_go_003_preavviso_scelto":
-- colonna profiles.booking_notice_hours, go_book con controllo del preavviso,
-- go_get_page che restituisce notice_hours.
-- =====================================================================

-- =====================================================================
-- 004-005 (16/11): email al freelance per nuove prenotazioni e richieste
-- Eseguito su Supabase: estensione pg_net, tabella go_notifications,
-- funzione trigger go_notify() + trigger go_notify_appointment / go_notify_request.
-- La funzione Edge che spedisce l'email è in supabase/functions/go-notify/index.ts
-- e richiede il segreto RESEND_API_KEY (Edge Functions → Secrets).
-- Per disattivare:  drop trigger go_notify_appointment on public.client_appointments;
--                   drop trigger go_notify_request on public.appointment_requests;
-- =====================================================================
