import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, RATE_LIMITS.GAME_REMATCH);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { roomId } = body;

    if (!roomId) {
      return NextResponse.json({ error: 'roomId is required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch room
    const { data: room, error: roomError } = await admin
      .from('rooms')
      .select('id, status, player1_id, player2_id, rematch_state')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
    }

    // Verify user is a player in this room
    const isPlayer1 = room.player1_id === user.id;
    const isPlayer2 = room.player2_id === user.id;
    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: 'You are not a player in this room.' }, { status: 403 });
    }

    // Verify room is in post_game status
    if (room.status !== 'post_game') {
      return NextResponse.json({ error: 'Room is not in post-game state.' }, { status: 409 });
    }

    // Get the latest completed game to check deadline
    const { data: latestGame } = await admin
      .from('games')
      .select('id, completed_at, round_number, player_x, player_o')
      .eq('room_id', roomId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!latestGame || !latestGame.completed_at) {
      return NextResponse.json({ error: 'No completed game found.' }, { status: 409 });
    }

    // Verify rematch deadline hasn't expired (completed_at + 60 seconds)
    const deadline = new Date(new Date(latestGame.completed_at).getTime() + 60 * 1000);
    if (new Date() > deadline) {
      return NextResponse.json({ error: 'Rematch deadline has expired.' }, { status: 410 });
    }

    // Record rematch vote
    const currentState = (room.rematch_state as { votes: Record<string, boolean>; deadline: string } | null) || {
      votes: {},
      deadline: deadline.toISOString(),
    };

    currentState.votes[user.id] = true;
    currentState.deadline = deadline.toISOString();

    // Check if both players have voted
    const bothVoted =
      room.player1_id &&
      room.player2_id &&
      currentState.votes[room.player1_id] &&
      currentState.votes[room.player2_id];

    if (bothVoted) {
      // Both players want a rematch — create a new game
      const newRoundNumber = (latestGame.round_number ?? 1) + 1;

      // Randomly assign X and O
      const [playerX, playerO] = Math.random() < 0.5
        ? [room.player1_id, room.player2_id]
        : [room.player2_id, room.player1_id];

      const initialGameState = {
        board: [null, null, null, null, null, null, null, null, null],
        currentTurn: 'X',
        moveCount: 0,
        winningLine: null,
        lastMoveIndex: null,
        lastMoveTimestamp: null,
      };

      const turnDeadline = new Date(Date.now() + 30 * 1000).toISOString();

      // Create new game
      const { data: newGame, error: gameError } = await admin
        .from('games')
        .insert({
          room_id: roomId,
          game_type: 'tic_tac_toe',
          player_x: playerX,
          player_o: playerO,
          game_state: initialGameState,
          status: 'active',
          turn_deadline: turnDeadline,
          round_number: newRoundNumber,
        })
        .select('id')
        .single();

      if (gameError || !newGame) {
        console.error('New game creation error:', gameError);
        return NextResponse.json({ error: 'Failed to create new game.' }, { status: 500 });
      }

      // Update room: set status to playing, clear rematch_state
      await admin
        .from('rooms')
        .update({ status: 'playing', rematch_state: null })
        .eq('id', roomId);

      return NextResponse.json({ success: true, newGameStarted: true, gameId: newGame.id });
    } else {
      // Only one player voted — save the vote
      await admin
        .from('rooms')
        .update({ rematch_state: currentState })
        .eq('id', roomId);

      return NextResponse.json({ success: true, newGameStarted: false });
    }
  } catch (err) {
    console.error('Unexpected error in /api/game/rematch:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
