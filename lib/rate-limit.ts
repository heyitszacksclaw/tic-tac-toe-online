import { createAdminClient } from '@/lib/supabase/admin';

type RateLimitConfig = {
  endpoint: string;
  maxRequests: number;
  windowSeconds?: number;
};

export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean }> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: config.endpoint,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds ?? 60,
    });

    if (error) {
      console.error('Rate limit check error:', error);
      // Fail open — allow the request if rate limiting itself fails
      return { allowed: true };
    }

    return { allowed: data === true };
  } catch (err) {
    console.error('Rate limit unexpected error:', err);
    // Fail open
    return { allowed: true };
  }
}

// Rate limit configs per PRD (all per-user, sliding window)
export const RATE_LIMITS = {
  ROOM_CREATE: { endpoint: 'rooms/create', maxRequests: 10 },       // RATE-1
  ROOM_JOIN: { endpoint: 'rooms/join', maxRequests: 10 },           // RATE-2
  ROOM_VALIDATE: { endpoint: 'rooms/validate', maxRequests: 10 },   // RATE-3
  GAME_MOVE: { endpoint: 'game/move', maxRequests: 20 },            // RATE-4
  ROOM_LEAVE: { endpoint: 'rooms/leave', maxRequests: 10 },
  GAME_START: { endpoint: 'game/start', maxRequests: 10 },
  GAME_FORFEIT: { endpoint: 'game/forfeit', maxRequests: 10 },
  GAME_TIMEOUT: { endpoint: 'game/timeout', maxRequests: 10 },
  GAME_REMATCH: { endpoint: 'game/rematch', maxRequests: 10 },
  USER_ACTIVE_ROOM: { endpoint: 'user/active-room', maxRequests: 30 },
} as const;
