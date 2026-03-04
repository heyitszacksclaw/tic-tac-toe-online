-- Add 'draw' to the win_reason CHECK constraint on the games table
ALTER TABLE public.games DROP CONSTRAINT games_win_reason_check;
ALTER TABLE public.games ADD CONSTRAINT games_win_reason_check CHECK (win_reason = ANY (ARRAY['three_in_row', 'forfeit', 'timeout', 'disconnect', 'navigation', 'draw']));
