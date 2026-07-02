-- Migration fuer bereits bestehende Projekte: fuegt den 16:9-Overlay-Modus (fuer OBS-Layout),
-- einen Draft-Reset (Pool bleibt erhalten) und ein Rueckgaengig fuer die letzte Aktion hinzu.
-- Einmal im Supabase SQL-Editor ausfuehren.

alter table public.rooms add column if not exists overlay_mode boolean not null default false;

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
    where room_id = p_room_id and opened = true and placed_field is null
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

  else
    -- letzte Aktion war ein Sperren (Lock): Sperre aufheben, Zug an den sperrenden Sitzplatz
    -- zurueckgeben (der vor dem Sperren am Zug war).
    update room_participants set locked = false, locked_at = null where id = v_locked_participant.id;
    update rooms set status = 'drafting', current_turn_seat = v_locked_participant.seat where id = p_room_id;
  end if;
end;
$$;

revoke all on function public.set_overlay_mode(uuid, boolean) from public;
revoke all on function public.reset_draft(uuid) from public;
revoke all on function public.undo_last_action(uuid) from public;
grant execute on function public.set_overlay_mode(uuid, boolean) to authenticated;
grant execute on function public.reset_draft(uuid) to authenticated;
grant execute on function public.undo_last_action(uuid) to authenticated;
