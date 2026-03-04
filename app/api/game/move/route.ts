import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// Win detection — all 8 lines (GAME-4, SEC-5)
const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],             // diags
];

function checkWin(board: (string | null)[]): { winner: string; line: number[] } | null {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a]!, line };
    }
  }
  return null;
}

function checkDraw(board: (string | null)[]): boolean {
  return board.every((cell) => cell !== null);
}

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

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, RATE_LIMITS.GAME_MOVE);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { gameId, cellIndex } = body;

    if (!gameId || cellIndex === undefined || cellIndex === null) {
      return NextResponse.json({ error: 'gameId and cellIndex are required.' }, { status: 400 });
    }

    if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) {
      return NextResponse.json({ error: 'Invalid cellIndex (must be 0–8).' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 2. Game exists and status is 'active'
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

    // 3. User is a player in this game (SEC-5)
    const isPlayerX = game.player_x === user.id;
    const isPlayerO = game.player_o === user.id;
    if (!isPlayerX && !isPlayerO) {
      return NextResponse.json({ error: 'You are not a player in this game.' }, { status: 403 });
    }

    const gameState = game.game_state as {
      board: (string | null)[];
      currentTurn: string;
      moveCount: number;
      winningLine: number[] | null;
      lastMoveIndex: number | null;
      lastMoveTimestamp: string | null;
    };

    // 4. It is the user's turn (SEC-5)
    const userMark = isPlayerX ? 'X' : 'O';
    if (gameState.currentTurn !== userMark) {
      return NextResponse.json({ error: 'It is not your turn.' }, { status: 409 });
    }

    // 5. Cell is empty (SEC-5)
    if (gameState.board[cellIndex] !== null) {
      return NextResponse.json({ error: 'Cell is already occupied.' }, { status: 409 });
    }

    // 6. Turn deadline has not expired (TURN-3, SEC-5)
    const now = new Date();
    const deadline = new Date(game.turn_deadline);
    if (now > deadline) {
      return NextResponse.json({ error: 'Turn time has expired.' }, { status: 409 });
    }

    // 7. Apply move
    const newBoard = [...gameState.board];
    newBoard[cellIndex] = userMark;
    const newMoveCount = gameState.moveCount + 1;
    const timestamp = now.toISOString();

    // 8. Check win (GAME-4)
    const winResult = checkWin(newBoard);
    if (winResult) {
      const loserId = isPlayerX ? game.player_o : game.player_x;

      // Update stats: winner +wins, loser +losses (STAT-1)
      await Promise.all([
        incrementStat(admin, user.id, 'wins'),
        incrementStat(admin, loserId, 'losses'),
      ]);

      const finalState = {
        ...gameState,
        board: newBoard,
        moveCount: newMoveCount,
        winningLine: winResult.line,
        lastMoveIndex: cellIndex,
        lastMoveTimestamp: timestamp,
      };

      await admin
        .from('games')
        .update({
          game_state: finalState,
          status: 'completed',
          winner_id: user.id,
          win_reason: 'three_in_row',
          completed_at: timestamp,
        })
        .eq('id', gameId);

      // Update room to post_game
      await admin
        .from('rooms')
        .update({ status: 'post_game' })
        .eq('id', game.room_id);

      return NextResponse.json({
        gameState: finalState,
        result: 'win',
        winner: user.id,
      });
    }

    // 9. Check draw (GAME-5)
    if (checkDraw(newBoard)) {
      // Both players get draws+1 (STAT-2)
      await Promise.all([
        incrementStat(admin, game.player_x, 'draws'),
        incrementStat(admin, game.player_o, 'draws'),
      ]);

      const finalState = {
        ...gameState,
        board: newBoard,
        moveCount: newMoveCount,
        winningLine: null,
        lastMoveIndex: cellIndex,
        lastMoveTimestamp: timestamp,
      };

      await admin
        .from('games')
        .update({
          game_state: finalState,
          status: 'completed',
          win_reason: 'draw',
          completed_at: timestamp,
        })
        .eq('id', gameId);

      // Update room to post_game
      await admin
        .from('rooms')
        .update({ status: 'post_game' })
        .eq('id', game.room_id);

      return NextResponse.json({
        gameState: finalState,
        result: 'draw',
      });
    }

    // 10. Continue: switch turns, set new 30s deadline (TURN-1)
    const nextTurn = userMark === 'X' ? 'O' : 'X';
    const newDeadline = new Date(Date.now() + 30 * 1000).toISOString();

    const continueState = {
      ...gameState,
      board: newBoard,
      currentTurn: nextTurn,
      moveCount: newMoveCount,
      winningLine: null,
      lastMoveIndex: cellIndex,
      lastMoveTimestamp: timestamp,
    };

    // 11. Update game row (RT-1: postgres_changes will broadcast to both clients)
    await admin
      .from('games')
      .update({
        game_state: continueState,
        turn_deadline: newDeadline,
      })
      .eq('id', gameId);

    return NextResponse.json({
      gameState: continueState,
      result: 'continue',
    });
  } catch (err) {
    console.error('Unexpected error in /api/game/move:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
