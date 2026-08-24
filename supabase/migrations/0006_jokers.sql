-- Fuegt drei Joker-Arten hinzu (Veto/Wondertrade/Wechsel), die zusaetzlich zum Standardinhalt
-- eines Balls versteckt mitdrin sein koennen. Chance, Gesamt-Obergrenze und je Jokerart
-- Aktiv/Gewichtung/Obergrenze sind vom Host vor Spielstart einstellbar (siehe HostSetupPanel /
-- JokerConfigPanel). Einmal im Supabase SQL-Editor ausfuehren.

-- =========================================================================
-- 1. SCHEMA-AENDERUNGEN
-- =========================================================================

-- Der Joker eines Balls wird wie sein Standardinhalt erst beim Oeffnen bekannt -- deshalb in
-- ball_contents (dieselbe RLS-"reveal rule" wie fuer den Standardwert greift automatisch mit).
alter table public.ball_contents add column if not exists joker_type text
  check (joker_type in ('veto', 'wondertrade', 'wechsel'));

-- Joker-Konfiguration (Chance/Obergrenzen/Gewichtung) wird vom Host vor Spielstart festgelegt und
-- bleibt am Room haengen (uebersteht reset_draft, wie der Content-Pool auch).
alter table public.rooms add column if not exists joker_config jsonb not null default '{
  "chancePercent": 15,
  "maxTotal": null,
  "types": {
    "veto": { "enabled": true, "weight": 1, "maxCount": null },
    "wondertrade": { "enabled": true, "weight": 1, "maxCount": null },
    "wechsel": { "enabled": true, "weight": 1, "maxCount": null }
  }
}'::jsonb;

-- Die beim Pool-Setup gewaehlten Pokemon-Filter (Generation/Typ/Legendaer/BST-Bereich/...) werden
-- zusaetzlich hier gespeichert, damit der Wondertrade-Joker waehrend des laufenden Drafts noch
-- "gemaess den eingestellten Richtlinien" neu wuerfeln kann -- die Filterlogik selbst lebt nur im
-- Frontend (Stammdaten sind kein DB-Table), die Auswahl macht deshalb der Client; der Server
-- validiert beim Anwenden nur, dass der neue Wert nicht mit einem bereits vergebenen oder noch
-- versteckten Pokemon im Raum kollidiert (siehe use_wondertrade_joker unten).
alter table public.rooms add column if not exists pokemon_filters jsonb;

-- Veto braucht einen Weg, einen geoeffneten Ball als "verworfen" zu markieren, ohne ihn zu
-- platzieren (bisheriges Schema kannte nur offen/platziert).
alter table public.balls add column if not exists discarded boolean not null default false;
alter table public.balls add column if not exists discarded_at timestamptz;

