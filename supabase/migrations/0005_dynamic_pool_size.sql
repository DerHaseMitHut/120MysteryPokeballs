-- Migration fuer bereits bestehende Projekte: Ballanzahl und Kategorie-Verteilung sind nicht mehr
-- fest auf 120 / 20-15-15-15-55 verdrahtet, sondern wird vom Host vor Spielstart frei
-- konfiguriert (siehe HostSetupPanel/PoolConfigPanel). Die Team-Slot-Struktur selbst (2 Sitze x
-- 4 Felder x je 1 Pokemon/Wesen/Faehigkeit/Item + 4 Attacke) bleibt unveraendert -- daraus folgen
-- die weiterhin fest codierten Mindestgrenzen 8/8/8/8/32 unten. Einmal im Supabase SQL-Editor
-- ausfuehren.

-- balls.number war auf 1..120 begrenzt; die Grenze war reine Absicherung, keine fachliche Regel.
-- Name des Check-Constraints folgt Postgres' Standard-Namenskonvention <table>_<column>_check;
-- falls beim Anlegen ein abweichender Name vergeben wurde, vor Ausfuehrung per
-- `select conname from pg_constraint where conrelid = 'public.balls'::regclass;` pruefen.
alter table public.balls drop constraint if exists balls_number_check;
alter table public.balls add constraint balls_number_check check (number > 0);

-- Setzt/ersetzt den Pool eines Raums, solange dieser noch im Setup ist. Validiert nur noch, dass
-- die Kategorie-Summen zur Gesamtzahl passen und die vom Team-Slot-Layout erzwungenen Minima
-- (siehe oben) eingehalten werden -- keine fixen 120/20/15/15/15/55 mehr.
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
end;
$$;

-- Startet das Spiel: mischt den (bereits validierten) Pool zufaellig auf die Baelle 1..N, wobei N
-- die tatsaechliche Poolgroesse ist (frueher fix 120). Team-Slot-Layout unveraendert.
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

  update rooms set status = 'drafting', current_turn_seat = p_starting_seat where id = p_room_id;
end;
$$;

revoke all on function public.set_content_pool(uuid, jsonb) from public;
revoke all on function public.start_game(uuid, int) from public;
grant execute on function public.set_content_pool(uuid, jsonb) to authenticated;
grant execute on function public.start_game(uuid, int) to authenticated;
