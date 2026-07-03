-- Migration fuer bereits bestehende Projekte: der Host bekommt einen eigenen Anzeigenamen
-- (statt fest "Host"), und alle Teilnehmer (inkl. Host) koennen ihren Namen jederzeit waehrend
-- der laufenden Runde aendern -- nicht mehr nur beim (Re-)Beitritt waehrend der Setup-Phase wie
-- bisher in join_room(). Einmal im Supabase SQL-Editor ausfuehren.

alter table public.rooms add column if not exists host_display_name text;

-- Aendert den eigenen Anzeigenamen eines Teilnehmers jederzeit (unabhaengig vom Raum-Status).
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

revoke all on function public.set_display_name(uuid, text) from public;
revoke all on function public.set_host_display_name(uuid, text) from public;
grant execute on function public.set_display_name(uuid, text) to authenticated;
grant execute on function public.set_host_display_name(uuid, text) to authenticated;
