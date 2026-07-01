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
  obs_token text not null default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'setup' check (status in ('setup', 'drafting', 'finished')),
  current_turn_seat int check (current_turn_seat in (1, 2)),
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
  number int not null check (number between 1 and 120),
  category text not null check (category in ('pokemon', 'item', 'wesen', 'faehigkeit', 'attacke')),
  opened boolean not null default false,
  opened_by_seat int check (opened_by_seat in (1, 2)),
  opened_at timestamptz,
  placed_field int check (placed_field between 1 and 4),
  placed_slot_type text check (placed_slot_type in ('pokemon', 'item', 'wesen', 'faehigkeit', 'attacke')),
  placed_slot_ordinal int,
  unique (room_id, number)
);

-- Geheimer Teil: enthaelt die tatsaechlichen Werte. Getrennt von "balls", damit die
-- RLS-Policy (siehe unten) nur DIESE Tabelle je nach Betrachter unterschiedlich filtern muss.
create table public.ball_contents (
  ball_id uuid primary key references public.balls(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  value text not null
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
  field_index int not null,
  slot_type text not null,
  slot_ordinal int not null,
  overwritten_ball_id uuid,
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
  public.content_pool, public.balls, public.ball_contents, public.team_slots, public.draft_log
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

-- Setzt/ersetzt den 120er-Pool eines Raums, solange dieser noch im Setup ist. Kann beliebig oft
-- aufgerufen werden (z.B. waehrend der Host noch tippt und die Teilnehmer schon warten).
create or replace function public.set_content_pool(p_room_id uuid, p_pool jsonb)
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

  if v_total <> 120 or v_count_pokemon <> 20 or v_count_item <> 15 or v_count_wesen <> 15
     or v_count_faehigkeit <> 15 or v_count_attacke <> 55 then
    raise exception 'Pool muss genau 20 Pokemon, 15 Item, 15 Wesen, 15 Faehigkeit, 55 Attacke enthalten (erhalten: % gesamt)', v_total;
  end if;

  delete from content_pool where room_id = p_room_id;
  insert into content_pool (room_id, category, value)
    select p_room_id, entry->>'category', entry->>'value'
    from jsonb_array_elements(p_pool) as entry;
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

create or replace function public.start_game(p_room_id uuid, p_starting_seat int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_pool_count int;
  v_seat1_ready boolean;
  v_seat2_ready boolean;
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
  if v_pool_count <> 120 then
    raise exception 'Pool ist unvollstaendig (% von 120)', v_pool_count;
  end if;

  -- Zufaellige Zuordnung: Pool-Eintraege serverseitig mischen und auf Baelle 1..120 verteilen.
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

  update rooms set status = 'drafting', current_turn_seat = p_starting_seat where id = p_room_id;
end;
$$;

create or replace function public.draw_ball(p_room_id uuid, p_ball_number int)
returns public.balls
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_seat int;
  v_ball balls;
  v_has_pending boolean;
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
    select 1 from balls where room_id = p_room_id and opened_by_seat = v_seat and placed_field is null
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
  if not found or v_ball.opened_by_seat <> v_seat or v_ball.placed_field is not null then
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
  public.create_room, public.set_content_pool, public.preview_room, public.join_room, public.start_game,
  public.draw_ball, public.place_ball, public.lock_team, public.claim_obs_view,
  public.regenerate_obs_token, public.generate_room_code
  from public;

grant execute on function public.create_room() to authenticated;
grant execute on function public.set_content_pool(uuid, jsonb) to authenticated;
grant execute on function public.preview_room(text) to authenticated;
grant execute on function public.join_room(text, int, text) to authenticated;
grant execute on function public.start_game(uuid, int) to authenticated;
grant execute on function public.draw_ball(uuid, int) to authenticated;
grant execute on function public.place_ball(uuid, uuid, int, text, int) to authenticated;
grant execute on function public.lock_team(uuid) to authenticated;
grant execute on function public.claim_obs_view(uuid, text) to authenticated;
grant execute on function public.regenerate_obs_token(uuid) to authenticated;

-- =========================================================================
-- 5. REALTIME
-- =========================================================================

alter publication supabase_realtime add table
  public.rooms, public.room_participants, public.balls, public.ball_contents,
  public.team_slots, public.draft_log, public.room_obs_viewers;
