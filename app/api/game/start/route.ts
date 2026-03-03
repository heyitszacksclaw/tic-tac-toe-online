import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { roomId } = body;

    if (!roomId) {
      return NextResponse.json({ error: 'roomId is required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch the room and verify it's ready
    const { data: room, error: roomError } = await admin
      .from('rooms')
      .select('id, status, player1_id, player2_id, creator_id')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
    }

    // Verify the requesting user is a player in the room (LOBBY-2: either player can start)
    if (room.player1_id !== user.id && room.player2_id !== user.id) {
      return NextResponse.json({ error: 'You are not a player in this room.' }, { status: 403 });
    }

    if (room.status !== 'ready') {
      return NextResponse.json({ error: 'Room is not ready. Need 2 players.' }, { status: 409 });
    }

    if (!room.player1_id || !room.player2_id) {
      return NextResponse.json({ error: 'Room needs 2 players to start.' }, { status: 409 });
    }

    // Randomly assign X and O
    const [playerX, playerO] = Math.random() < 0.5
      ? [room.player1_id, room.player2_id]
      : [room.player2_id, room.player1_id];

    // Initial game state
    const initialGameState = {
      board: [null, null, null, null, null, null, null, null, null],
      currentTurn: 'X',
      moveCount: 0,
      winningLine: null,
      lastMoveIndex: null,
      lastMoveTimestamp: null,
    };

    const turnDeadline = new Date(Date.now() + 30 * 1000).toISOString();

    // Create game row
    const { data: game, error: gameError } = await admin
      .from('games')
      .insert({
        room_id: roomId,
        game_type: 'tic_tac_toe',
        player_x: playerX,
        player_o: playerO,
        game_state: initialGameState,
        status: 'active',
        turn_deadline: turnDeadline,
        round_number: 1,
      })
      .select('id')
      .single();

    if (gameError || !game) {
      console.error('Game creation error:', gameError);
      return NextResponse.json({ error: 'Failed to create game.' }, { status: 500 });
    }

    // Update room status to 'playing'
    await admin
      .from('rooms')
      .update({ status: 'playing' })
      .eq('id', roomId);

    return NextResponse.json({ gameId: game.id });
  } catch (err) {
    console.error('Unexpected error in /api/game/start:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
