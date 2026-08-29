-- 120 Pokébälle — vollständiges Datenbankschema
-- Einmal komplett im Supabase SQL-Editor ausführen (Projekt-Dashboard -> SQL Editor -> New query).
-- Voraussetzung: unter Authentication -> Providers -> "Anonymous Sign-Ins" aktivieren.

create extension if not exists pgcrypto;

-- =========================================================================
-- 1. TABELLEN
-- =========================================================================

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null,
  host_display_name text,
  obs_token text not null default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'setup' check (status in ('setup', 'drafting', 'finished')),
  current_turn_seat int check (current_turn_seat in (1, 2)),
  overlay_mode boolean not null default false,
  -- Joker-Konfiguration (Chance/Obergrenzen/Gewichtung je Art), vom Host vor Spielstart gesetzt.
  -- Ueberlebt reset_draft, wie der Content-Pool auch.
  joker_config jsonb not null default '{
    "chancePercent": 15,
    "maxTotal": null,
    "types": {
      "veto": { "enabled": true, "weight": 1, "maxCount": null },
      "wondertrade": { "enabled": true, "weight": 1, "maxCount": null },
      "wechsel": { "enabled": true, "weight": 1, "maxCount": null }
    }
  }'::jsonb,
  -- Beim Pool-Setup gewaehlte Pokemon-Filter, fuer Wondertrade-Rerolls waehrend des Drafts (siehe
  -- use_wondertrade_joker weiter unten).
  pokemon_filters jsonb,
  created_at timestamptz not null default now()
);

create table public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat int not null check (seat in (1, 2)),
  user_id uuid,
  display_name text,
  locked boolean not null default false,
  locked_at timestamptz,
  unique (room_id, seat)
);

create table public.room_obs_viewers (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.content_pool (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  category text not null check (category in ('pokemon', 'item', 'wesen', 'faehigkeit', 'attacke')),
  value text not null
);

create table public.balls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  number int not null check (number > 0),
  category text not null check (category in ('pokemon', 'item', 'wesen', 'faehigkeit', 'attacke')),
  opened boolean not null default false,
  opened_by_seat int check (opened_by_seat in (1, 2)),
  opened_at timestamptz,
  placed_field int check (placed_field between 1 and 4),
  placed_slot_type text check (placed_slot_type in ('pokemon', 'item', 'wesen', 'faehigkeit', 'attacke')),
  placed_slot_ordinal int,
  -- Veto-Joker: Ball wurde geoeffnet, aber bewusst NICHT platziert (statt geschlossen zu bleiben
  -- oder platziert werden zu muessen).
  discarded boolean not null default false,
  discarded_at timestamptz,
  unique (room_id, number)
);

-- Geheimer Teil: enthaelt die tatsaechlichen Werte. Getrennt von "balls", damit die
-- RLS-Policy (siehe unten) nur DIESE Tabelle je nach Betrachter unterschiedlich filtern muss.
create table public.ball_contents (
  ball_id uuid primary key references public.balls(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  value text not null,
  -- Optionaler Zusatz-Joker, der zusaetzlich zum Standardinhalt in diesem Ball steckt. Wie der
  -- Wert selbst erst nach dem Oeffnen sichtbar (gleiche "reveal rule"-Policy unten).
  joker_type text check (joker_type in ('veto', 'wondertrade', 'wechsel'))
);

-- Joker-Inventar je Teilnehmer: einzelne Zeilen (nicht nur ein Zaehler), damit sich einzelne
-- Vergaben/Verbrauche fuer Undo nachvollziehen lassen. Bewusst OEFFENTLICH lesbar (jeder soll
-- sehen, wer welchen Joker hat), unabhaengig davon, ob der zugrundeliegende Ball-Wert fuer den
-- Gegner ueberhaupt sichtbar ist.
create table public.player_jokers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat int not null check (seat in (1, 2)),
  joker_type text not null check (joker_type in ('veto', 'wondertrade', 'wechsel')),
  source_ball_id uuid references public.balls(id) on delete set null,
  granted_at timestamptz not null default now(),
  used boolean not null default false,
  used_at timestamptz,
  used_detail jsonb
);

create table public.team_slots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat int not null check (seat in (1, 2)),
  field_index int not null check (field_index between 1 and 4),
  slot_type text not null check (slot_type in ('pokemon', 'item', 'wesen', 'faehigkeit', 'attacke')),
  slot_ordinal int not null default 1,
  filled_ball_id uuid references public.balls(id),
  unique (room_id, seat, field_index, slot_type, slot_ordinal)
);