-- Joker-Inventar je Teilnehmer: einzelne Zeilen (nicht nur ein Zaehler), damit sich einzelne
-- Vergaben/Verbrauche fuer Undo nachvollziehen lassen. Die Vergabe selbst ist bewusst OEFFENTLICH
-- lesbar (jeder soll sehen, wer welchen Joker hat) -- unabhaengig davon, ob der zugrundeliegende
-- Ball-Wert fuer den Gegner ueberhaupt sichtbar ist.
create table if not exists public.player_jokers (
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

alter table public.player_jokers enable row level security;

drop policy if exists "room members can read player jokers" on public.player_jokers;
create policy "room members can read player jokers" on public.player_jokers
  for select using (public.is_room_member(room_id));

grant select on public.player_jokers to authenticated;

-- draft_log muss neben Platzierungen jetzt auch Veto-Einsaetze protokollieren koennen (fuer
-- undo_last_action). field_index/slot_type/slot_ordinal ergeben bei einem Veto keinen Sinn und
-- werden deshalb nullable.
alter table public.draft_log add column if not exists action_type text not null default 'place'
  check (action_type in ('place', 'veto'));
alter table public.draft_log add column if not exists joker_id uuid references public.player_jokers(id) on delete set null;
alter table public.draft_log alter column field_index drop not null;
alter table public.draft_log alter column slot_type drop not null;
alter table public.draft_log alter column slot_ordinal drop not null;

alter publication supabase_realtime add table public.player_jokers;

-- =========================================================================
-- 2. RPC-FUNKTIONEN
-- =========================================================================

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

-- Setzt/ersetzt den Pool eines Raums (wie zuvor) und speichert zusaetzlich die aktuellen
-- Pokemon-Filter (fuer spaetere Wondertrade-Reroll-Vorschlaege). p_pokemon_filters ist ein neuer,
-- defaultwertiger Parameter -- bestehende Aufrufe mit nur 2 Argumenten bleiben gueltig.
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

-- Startet das Spiel (wie zuvor: Pool zufaellig auf Baelle verteilen, Team-Slots anlegen) und
-- verteilt danach zusaetzlich zufaellig Joker auf die neu angelegten Baelle, gemaess
-- rooms.joker_config (Gesamtchance pro Ball, optionale Gesamt-/Pro-Art-Obergrenzen, Gewichtung).
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

-- Oeffnet einen Ball (wie zuvor) und vergibt zusaetzlich sofort einen etwaigen mitversteckten
-- Joker an den oeffnenden Sitzplatz (unabhaengig davon, ob der Ball spaeter platziert oder per
-- Veto verworfen wird). "Pending" (noch zu platzierender) Ball schliesst jetzt auch per Veto
-- verworfene Baelle aus.
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

-- Platziert einen Ball (wie zuvor), lehnt zusaetzlich per Veto verworfene Baelle ab (koennen
-- eigentlich nicht mehr "pending" sein, defensive Zusatzpruefung).
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

  insert into draft_log (room_id, seat, ball_id, field_index, slot_type, slot_ordinal, overwritten_ball_id, action_type)
    values (p_room_id, v_seat, p_ball_id, p_field_index, p_slot_type, p_slot_ordinal, v_slot.filled_ball_id, 'place');

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
-- Freie Aktion (kein Zugwechsel) -- nur waehrend des eigenen Zugs nutzbar. Der neue Wert wird vom
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
  if not found or v_room.status <> 'drafting' then
    raise exception 'Das Spiel laeuft gerade nicht';
  end if;

  v_seat := public.my_seat(p_room_id);
  if v_seat is null or v_seat <> v_room.current_turn_seat then
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
-- Freie Aktion (kein Zugwechsel) -- nur waehrend des eigenen Zugs nutzbar.
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
  if not found or v_room.status <> 'drafting' then
    raise exception 'Das Spiel laeuft gerade nicht';
  end if;

  v_seat := public.my_seat(p_room_id);
  if v_seat is null or v_seat <> v_room.current_turn_seat then
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

-- reset_draft: zusaetzlich das Joker-Inventar leeren (Content-Pool, joker_config und
-- pokemon_filters bleiben wie der Rest der Pool-Konfiguration erhalten).
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

-- undo_last_action: der erste Zweig (letzte Aktion war ein Ziehen) muss per Veto verworfene Baelle
-- ausschliessen (die sind kein "offener, noch zu platzierender" Ball mehr). Der zweite Zweig
-- (letzte Aktion laut draft_log) verzweigt jetzt zusaetzlich nach action_type: bei 'veto' wird der
-- Ball wieder als nicht-verworfen markiert und der verbrauchte Joker zurueckgegeben. Wondertrade-
-- und Wechseljoker-Einsaetze aendern den Zug nicht und werden bewusst NICHT von Undo erfasst (sie
-- tauchen nicht in draft_log auf) -- Undo wirkt weiterhin nur auf Ziehen/Platzieren/Veto/Sperren.
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
    update balls set opened = false, opened_by_seat = null, opened_at = null
      where id = v_pending_ball.id;

  elsif v_log_ts is not null
        and v_log_ts >= coalesce(v_locked_ts, '-infinity'::timestamptz) then
    if v_log.action_type = 'veto' then
      update balls set discarded = false, discarded_at = null where id = v_log.ball_id;
      update player_jokers set used = false, used_at = null, used_detail = null where id = v_log.joker_id;
      delete from draft_log where id = v_log.id;
      update rooms set status = 'drafting', current_turn_seat = v_log.seat where id = p_room_id;
    else
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
    update room_participants set locked = false, locked_at = null where id = v_locked_participant.id;
    update rooms set status = 'drafting', current_turn_seat = v_locked_participant.seat where id = p_room_id;
  end if;
end;
$$;

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

grant execute on function public.set_joker_config(uuid, jsonb) to authenticated;
grant execute on function public.set_content_pool(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.start_game(uuid, int) to authenticated;
grant execute on function public.draw_ball(uuid, int) to authenticated;
grant execute on function public.place_ball(uuid, uuid, int, text, int) to authenticated;
grant execute on function public.use_veto_joker(uuid) to authenticated;
grant execute on function public.use_wondertrade_joker(uuid, uuid, text) to authenticated;
grant execute on function public.use_wechsel_joker(uuid, uuid, uuid) to authenticated;
grant execute on function public.reset_draft(uuid) to authenticated;
grant execute on function public.undo_last_action(uuid) to authenticated;
