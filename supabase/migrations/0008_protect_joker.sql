-- Fuegt einen vierten Joker hinzu: Protect. Ersetzt eine eigene, bereits platzierte Attacke durch
-- "Schutzschild" (fester Wert, kein Reroll). Wie Wechsel eine freie Aktion (kein Zugwechsel),
-- waehrend des Drafts nur am eigenen Zug, nach Draft-Ende jederzeit nutzbar, nur im eigenen Team.
-- Einmal im Supabase SQL-Editor ausfuehren.

alter table public.ball_contents drop constraint if exists ball_contents_joker_type_check;
alter table public.ball_contents add constraint ball_contents_joker_type_check
  check (joker_type in ('veto', 'wondertrade', 'wechsel', 'protect'));

alter table public.player_jokers drop constraint if exists player_jokers_joker_type_check;
alter table public.player_jokers add constraint player_jokers_joker_type_check
  check (joker_type in ('veto', 'wondertrade', 'wechsel', 'protect'));

-- start_game: identische Logik wie zuvor, die Joker-Verteilung ist bereits generisch ueber
-- v_type_keys -- die neue Art muss dort nur mit aufgenommen werden.
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
  v_type_keys text[] := array['veto', 'wondertrade', 'wechsel', 'protect'];
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

-- Protect-Joker: ersetzt eine einzelne eigene, bereits platzierte Attacke durch "Schutzschild"
-- (fester Wert -- kein Reroll, deshalb auch keine Duplikat-Pruefung noetig wie bei Wondertrade,
-- mehrere Pokemon mit Schutzschild sind normal/erlaubt). Freie Aktion (kein Zugwechsel) --
-- waehrend des Drafts nur am eigenen Zug, nach Draft-Ende jederzeit nutzbar.
create or replace function public.use_protect_joker(p_room_id uuid, p_target_ball_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_seat int;
  v_slot team_slots;
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
  if v_room.status = 'drafting' and v_seat <> v_room.current_turn_seat then
    raise exception 'Protect ist nur am eigenen Zug einsetzbar';
  end if;

  select * into v_slot from team_slots
    where room_id = p_room_id and filled_ball_id = p_target_ball_id and slot_type = 'attacke'
    for update;
  if not found or v_slot.seat <> v_seat then
    raise exception 'Ungueltige Ziel-Attacke';
  end if;

  select * into v_joker from player_jokers
    where room_id = p_room_id and seat = v_seat and joker_type = 'protect' and used = false
    order by granted_at asc limit 1 for update;
  if not found then
    raise exception 'Kein Protect-Joker verfuegbar';
  end if;

  update ball_contents set value = 'Schutzschild' where ball_id = p_target_ball_id;
  update player_jokers set used = true, used_at = now(),
      used_detail = jsonb_build_object('target_ball_id', p_target_ball_id)
    where id = v_joker.id;
end;
$$;

revoke all on function public.use_protect_joker(uuid, uuid) from public;
grant execute on function public.use_protect_joker(uuid, uuid) to authenticated;
