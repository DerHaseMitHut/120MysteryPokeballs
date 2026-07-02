export type Category = 'pokemon' | 'item' | 'wesen' | 'faehigkeit' | 'attacke'
export type RoomStatus = 'setup' | 'drafting' | 'finished'
export type Seat = 1 | 2

export interface RoomRow {
  id: string
  code: string
  host_user_id: string
  obs_token: string
  status: RoomStatus
  current_turn_seat: Seat | null
  overlay_mode: boolean
  created_at: string
}

export interface RoomParticipantRow {
  id: string
  room_id: string
  seat: Seat
  user_id: string | null
  display_name: string | null
  locked: boolean
  locked_at: string | null
}

export interface RoomObsViewerRow {
  room_id: string
  user_id: string
  created_at: string
}

export interface PreviewRoomSeat {
  seat: Seat
  taken: boolean
  display_name: string | null
  is_me: boolean
}

export interface PreviewRoomResult {
  room_id: string
  code: string
  status: RoomStatus
  seats: PreviewRoomSeat[]
}

export interface ContentPoolRow {
  id: string
  room_id: string
  category: Category
  value: string
}

export interface BallRow {
  id: string
  room_id: string
  number: number
  category: Category
  opened: boolean
  opened_by_seat: Seat | null
  opened_at: string | null
  placed_field: number | null
  placed_slot_type: Category | null
  placed_slot_ordinal: number | null
}


export interface BallContentRow {
  ball_id: string
  room_id: string
  value: string
}

export interface TeamSlotRow {
  id: string
  room_id: string
  seat: Seat
  field_index: number
  slot_type: Category
  slot_ordinal: number
  filled_ball_id: string | null
}

export interface DraftLogRow {
  id: number
  room_id: string
  seat: Seat
  ball_id: string
  field_index: number
  slot_type: Category
  slot_ordinal: number
  overwritten_ball_id: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      rooms: { Row: RoomRow; Insert: Partial<RoomRow>; Update: Partial<RoomRow> }
      room_participants: {
        Row: RoomParticipantRow
        Insert: Partial<RoomParticipantRow>
        Update: Partial<RoomParticipantRow>
      }
      content_pool: { Row: ContentPoolRow; Insert: Partial<ContentPoolRow>; Update: Partial<ContentPoolRow> }
      balls: { Row: BallRow; Insert: Partial<BallRow>; Update: Partial<BallRow> }
      ball_contents: { Row: BallContentRow; Insert: Partial<BallContentRow>; Update: Partial<BallContentRow> }
      team_slots: { Row: TeamSlotRow; Insert: Partial<TeamSlotRow>; Update: Partial<TeamSlotRow> }
      draft_log: { Row: DraftLogRow; Insert: Partial<DraftLogRow>; Update: Partial<DraftLogRow> }
      room_obs_viewers: { Row: RoomObsViewerRow; Insert: Partial<RoomObsViewerRow>; Update: Partial<RoomObsViewerRow> }
    }
    Views: Record<string, never>
    Functions: {
      create_room: { Args: Record<string, never>; Returns: RoomRow }
      set_content_pool: {
        Args: { p_room_id: string; p_pool: { category: Category; value: string }[] }
        Returns: void
      }
      preview_room: { Args: { p_code: string }; Returns: PreviewRoomResult }
      join_room: {
        Args: { p_code: string; p_seat: Seat; p_display_name: string }
        Returns: RoomParticipantRow
      }
      start_game: { Args: { p_room_id: string; p_starting_seat: Seat }; Returns: void }
      draw_ball: { Args: { p_room_id: string; p_ball_number: number }; Returns: BallRow }
      place_ball: {
        Args: {
          p_room_id: string
          p_ball_id: string
          p_field_index: number
          p_slot_type: Category
          p_slot_ordinal: number
        }
        Returns: void
      }
      lock_team: { Args: { p_room_id: string }; Returns: void }
      claim_obs_view: { Args: { p_room_id: string; p_obs_token: string }; Returns: void }
      regenerate_obs_token: { Args: { p_room_id: string }; Returns: string }
      set_overlay_mode: { Args: { p_room_id: string; p_enabled: boolean }; Returns: void }
      reset_draft: { Args: { p_room_id: string }; Returns: void }
      undo_last_action: { Args: { p_room_id: string }; Returns: void }
    }
  }
}
