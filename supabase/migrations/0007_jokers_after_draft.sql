-- Wondertrade- und Wechseljoker duerfen bislang nur waehrend eines laufenden Drafts eingesetzt
-- werden (status = 'drafting'). Nach Draft-Ende (status = 'finished') werden noch nicht
-- verbrauchte Joker aber weiterhin gebraucht -- diese Migration erlaubt beide Joker zusaetzlich im
-- Status 'finished', ohne Zugzwang (current_turn_seat ist dann null, es gibt keinen "eigenen Zug"
-- mehr). Waehrend des Drafts bleibt die Zug-Pruefung unveraendert. Veto ist davon nicht betroffen
-- (setzt einen offenen, unplatzierten Ball voraus, der nach Draft-Ende ohnehin nie existiert).
-- Einmal im Supabase SQL-Editor ausfuehren.

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

revoke all on function public.use_wondertrade_joker(uuid, uuid, text) from public;
revoke all on function public.use_wechsel_joker(uuid, uuid, uuid) from public;
grant execute on function public.use_wondertrade_joker(uuid, uuid, text) to authenticated;
grant execute on function public.use_wechsel_joker(uuid, uuid, uuid) to authenticated;
