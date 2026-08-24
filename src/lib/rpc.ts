import { supabase } from './supabaseClient'
import type { Category, PreviewRoomResult, RoomParticipantRow, RoomRow, Seat, BallRow } from './database.types'
import type { JokerConfig } from './jokers'
import type { PokemonFilters } from './poolResolution'

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const rpc = {
  createRoom: () => call<RoomRow>('create_room', {}),

  setContentPool: (
    roomId: string,
    pool: { category: Category; value: string }[],
    pokemonFilters: PokemonFilters | null = null,
  ) => call<void>('set_content_pool', { p_room_id: roomId, p_pool: pool, p_pokemon_filters: pokemonFilters }),

  setJokerConfig: (roomId: string, config: JokerConfig) =>
    call<void>('set_joker_config', { p_room_id: roomId, p_config: config }),

  previewRoom: (code: string) => call<PreviewRoomResult>('preview_room', { p_code: code }),

  joinRoom: (code: string, seat: Seat, displayName: string) =>
    call<RoomParticipantRow>('join_room', { p_code: code, p_seat: seat, p_display_name: displayName }),

  startGame: (roomId: string, startingSeat: Seat) =>
    call<void>('start_game', { p_room_id: roomId, p_starting_seat: startingSeat }),

  drawBall: (roomId: string, ballNumber: number) =>
    call<BallRow>('draw_ball', { p_room_id: roomId, p_ball_number: ballNumber }),

  placeBall: (
    roomId: string,
    ballId: string,
    fieldIndex: number,
    slotType: Category,
    slotOrdinal: number,
  ) =>
    call<void>('place_ball', {
      p_room_id: roomId,
      p_ball_id: ballId,
      p_field_index: fieldIndex,
      p_slot_type: slotType,
      p_slot_ordinal: slotOrdinal,
    }),

  useVetoJoker: (roomId: string) => call<void>('use_veto_joker', { p_room_id: roomId }),

  useWondertradeJoker: (roomId: string, targetBallId: string, newValue: string) =>
    call<void>('use_wondertrade_joker', {
      p_room_id: roomId,
      p_target_ball_id: targetBallId,
      p_new_value: newValue,
    }),

  useWechselJoker: (roomId: string, slotAId: string, slotBId: string) =>
    call<void>('use_wechsel_joker', { p_room_id: roomId, p_slot_a_id: slotAId, p_slot_b_id: slotBId }),

  lockTeam: (roomId: string) => call<void>('lock_team', { p_room_id: roomId }),

  claimObsView: (roomId: string, obsToken: string) =>
    call<void>('claim_obs_view', { p_room_id: roomId, p_obs_token: obsToken }),

  regenerateObsToken: (roomId: string) => call<string>('regenerate_obs_token', { p_room_id: roomId }),

  setOverlayMode: (roomId: string, enabled: boolean) =>
    call<void>('set_overlay_mode', { p_room_id: roomId, p_enabled: enabled }),

  resetDraft: (roomId: string) => call<void>('reset_draft', { p_room_id: roomId }),

  undoLastAction: (roomId: string) => call<void>('undo_last_action', { p_room_id: roomId }),

  setDisplayName: (roomId: string, displayName: string) =>
    call<RoomParticipantRow>('set_display_name', { p_room_id: roomId, p_display_name: displayName }),

  setHostDisplayName: (roomId: string, displayName: string) =>
    call<void>('set_host_display_name', { p_room_id: roomId, p_display_name: displayName }),
}
