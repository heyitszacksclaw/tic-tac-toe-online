import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

async function incrementStat(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  stat: 'wins' | 'losses' | 'draws'
) {
  const { data: profile } = await admin
    .from('profiles')
    .select('wins, losses, draws')
    .eq('id', userId)
    .single();

  if (profile) {
    await admin
      .from('profiles')
      .update({ [stat]: ((profile as Record<string, number>)[stat] ?? 0) + 1 })
      .eq('id', userId);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth check (SEC-1)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, RATE_LIMITS.GAME_FORFEIT);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { gameId } = body;

    if (!gameId) {
      return NextResponse.json({ error: 'gameId is required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch game
    const { data: game, error: gameError } = await admin
      .from('games')
      .select('id, room_id, player_x, player_o, status, winner_id')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found.' }, { status: 404 });
    }

    if (game.status !== 'active') {
      return NextResponse.json({ error: 'Game is not active.' }, { status: 409 });
    }

    if (game.winner_id) {
      return NextResponse.json({ error: 'Game already has a winner.' }, { status: 409 });
    }

    // User must be a player (GAME-10)
    const isPlayerX = game.player_x === user.id;
    const isPlayerO = game.player_o === user.id;
    if (!isPlayerX && !isPlayerO) {
      return NextResponse.json({ error: 'You are not a player in this game.' }, { status: 403 });
    }

    // Forfeiting user loses; opponent wins
    const opponentId = isPlayerX ? game.player_o : game.player_x;
    const timestamp = new Date().toISOString();

    // Update stats (STAT-1)
    await Promise.all([
      incrementStat(admin, user.id, 'losses'),
      incrementStat(admin, opponentId, 'wins'),
    ]);

    // Update game
    await admin
      .from('games')
      .update({
        status: 'completed',
        winner_id: opponentId,
        win_reason: 'forfeit',
        completed_at: timestamp,
      })
      .eq('id', gameId);

    // Update room to post_game
    await admin
      .from('rooms')
      .update({ status: 'post_game' })
      .eq('id', game.room_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error in /api/game/forfeit:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