create table public.draft_log (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat int not null,
  ball_id uuid not null,
  -- field_index/slot_type/slot_ordinal sind bei einem Veto-Log-Eintrag (siehe action_type) leer,
  -- da kein Slot involviert ist.
  field_index int,
  slot_type text,
  slot_ordinal int,
  overwritten_ball_id uuid,
  action_type text not null default 'place' check (action_type in ('place', 'veto')),
  joker_id uuid references public.player_jokers(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 2. HELFERFUNKTIONEN (SECURITY DEFINER, um rekursive RLS-Lookups zu vermeiden)
-- =========================================================================

create or replace function public.is_host(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms where id = p_room_id and host_user_id = auth.uid());
$$;

create or replace function public.is_obs_viewer(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from room_obs_viewers where room_id = p_room_id and user_id = auth.uid()
  );
$$;

create or replace function public.my_seat(p_room_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select seat from room_participants where room_id = p_room_id and user_id = auth.uid();
$$;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_host(p_room_id)
    or public.is_obs_viewer(p_room_id)
    or exists (select 1 from room_participants where room_id = p_room_id and user_id = auth.uid());
$$;

-- =========================================================================
-- 3. ROW LEVEL SECURITY
-- =========================================================================

alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.room_obs_viewers enable row level security;
alter table public.content_pool enable row level security;
alter table public.balls enable row level security;
alter table public.ball_contents enable row level security;
alter table public.player_jokers enable row level security;
alter table public.team_slots enable row level security;
alter table public.draft_log enable row level security;

create policy "room members can read room" on public.rooms
  for select using (public.is_room_member(id));

create policy "room members can read participants" on public.room_participants
  for select using (public.is_room_member(room_id));

create policy "room members can read obs viewers" on public.room_obs_viewers
  for select using (public.is_room_member(room_id));

create policy "host can read content pool" on public.content_pool
  for select using (public.is_host(room_id));

create policy "room members can read balls" on public.balls
  for select using (public.is_room_member(room_id));

-- Das Kernstueck: NIEMAND sieht den Wert eines noch nicht geoeffneten Balls (auch nicht
-- Host/OBS). Erst nach dem Oeffnen greift die Sichtbarkeits-Ausnahme: Host/OBS-Betrachter,
-- oder wer den Ball selbst geoeffnet hat, oder Pokemon-Inhalte (nach Oeffnen immer oeffentlich).
create policy "reveal rule" on public.ball_contents
  for select using (
    exists (
      select 1 from balls b
      where b.id = ball_contents.ball_id
        and b.opened = true
        and (
          public.is_host(room_id)
          or public.is_obs_viewer(room_id)
          or b.category = 'pokemon'
          or b.opened_by_seat = public.my_seat(room_id)
        )
    )
  );

create policy "room members can read player jokers" on public.player_jokers
  for select using (public.is_room_member(room_id));

create policy "room members can read team slots" on public.team_slots
  for select using (public.is_room_member(room_id));

create policy "room members can read draft log" on public.draft_log
  for select using (public.is_room_member(room_id));

-- Keine INSERT/UPDATE/DELETE-Policies fuer normale Rollen auf irgendeiner Tabelle:
-- alle Schreibzugriffe laufen ausschliesslich ueber die SECURITY DEFINER RPCs unten,
-- die als Tabellenbesitzer laufen und RLS damit bewusst umgehen (kontrolliert, mit
-- eigener serverseitiger Validierung).

-- Grants: RLS schuetzt Zeilen, aber ohne GRANT SELECT gibt es ueberhaupt keinen Zugriff.
grant select on public.rooms, public.room_participants, public.room_obs_viewers,
  public.content_pool, public.balls, public.ball_contents, public.player_jokers, public.team_slots,
  public.draft_log
  to authenticated;

-- =========================================================================
-- 4. RPC-FUNKTIONEN (serverseitige Spiellogik)
-- =========================================================================

create or replace function public.generate_room_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- ohne 0/O/1/I zur besseren Lesbarkeit
  result text;
  i int;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from rooms where code = result);
  end loop;
  return result;
end;
$$;

-- Erstellt einen leeren Raum sofort (ohne Pool) — der Host landet direkt auf dem Hauptbildschirm
-- (Cams/Baelle/Teams-Layout) und traegt den Pool von dort aus ueber set_content_pool() ein,
-- statt vorher eine separate Eingabemaske ausfuellen zu muessen.
create or replace function public.create_room()
returns public.rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  insert into rooms (code, host_user_id) values (public.generate_room_code(), auth.uid())
    returning * into v_room;

  insert into room_participants (room_id, seat) values (v_room.id, 1), (v_room.id, 2);

  return v_room;
end;
$$;

-- Speichert die Joker-Konfiguration eines Raums (Host-only, nur waehrend 'setup').
create or replace function public.set_joker_config(p_room_id uuid, p_config jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_chance numeric;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.host_user_id <> auth.uid() then
    raise exception 'Nur der Host kann die Joker-Konfiguration aendern';
  end if;
  if v_room.status <> 'setup' then
    raise exception 'Die Joker-Konfiguration kann nach Spielstart nicht mehr geaendert werden';
  end if;

  v_chance := (p_config->>'chancePercent')::numeric;
  if v_chance is null or v_chance < 0 or v_chance > 100 then
    raise exception 'Ungueltige Joker-Chance';
  end if;

  update rooms set joker_config = p_config where id = p_room_id;
end;
$$;

-- Setzt/ersetzt den Pool eines Raums (Groesse vom Host frei konfiguriert), solange dieser noch im
-- Setup ist. Kann beliebig oft aufgerufen werden (z.B. waehrend der Host noch tippt und die
-- Teilnehmer schon warten). Speichert zusaetzlich die aktuellen Pokemon-Filter (fuer spaetere
-- Wondertrade-Reroll-Vorschlaege waehrend des Drafts).
create or replace function public.set_content_pool(p_room_id uuid, p_pool jsonb, p_pokemon_filters jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_count_pokemon int;
  v_count_item int;
  v_count_wesen int;
  v_count_faehigkeit int;
  v_count_attacke int;
  v_total int;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.host_user_id <> auth.uid() then
    raise exception 'Nur der Host kann den Pool bearbeiten';
  end if;
  if v_room.status <> 'setup' then
    raise exception 'Der Pool kann nach Spielstart nicht mehr geaendert werden';
  end if;

  select count(*) filter (where value->>'category' = 'pokemon'),
         count(*) filter (where value->>'category' = 'item'),
         count(*) filter (where value->>'category' = 'wesen'),
         count(*) filter (where value->>'category' = 'faehigkeit'),
         count(*) filter (where value->>'category' = 'attacke'),
         count(*)
    into v_count_pokemon, v_count_item, v_count_wesen, v_count_faehigkeit, v_count_attacke, v_total
    from jsonb_array_elements(p_pool) as value;

  -- Keine fixen 120/20/15/15/15/55 mehr: Host konfiguriert Gesamtzahl und Verteilung frei. Die
  -- Minima 8/8/8/8/32 ergeben sich aus dem unveraenderten Team-Slot-Layout (2 Sitze x 4 Felder x
  -- je 1 Pokemon/Wesen/Faehigkeit/Item + 4 Attacke) -- ohne sie waeren manche Slots nie befuellbar.
  if v_total < 1 or v_total <> (v_count_pokemon + v_count_item + v_count_wesen + v_count_faehigkeit + v_count_attacke) then
    raise exception 'Ungueltiger Pool';
  end if;
  if v_count_pokemon < 8 or v_count_wesen < 8 or v_count_faehigkeit < 8 or v_count_item < 8 then
    raise exception 'Mindestens 8 Eintraege pro Kategorie (Pokemon/Wesen/Faehigkeit/Item) noetig, um alle Team-Slots befuellen zu koennen (erhalten: Pokemon %, Wesen %, Faehigkeit %, Item %)',
      v_count_pokemon, v_count_wesen, v_count_faehigkeit, v_count_item;
  end if;
  if v_count_attacke < 32 then
    raise exception 'Mindestens 32 Attacken noetig, um alle Team-Slots befuellen zu koennen (erhalten: %)', v_count_attacke;
  end if;

  delete from content_pool where room_id = p_room_id;
  insert into content_pool (room_id, category, value)
    select p_room_id, entry->>'category', entry->>'value'
    from jsonb_array_elements(p_pool) as entry;

  update rooms set pokemon_filters = p_pokemon_filters where id = p_room_id;
end;
$$;

create or replace function public.preview_room(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_result jsonb;
begin
  select * into v_room from rooms where code = upper(p_code);
  if not found then
    raise exception 'Raum mit diesem Code wurde nicht gefunden';
  end if;

  select jsonb_build_object(
    'room_id', v_room.id,
    'code', v_room.code,
    'status', v_room.status,
    'seats', (
      select jsonb_agg(jsonb_build_object(
        'seat', rp.seat,
        'taken', rp.user_id is not null,
        'display_name', rp.display_name,
        'is_me', rp.user_id = auth.uid()
      ) order by rp.seat)
      from room_participants rp where rp.room_id = v_room.id
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.join_room(p_code text, p_seat int, p_display_name text)
returns public.room_participants
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_participant room_participants;
begin
  select * into v_room from rooms where code = upper(p_code);
  if not found then
    raise exception 'Raum mit diesem Code wurde nicht gefunden';
  end if;

  select * into v_participant from room_participants
    where room_id = v_room.id and seat = p_seat for update;

  if not found then
    raise exception 'Ungueltiger Platz';
  end if;

  if v_participant.user_id is null then
    if v_room.status <> 'setup' then
      raise exception 'Das Spiel laeuft bereits, dieser Platz ist nicht mehr frei';
    end if;
    update room_participants
      set user_id = auth.uid(), display_name = coalesce(nullif(trim(p_display_name), ''), 'Teilnehmer ' || p_seat)
      where id = v_participant.id
      returning * into v_participant;
  elsif v_participant.user_id = auth.uid() then
    -- Reconnect: Sitzplatz bereits meiner, ggf. Namen aktualisieren solange Setup-Phase laeuft.
    if v_room.status = 'setup' and p_display_name is not null and trim(p_display_name) <> '' then
      update room_participants set display_name = trim(p_display_name)
        where id = v_participant.id returning * into v_participant;
    end if;
  else
    raise exception 'Dieser Platz ist bereits von jemand anderem belegt';
  end if;

  return v_participant;
end;
$$;

-- Aendert den eigenen Anzeigenamen eines Teilnehmers jederzeit (unabhaengig vom Raum-Status,
-- anders als die eingeschraenkte Umbenennung oben in join_room beim Rejoin waehrend 'setup').
create or replace function public.set_display_name(p_room_id uuid, p_display_name text)
returns public.room_participants
language plpgsql security definer set search_path = public as $$
declare
  v_participant room_participants;
begin
  select * into v_participant from room_participants
    where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Du bist kein Teilnehmer dieses Raums';
  end if;

  update room_participants
    set display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
    where id = v_participant.id
    returning * into v_participant;

  return v_participant;
end;
$$;

-- Aendert den Anzeigenamen des Hosts (host-only).
create or replace function public.set_host_display_name(p_room_id uuid, p_display_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room_id and host_user_id = auth.uid()) then
    raise exception 'Nur der Host kann seinen Namen aendern';
  end if;
  update rooms set host_display_name = nullif(trim(p_display_name), '') where id = p_room_id;
end;
$$;

create or replace function public.start_game(p_room_id uuid, p_starting_seat int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_pool_count int;
  v_seat1_ready boolean;
  v_seat2_ready boolean;
  v_cfg jsonb;
  v_chance numeric;
  v_max_total int;
  v_ball_ids uuid[];
  v_bid uuid;
  v_type_keys text[] := array['veto', 'wondertrade', 'wechsel'];
  v_granted_total int := 0;
  v_granted_by_type jsonb := '{}'::jsonb;
  v_type text;
  v_type_enabled boolean;
  v_type_weight numeric;
  v_type_max int;
  v_type_count int;
  v_eligible text[];
  v_eligible_weights numeric[];
  v_total_weight numeric;
  v_r numeric;
  v_acc numeric;
  v_chosen text;
  i int;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.host_user_id <> auth.uid() then
    raise exception 'Nur der Host kann das Spiel starten';
  end if;
  if v_room.status <> 'setup' then
    raise exception 'Das Spiel wurde bereits gestartet';
  end if;
  if p_starting_seat not in (1, 2) then
    raise exception 'Ungueltiger Startspieler';
  end if;

  select exists(select 1 from room_participants where room_id = p_room_id and seat = 1 and user_id is not null),
         exists(select 1 from room_participants where room_id = p_room_id and seat = 2 and user_id is not null)
    into v_seat1_ready, v_seat2_ready;
  if not (v_seat1_ready and v_seat2_ready) then
    raise exception 'Beide Teilnehmer muessen erst beitreten';
  end if;

  select count(*) into v_pool_count from content_pool where room_id = p_room_id;
  if v_pool_count < 1 then
    raise exception 'Pool ist leer';
  end if;

  -- Zufaellige Zuordnung: Pool-Eintraege serverseitig mischen und auf Baelle 1..N verteilen.
  with shuffled as (
    select id as pool_id, category, value, row_number() over (order by random()) as rn
    from content_pool where room_id = p_room_id
  ), inserted_balls as (
    insert into balls (room_id, number, category)
    select p_room_id, rn, category from shuffled
    returning id, number, category
  )
  insert into ball_contents (ball_id, room_id, value)
  select ib.id, p_room_id, s.value
  from inserted_balls ib join shuffled s on s.rn = ib.number;

  insert into team_slots (room_id, seat, field_index, slot_type, slot_ordinal)
  select p_room_id, seat, field_index, slot_type, ordinal
  from (select generate_series(1, 2) as seat) seats
  cross join (select generate_series(1, 4) as field_index) fields
  cross join (
    values ('pokemon', 1), ('wesen', 1), ('faehigkeit', 1), ('item', 1),
           ('attacke', 1), ('attacke', 2), ('attacke', 3), ('attacke', 4)
  ) as slot_defs(slot_type, ordinal);

  -- Joker-Verteilung: pro Ball (in zufaelliger Reihenfolge) unabhaengig auswuerfeln, ob ueberhaupt
  -- ein Joker dazukommt, und falls ja, gewichtet unter den noch nicht ausgeschoepften Jokerarten.
  v_cfg := v_room.joker_config;
  v_chance := coalesce((v_cfg->>'chancePercent')::numeric, 0);
  v_max_total := (v_cfg->>'maxTotal')::int;

  if v_chance > 0 then
    select array_agg(id order by random()) into v_ball_ids from balls where room_id = p_room_id;

    foreach v_bid in array v_ball_ids loop
      exit when v_max_total is not null and v_granted_total >= v_max_total;
      if random() * 100 < v_chance then
        v_eligible := array[]::text[];
        v_eligible_weights := array[]::numeric[];
        foreach v_type in array v_type_keys loop
          v_type_enabled := coalesce((v_cfg->'types'->v_type->>'enabled')::boolean, true);
          v_type_weight := coalesce((v_cfg->'types'->v_type->>'weight')::numeric, 1);
          v_type_max := (v_cfg->'types'->v_type->>'maxCount')::int;
          v_type_count := coalesce((v_granted_by_type->>v_type)::int, 0);
          if v_type_enabled and v_type_weight > 0 and (v_type_max is null or v_type_count < v_type_max) then
            v_eligible := array_append(v_eligible, v_type);
            v_eligible_weights := array_append(v_eligible_weights, v_type_weight);
          end if;
        end loop;

        if array_length(v_eligible, 1) > 0 then
          v_total_weight := 0;
          for i in 1..array_length(v_eligible_weights, 1) loop
            v_total_weight := v_total_weight + v_eligible_weights[i];
          end loop;

          v_r := random() * v_total_weight;
          v_acc := 0;
          v_chosen := v_eligible[array_length(v_eligible, 1)];
          for i in 1..array_length(v_eligible, 1) loop
            v_acc := v_acc + v_eligible_weights[i];
            if v_r <= v_acc then
              v_chosen := v_eligible[i];
              exit;
            end if;
          end loop;

          update ball_contents set joker_type = v_chosen where ball_id = v_bid;
          v_granted_total := v_granted_total + 1;
          v_granted_by_type := jsonb_set(
            v_granted_by_type, array[v_chosen], to_jsonb(coalesce((v_granted_by_type->>v_chosen)::int, 0) + 1)
          );
        end if;
      end if;
    end loop;
  end if;

  update rooms set status = 'drafting', current_turn_seat = p_starting_seat where id = p_room_id;
end;
$$;

-- Oeffnet einen Ball und vergibt zusaetzlich sofort einen etwaigen mitversteckten Joker an den
-- oeffnenden Sitzplatz (unabhaengig davon, ob der Ball spaeter platziert oder per Veto verworfen
-- wird). "Pending" (noch zu platzierender) Ball schliesst per Veto verworfene Baelle aus.
create or replace function public.draw_ball(p_room_id uuid, p_ball_number int)
returns public.balls
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_seat int;
  v_ball balls;
  v_has_pending boolean;
  v_joker_type text;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.status <> 'drafting' then
    raise exception 'Das Spiel laeuft gerade nicht';
  end if;

  v_seat := public.my_seat(p_room_id);
  if v_seat is null or v_seat <> v_room.current_turn_seat then
    raise exception 'Du bist nicht am Zug';
  end if;

  select exists(
    select 1 from balls
    where room_id = p_room_id and opened_by_seat = v_seat and placed_field is null and discarded = false
  ) into v_has_pending;
  if v_has_pending then
    raise exception 'Zuerst den bereits geoeffneten Ball platzieren';
  end if;

  update balls set opened = true, opened_by_seat = v_seat, opened_at = now()
    where room_id = p_room_id and number = p_ball_number and opened = false
    returning * into v_ball;

  if not found then
    raise exception 'Dieser Ball wurde bereits geoeffnet oder existiert nicht';
  end if;

  select joker_type into v_joker_type from ball_contents where ball_id = v_ball.id;
  if v_joker_type is not null then
    insert into player_jokers (room_id, seat, joker_type, source_ball_id)
      values (p_room_id, v_seat, v_joker_type, v_ball.id);
  end if;

  return v_ball;
end;
$$;

create or replace function public.place_ball(
  p_room_id uuid, p_ball_id uuid, p_field_index int, p_slot_type text, p_slot_ordinal int
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_seat int;
  v_ball balls;
  v_slot team_slots;
  v_other_seat int;
  v_other_locked boolean;
  v_balls_remaining int;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.status <> 'drafting' then
    raise exception 'Das Spiel laeuft gerade nicht';
  end if;

  v_seat := public.my_seat(p_room_id);
  select * into v_ball from balls where id = p_ball_id and room_id = p_room_id;
  if not found or v_ball.opened_by_seat <> v_seat or v_ball.placed_field is not null or v_ball.discarded then
    raise exception 'Dieser Ball kann von dir gerade nicht platziert werden';
  end if;

  select * into v_slot from team_slots
    where room_id = p_room_id and seat = v_seat and field_index = p_field_index
      and slot_type = p_slot_type and slot_ordinal = p_slot_ordinal
    for update;
  if not found then
    raise exception 'Ungueltiger Slot';
  end if;
  if v_slot.slot_type <> v_ball.category then
    raise exception 'Kategorie passt nicht in diesen Slot';
  end if;

  insert into draft_log (room_id, seat, ball_id, field_index, slot_type, slot_ordinal, overwritten_ball_id)
    values (p_room_id, v_seat, p_ball_id, p_field_index, p_slot_type, p_slot_ordinal, v_slot.filled_ball_id);

  update team_slots set filled_ball_id = p_ball_id where id = v_slot.id;
  update balls set placed_field = p_field_index, placed_slot_type = p_slot_type, placed_slot_ordinal = p_slot_ordinal
    where id = p_ball_id;

  v_other_seat := case v_seat when 1 then 2 else 1 end;
  select locked into v_other_locked from room_participants where room_id = p_room_id and seat = v_other_seat;

  select count(*) into v_balls_remaining from balls where room_id = p_room_id and opened = false;

  if v_balls_remaining = 0 then
    update rooms set status = 'finished', current_turn_seat = null where id = p_room_id;
  else
    update rooms set current_turn_seat = case when v_other_locked then v_seat else v_other_seat end
      where id = p_room_id;
  end if;
end;
$$;

-- Veto-Joker: verwirft den eigenen gerade geoeffneten, noch nicht platzierten Ball, ohne ihn in
-- einen Slot legen zu muessen. Zugwechsel-Logik identisch zu place_ball (der Zug geht danach ganz
-- normal weiter).
create or replace function public.use_veto_joker(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_seat int;
  v_ball balls;
  v_joker player_jokers;
  v_other_seat int;
  v_other_locked boolean;
  v_balls_remaining int;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.status <> 'drafting' then
    raise exception 'Das Spiel laeuft gerade nicht';
  end if;

  v_seat := public.my_seat(p_room_id);
  if v_seat is null then
    raise exception 'Du bist kein Teilnehmer dieses Raums';
  end if;

  select * into v_ball from balls
    where room_id = p_room_id and opened_by_seat = v_seat and placed_field is null and discarded = false
    order by opened_at desc limit 1 for update;
  if not found then
    raise exception 'Du hast gerade keinen offenen, unplatzierten Ball';
  end if;

  select * into v_joker from player_jokers
    where room_id = p_room_id and seat = v_seat and joker_type = 'veto' and used = false
    order by granted_at asc limit 1 for update;
  if not found then
    raise exception 'Kein Veto-Joker verfuegbar';
  end if;

  update balls set discarded = true, discarded_at = now() where id = v_ball.id;
  update player_jokers set used = true, used_at = now(), used_detail = jsonb_build_object('ball_id', v_ball.id)
    where id = v_joker.id;

  insert into draft_log (room_id, seat, ball_id, action_type, joker_id)
    values (p_room_id, v_seat, v_ball.id, 'veto', v_joker.id);

  v_other_seat := case v_seat when 1 then 2 else 1 end;
  select locked into v_other_locked from room_participants where room_id = p_room_id and seat = v_other_seat;
  select count(*) into v_balls_remaining from balls where room_id = p_room_id and opened = false;

  if v_balls_remaining = 0 then
    update rooms set status = 'finished', current_turn_seat = null where id = p_room_id;
  else
    update rooms set current_turn_seat = case when v_other_locked then v_seat else v_other_seat end
      where id = p_room_id;
  end if;
end;
$$;

-- Wondertrade-Joker: wuerfelt ein bereits platziertes Pokemon (eigenes oder gegnerisches) neu aus.
-- Freie Aktion (kein Zugwechsel) -- waehrend des Drafts nur am eigenen Zug, nach Draft-Ende
-- (status 'finished') jederzeit nutzbar. Der neue Wert wird vom
-- Client vorgeschlagen (per Filter aus rooms.pokemon_filters + Stammdaten, die nur im Frontend
-- liegen); der Server lehnt Duplikate zu jedem Pokemon im Raum ab (auch noch versteckte Baelle,
-- die der Client gar nicht kennen kann) -- der Client probiert bei Ablehnung einfach den naechsten
-- zufaelligen Kandidaten.
create or replace function public.use_wondertrade_joker(p_room_id uuid, p_target_ball_id uuid, p_new_value text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_seat int;
  v_target balls;
  v_joker player_jokers;
  v_dupe boolean;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.status not in ('drafting', 'finished') then
    raise exception 'Das Spiel laeuft gerade nicht';
  end if;

  v_seat := public.my_seat(p_room_id);
  if v_seat is null then
    raise exception 'Du bist kein Teilnehmer dieses Raums';
  end if;
  -- Waehrend des Drafts nur am eigenen Zug; nach Draft-Ende (kein "Zug" mehr vorhanden) darf
  -- jeder Sitzplatz seine restlichen Joker jederzeit einsetzen.
  if v_room.status = 'drafting' and v_seat <> v_room.current_turn_seat then
    raise exception 'Wondertrade ist nur am eigenen Zug einsetzbar';
  end if;

  if p_new_value is null or trim(p_new_value) = '' then
    raise exception 'Ungueltiger neuer Wert';
  end if;

  select * into v_target from balls
    where id = p_target_ball_id and room_id = p_room_id and placed_slot_type = 'pokemon' and placed_field is not null
    for update;
  if not found then
    raise exception 'Ungueltiges Ziel-Pokemon';
  end if;

  select * into v_joker from player_jokers
    where room_id = p_room_id and seat = v_seat and joker_type = 'wondertrade' and used = false
    order by granted_at asc limit 1 for update;
  if not found then
    raise exception 'Kein Wondertrade-Joker verfuegbar';
  end if;

  select exists(
    select 1 from ball_contents bc join balls b on b.id = bc.ball_id
    where b.room_id = p_room_id and b.category = 'pokemon' and bc.value = p_new_value and b.id <> v_target.id
  ) into v_dupe;
  if v_dupe then
    raise exception 'Dieses Pokemon ist bereits vergeben oder noch versteckt';
  end if;

  update ball_contents set value = p_new_value where ball_id = v_target.id;
  update player_jokers set used = true, used_at = now(),
      used_detail = jsonb_build_object('target_ball_id', v_target.id, 'new_value', p_new_value)
    where id = v_joker.id;
end;
$$;

-- Wechsel-Joker: tauscht zwei gleichartige Slots im eigenen Team (mind. einer davon befuellt).
-- Freie Aktion (kein Zugwechsel) -- waehrend des Drafts nur am eigenen Zug, nach Draft-Ende
-- (status 'finished') jederzeit nutzbar.
create or replace function public.use_wechsel_joker(p_room_id uuid, p_slot_a_id uuid, p_slot_b_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_seat int;
  v_a team_slots;
  v_b team_slots;
  v_joker player_jokers;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.status not in ('drafting', 'finished') then
    raise exception 'Das Spiel laeuft gerade nicht';
  end if;

  v_seat := public.my_seat(p_room_id);
  if v_seat is null then
    raise exception 'Du bist kein Teilnehmer dieses Raums';
  end if;
  -- Waehrend des Drafts nur am eigenen Zug; nach Draft-Ende (kein "Zug" mehr vorhanden) darf
  -- jeder Sitzplatz seine restlichen Joker jederzeit einsetzen.
  if v_room.status = 'drafting' and v_seat <> v_room.current_turn_seat then
    raise exception 'Wechseljoker ist nur am eigenen Zug einsetzbar';
  end if;

  if p_slot_a_id = p_slot_b_id then
    raise exception 'Bitte zwei unterschiedliche Slots waehlen';
  end if;

  select * into v_a from team_slots where id = p_slot_a_id and room_id = p_room_id and seat = v_seat for update;
  select * into v_b from team_slots where id = p_slot_b_id and room_id = p_room_id and seat = v_seat for update;
  if v_a.id is null or v_b.id is null then
    raise exception 'Ungueltige Slots';
  end if;
  if v_a.slot_type <> v_b.slot_type then
    raise exception 'Es koennen nur gleichartige Slots getauscht werden';
  end if;
  if v_a.filled_ball_id is null and v_b.filled_ball_id is null then
    raise exception 'Mindestens einer der beiden Slots muss befuellt sein';
  end if;

  select * into v_joker from player_jokers
    where room_id = p_room_id and seat = v_seat and joker_type = 'wechsel' and used = false
    order by granted_at asc limit 1 for update;
  if not found then
    raise exception 'Kein Wechseljoker verfuegbar';
  end if;

  update team_slots set filled_ball_id = v_b.filled_ball_id where id = v_a.id;
  update team_slots set filled_ball_id = v_a.filled_ball_id where id = v_b.id;

  if v_a.filled_ball_id is not null then
    update balls set placed_field = v_b.field_index, placed_slot_type = v_b.slot_type, placed_slot_ordinal = v_b.slot_ordinal
      where id = v_a.filled_ball_id;
  end if;
  if v_b.filled_ball_id is not null then
    update balls set placed_field = v_a.field_index, placed_slot_type = v_a.slot_type, placed_slot_ordinal = v_a.slot_ordinal
      where id = v_b.filled_ball_id;
  end if;

  update player_jokers set used = true, used_at = now(),
      used_detail = jsonb_build_object('slot_a', v_a.id, 'slot_b', v_b.id)
    where id = v_joker.id;
end;
$$;

create or replace function public.lock_team(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_seat int;
  v_other_seat int;
  v_other_locked boolean;
  v_balls_remaining int;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.status <> 'drafting' then
    raise exception 'Das Spiel laeuft gerade nicht';
  end if;

  v_seat := public.my_seat(p_room_id);
  if v_seat is null or v_seat <> v_room.current_turn_seat then
    raise exception 'Du bist nicht am Zug';
  end if;

  update room_participants set locked = true, locked_at = now()
    where room_id = p_room_id and seat = v_seat;

  v_other_seat := case v_seat when 1 then 2 else 1 end;
  select locked into v_other_locked from room_participants where room_id = p_room_id and seat = v_other_seat;
  select count(*) into v_balls_remaining from balls where room_id = p_room_id and opened = false;

  if v_other_locked or v_balls_remaining = 0 then
    update rooms set status = 'finished', current_turn_seat = null where id = p_room_id;
  else
    update rooms set current_turn_seat = v_other_seat where id = p_room_id;
  end if;
end;
$$;

-- Schaltet den transparenten 16:9-Overlay-Modus um (fuer OBS-Layout, Host-only).
create or replace function public.set_overlay_mode(p_room_id uuid, p_enabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room_id and host_user_id = auth.uid()) then
    raise exception 'Nur der Host kann den Overlay-Modus umschalten';
  end if;
  update rooms set overlay_mode = p_enabled where id = p_room_id;
end;
$$;

-- Setzt den Draft komplett zurueck (geoeffnete Baelle, Platzierungen, Sperren, wer am Zug ist),
-- der Content-Pool und die beigetretenen Teilnehmer bleiben erhalten. Der Host muss danach
-- erneut "Spiel starten" druecken (neuer zufaelliger Shuffle).
create or replace function public.reset_draft(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.host_user_id <> auth.uid() then
    raise exception 'Nur der Host kann den Draft zuruecksetzen';
  end if;
  if v_room.status = 'setup' then
    raise exception 'Das Spiel wurde noch nicht gestartet';
  end if;

  delete from draft_log where room_id = p_room_id;
  delete from player_jokers where room_id = p_room_id;
  delete from team_slots where room_id = p_room_id;
  delete from ball_contents where room_id = p_room_id;
  delete from balls where room_id = p_room_id;

  update room_participants set locked = false, locked_at = null where room_id = p_room_id;
  update rooms set status = 'setup', current_turn_seat = null where id = p_room_id;
end;
$$;

-- Macht die zeitlich letzte Aktion rueckgaengig (Ziehen, Platzieren oder Sperren) — erkannt anhand
-- des juengsten Zeitstempels unter den drei moeglichen Aktionsarten. Host-only, fuer schnelle
-- Fehlerkorrektur waehrend des Drafts gedacht.
create or replace function public.undo_last_action(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_pending_ball balls;
  v_log draft_log;
  v_locked_participant room_participants;
  v_pending_ts timestamptz;
  v_log_ts timestamptz;
  v_locked_ts timestamptz;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.host_user_id <> auth.uid() then
    raise exception 'Nur der Host kann eine Aktion rueckgaengig machen';
  end if;

  select * into v_pending_ball from balls
    where room_id = p_room_id and opened = true and placed_field is null and discarded = false
    order by opened_at desc limit 1;
  v_pending_ts := v_pending_ball.opened_at;

  select * into v_log from draft_log where room_id = p_room_id order by id desc limit 1;
  v_log_ts := v_log.created_at;

  select * into v_locked_participant from room_participants
    where room_id = p_room_id and locked = true order by locked_at desc limit 1;
  v_locked_ts := v_locked_participant.locked_at;

  if v_pending_ts is null and v_log_ts is null and v_locked_ts is null then
    raise exception 'Es gibt nichts rueckgaengig zu machen';
  end if;

  if v_pending_ts is not null
     and v_pending_ts >= coalesce(v_log_ts, '-infinity'::timestamptz)
     and v_pending_ts >= coalesce(v_locked_ts, '-infinity'::timestamptz) then
    -- letzte Aktion war ein Ziehen: Ball wieder verdeckt zurueckversetzen.
    update balls set opened = false, opened_by_seat = null, opened_at = null
      where id = v_pending_ball.id;

  elsif v_log_ts is not null
        and v_log_ts >= coalesce(v_locked_ts, '-infinity'::timestamptz) then
    if v_log.action_type = 'veto' then
      -- letzte Aktion war ein Veto-Einsatz: Ball wieder als nicht-verworfen markieren, verbrauchten
      -- Joker zurueckgeben, Zug an den vetoenden Sitzplatz zurueckgeben.
      update balls set discarded = false, discarded_at = null where id = v_log.ball_id;
      update player_jokers set used = false, used_at = null, used_detail = null where id = v_log.joker_id;
      delete from draft_log where id = v_log.id;
      update rooms set status = 'drafting', current_turn_seat = v_log.seat where id = p_room_id;
    else
      -- letzte Aktion war eine Platzierung: Slot und Ball(e) zuruecksetzen, Log-Eintrag entfernen,
      -- Zug an den platzierenden Sitzplatz zurueckgeben (der vor der Platzierung am Zug war).
      update team_slots set filled_ball_id = v_log.overwritten_ball_id
        where room_id = p_room_id and seat = v_log.seat and field_index = v_log.field_index
          and slot_type = v_log.slot_type and slot_ordinal = v_log.slot_ordinal;

      update balls set placed_field = null, placed_slot_type = null, placed_slot_ordinal = null
        where id = v_log.ball_id;

      if v_log.overwritten_ball_id is not null then
        update balls set placed_field = v_log.field_index, placed_slot_type = v_log.slot_type,
               placed_slot_ordinal = v_log.slot_ordinal
          where id = v_log.overwritten_ball_id;
      end if;

      delete from draft_log where id = v_log.id;

      update rooms set status = 'drafting', current_turn_seat = v_log.seat where id = p_room_id;
    end if;

  else
    -- letzte Aktion war ein Sperren (Lock): Sperre aufheben, Zug an den sperrenden Sitzplatz
    -- zurueckgeben (der vor dem Sperren am Zug war).
    update room_participants set locked = false, locked_at = null where id = v_locked_participant.id;
    update rooms set status = 'drafting', current_turn_seat = v_locked_participant.seat where id = p_room_id;
  end if;
end;
$$;

create or replace function public.claim_obs_view(p_room_id uuid, p_obs_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room_id and obs_token = p_obs_token) then
    raise exception 'Ungueltiger OBS-Link';
  end if;
  insert into room_obs_viewers (room_id, user_id) values (p_room_id, auth.uid())
    on conflict do nothing;
end;
$$;

create or replace function public.regenerate_obs_token(p_room_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_new_token text := encode(gen_random_bytes(18), 'hex');
begin
  if not exists (select 1 from rooms where id = p_room_id and host_user_id = auth.uid()) then
    raise exception 'Nur der Host kann den OBS-Link erneuern';
  end if;
  update rooms set obs_token = v_new_token where id = p_room_id;
  delete from room_obs_viewers where room_id = p_room_id;
  return v_new_token;
end;
$$;

revoke all on function
  public.create_room, public.preview_room, public.join_room,
  public.lock_team, public.claim_obs_view,
  public.regenerate_obs_token, public.generate_room_code, public.set_overlay_mode,
  public.set_display_name, public.set_host_display_name
  from public;
revoke all on function public.set_joker_config(uuid, jsonb) from public;
revoke all on function public.set_content_pool(uuid, jsonb, jsonb) from public;
revoke all on function public.start_game(uuid, int) from public;
revoke all on function public.draw_ball(uuid, int) from public;
revoke all on function public.place_ball(uuid, uuid, int, text, int) from public;
revoke all on function public.use_veto_joker(uuid) from public;
revoke all on function public.use_wondertrade_joker(uuid, uuid, text) from public;
revoke all on function public.use_wechsel_joker(uuid, uuid, uuid) from public;
revoke all on function public.reset_draft(uuid) from public;
revoke all on function public.undo_last_action(uuid) from public;

grant execute on function public.create_room() to authenticated;
grant execute on function public.set_joker_config(uuid, jsonb) to authenticated;
grant execute on function public.set_content_pool(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.preview_room(text) to authenticated;
grant execute on function public.join_room(text, int, text) to authenticated;
grant execute on function public.start_game(uuid, int) to authenticated;
grant execute on function public.draw_ball(uuid, int) to authenticated;
grant execute on function public.place_ball(uuid, uuid, int, text, int) to authenticated;
grant execute on function public.use_veto_joker(uuid) to authenticated;
grant execute on function public.use_wondertrade_joker(uuid, uuid, text) to authenticated;
grant execute on function public.use_wechsel_joker(uuid, uuid, uuid) to authenticated;
grant execute on function public.lock_team(uuid) to authenticated;
grant execute on function public.claim_obs_view(uuid, text) to authenticated;
grant execute on function public.regenerate_obs_token(uuid) to authenticated;
grant execute on function public.set_overlay_mode(uuid, boolean) to authenticated;
grant execute on function public.reset_draft(uuid) to authenticated;
grant execute on function public.undo_last_action(uuid) to authenticated;
grant execute on function public.set_display_name(uuid, text) to authenticated;
grant execute on function public.set_host_display_name(uuid, text) to authenticated;

-- =========================================================================
-- 5. REALTIME
-- =========================================================================

alter publication supabase_realtime add table
  public.rooms, public.room_participants, public.balls, public.ball_contents, public.player_jokers,
  public.team_slots, public.draft_log, public.room_obs_viewers;
