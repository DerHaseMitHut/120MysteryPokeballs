-- Migration fuer bereits bestehende Projekte, die schema.sql schon einmal ausgefuehrt haben.
-- Aendert create_room so, dass ein Raum sofort ohne Pool angelegt wird, und fuegt set_content_pool
-- hinzu, damit der Host den Pool direkt vom Hauptbildschirm aus eintragen/aendern kann.
-- Einmal im Supabase SQL-Editor ausfuehren.

drop function if exists public.create_room(jsonb);

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

revoke all on function public.create_room() from public;
revoke all on function public.set_content_pool(uuid, jsonb) from public;
grant execute on function public.create_room() to authenticated;
grant execute on function public.set_content_pool(uuid, jsonb) to authenticated;
