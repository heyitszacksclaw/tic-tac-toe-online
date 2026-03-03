-- Milestone 2: Rooms and Games tables, indexes, RLS policies
-- NOTE: pg_cron scheduling is skipped (not available via pooler connection).

-- =========================================================
-- ROOMS TABLE
-- =========================================================
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE CHECK (char_length(room_code) = 6),
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'playing', 'post_game', 'closed')),
  player1_id UUID REFERENCES auth.users(id),
  player2_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Index for room code lookup (join by code) - only among active rooms
CREATE UNIQUE INDEX idx_rooms_code_active ON rooms(room_code) WHERE status != 'closed';

-- General index for status queries
CREATE INDEX idx_rooms_status ON rooms(status);

-- =========================================================
-- GAMES TABLE
-- =========================================================
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id),
  game_type TEXT NOT NULL DEFAULT 'tic_tac_toe',
  player_x UUID NOT NULL REFERENCES auth.users(id),
  player_o UUID NOT NULL REFERENCES auth.users(id),
  game_state JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  winner_id UUID REFERENCES auth.users(id),
  win_reason TEXT CHECK (win_reason IN ('three_in_row', 'forfeit', 'timeout', 'disconnect', 'navigation')),
  turn_deadline TIMESTAMPTZ,
  round_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Index for active game lookup by room
CREATE INDEX idx_games_room_active ON games(room_id) WHERE status = 'active';

-- =========================================================
-- ADD FK from profiles.current_room_id -> rooms.id
-- =========================================================
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_current_room
  FOREIGN KEY (current_room_id) REFERENCES public.rooms(id)
  ON DELETE SET NULL;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- ROOMS: Players/creator can read rooms they are involved in
CREATE POLICY "Players read own room" ON rooms
  FOR SELECT USING (
    auth.uid() = player1_id OR auth.uid() = player2_id OR auth.uid() = creator_id
  );

-- ROOMS: No direct inserts/updates from client (all via service_role API routes)
-- Service role bypasses RLS automatically.

-- GAMES: Players can read games they are in
CREATE POLICY "Players read own game" ON games
  FOR SELECT USING (auth.uid() = player_x OR auth.uid() = player_o);

-- GAMES: No direct inserts/updates from client (all via service_role API routes)

-- =========================================================
-- REALTIME PUBLICATION
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE games;
