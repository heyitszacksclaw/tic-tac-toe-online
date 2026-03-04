-- Migration: 20260304000002_rate_limiting.sql
-- Adds rate limiting infrastructure and pg_cron maintenance jobs

-- ============================================================================
-- Rate Limiting Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (no policies needed — accessed only via service role / SECURITY DEFINER function)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Index for fast sliding-window lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint_time
ON rate_limits (user_id, endpoint, created_at DESC);

-- ============================================================================
-- check_rate_limit Function
-- Returns true if ALLOWED, false if RATE LIMITED
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_max_requests int,
  p_window_seconds int DEFAULT 60
) RETURNS boolean AS $$
DECLARE
  v_count int;
  v_window_start timestamptz;
BEGIN
  v_window_start := now() - make_interval(secs := p_window_seconds);

  -- Count requests in the sliding window
  SELECT count(*) INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND created_at > v_window_start;

  -- If over limit, reject
  IF v_count >= p_max_requests THEN
    RETURN false;
  END IF;

  -- Record this request
  INSERT INTO rate_limits (user_id, endpoint, created_at)
  VALUES (p_user_id, p_endpoint, now());

  -- Cleanup old entries for this user/endpoint (older than 2 minutes)
  DELETE FROM rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND created_at < now() - interval '2 minutes';

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- pg_cron Maintenance Jobs
-- ============================================================================

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Stale room cleanup (every 5 minutes)
-- Close rooms where status='waiting' and expires_at has passed
SELECT cron.schedule(
  'cleanup-stale-rooms',
  '*/5 * * * *',
  $$
  UPDATE rooms SET status = 'closed', closed_at = now()
  WHERE status = 'waiting' AND expires_at < now();

  UPDATE profiles SET current_room_id = NULL
  WHERE current_room_id IN (
    SELECT id FROM rooms WHERE status = 'closed' AND closed_at > now() - interval '5 minutes'
  );
  $$
);

-- 2. Turn timer backstop (every minute)
-- Complete games where the turn deadline passed 30+ seconds ago (grace period for client claims)
SELECT cron.schedule(
  'turn-timer-backstop',
  '* * * * *',
  $$
  UPDATE games
  SET status = 'completed',
      win_reason = 'timeout',
      completed_at = now()
  WHERE status = 'active'
    AND turn_deadline < now() - interval '30 seconds';
  $$
);

-- 3. Rate limit cleanup (every 10 minutes)
-- Delete rate limit entries older than 5 minutes
SELECT cron.schedule(
  'cleanup-rate-limits',
  '*/10 * * * *',
  $$DELETE FROM rate_limits WHERE created_at < now() - interval '5 minutes';$$
);

-- 4. Rematch expiry (every minute)
-- Close post_game rooms where the latest game completed more than 60 seconds ago
SELECT cron.schedule(
  'rematch-expiry',
  '* * * * *',
  $$
  UPDATE rooms SET status = 'closed', closed_at = now(), rematch_state = NULL
  WHERE status = 'post_game'
    AND id IN (
      SELECT g.room_id FROM games g
      WHERE g.status = 'completed'
        AND g.completed_at < now() - interval '60 seconds'
      GROUP BY g.room_id
    );
  $$
);
