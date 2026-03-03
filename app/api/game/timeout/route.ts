import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    // 1. Auth check (SEC-1)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { gameId } = body;

    if (!gameId) {
      return NextResponse.json({ error: 'gameId is required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 2. Game is active
    const { data: game, error: gameError } = await admin
      .from('games')
      .select('id, room_id, player_x, player_o, game_state, status, winner_id, turn_deadline')
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

    // 3. User is a player — and must be the OPPONENT (claiming timeout on the other player)
    const isPlayerX = game.player_x === user.id;
    const isPlayerO = game.player_o === user.id;
    if (!isPlayerX && !isPlayerO) {
      return NextResponse.json({ error: 'You are not a player in this game.' }, { status: 403 });
    }

    const gameState = game.game_state as { currentTurn: string };

    // The current turn player is the one who timed out — must NOT be the claiming user
    const userMark = isPlayerX ? 'X' : 'O';
    if (gameState.currentTurn === userMark) {
      return NextResponse.json(
        { error: 'You cannot claim timeout on yourself.' },
        { status: 409 }
      );
    }

    // 4. Server-side deadline check (TURN-3, TURN-6)
    const now = new Date();
    const deadline = new Date(game.turn_deadline);
    if (now <= deadline) {
      return NextResponse.json(
        { error: 'Turn deadline has not expired yet.' },
        { status: 409 }
      );
    }

    // 5. Determine the timed-out player and the winner (claiming user)
    const timedOutPlayerId = gameState.currentTurn === 'X' ? game.player_x : game.player_o;
    const timestamp = now.toISOString();

    // Update stats: winner +wins, loser +losses (STAT-1)
    await Promise.all([
      incrementStat(admin, user.id, 'wins'),
      incrementStat(admin, timedOutPlayerId, 'losses'),
    ]);

    const finalState = {
      ...gameState,
      winningLine: null,
    };

    // Update game
    await admin
      .from('games')
      .update({
        game_state: finalState,
        status: 'completed',
        winner_id: user.id,
        win_reason: 'timeout',
        completed_at: timestamp,
      })
      .eq('id', gameId);

    // Update room to post_game
    await admin
      .from('rooms')
      .update({ status: 'post_game' })
      .eq('id', game.room_id);

    return NextResponse.json({ success: true, winner: user.id, reason: 'timeout' });
  } catch (err) {
    console.error('Unexpected error in /api/game/timeout:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
