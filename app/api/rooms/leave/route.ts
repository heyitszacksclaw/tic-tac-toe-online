import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get user's current room
    const { data: profile } = await admin
      .from('profiles')
      .select('current_room_id')
      .eq('id', user.id)
      .single();

    if (!profile?.current_room_id) {
      return NextResponse.json({ success: true });
    }

    const { data: room } = await admin
      .from('rooms')
      .select('id, status, creator_id, player1_id, player2_id')
      .eq('id', profile.current_room_id)
      .single();

    if (!room) {
      // Clear stale reference
      await admin.from('profiles').update({ current_room_id: null }).eq('id', user.id);
      return NextResponse.json({ success: true });
    }

    const isCreator = room.creator_id === user.id;
    const isPreGame = room.status === 'waiting' || room.status === 'ready';

    if (isCreator && isPreGame) {
      // Creator leaving: close the room, clear both players
      await admin
        .from('rooms')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', room.id);

      // Clear current_room_id for both players
      const playerIds = [room.player1_id, room.player2_id].filter(Boolean) as string[];
      if (playerIds.length > 0) {
        await admin
          .from('profiles')
          .update({ current_room_id: null })
          .in('id', playerIds);
      }
    } else if (!isCreator && isPreGame) {
      // Non-creator leaving pre-game: remove player2, set room back to waiting
      await admin
        .from('rooms')
        .update({ player2_id: null, status: 'waiting' })
        .eq('id', room.id);

      await admin
        .from('profiles')
        .update({ current_room_id: null })
        .eq('id', user.id);
    } else if (room.status === 'playing') {
      // Leaving during an active game = forfeit
      const { data: activeGame } = await admin
        .from('games')
        .select('id, player_x, player_o, status')
        .eq('room_id', room.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (activeGame) {
        const isPlayerX = activeGame.player_x === user.id;
        const opponentId = isPlayerX ? activeGame.player_o : activeGame.player_x;
        const timestamp = new Date().toISOString();

        // Update stats: leaving player gets a loss, opponent gets a win
        const { data: leaverProfile } = await admin
          .from('profiles')
          .select('losses')
          .eq('id', user.id)
          .single();
        if (leaverProfile) {
          await admin
            .from('profiles')
            .update({ losses: (leaverProfile.losses ?? 0) + 1 })
            .eq('id', user.id);
        }

        const { data: opponentProfile } = await admin
          .from('profiles')
          .select('wins')
          .eq('id', opponentId)
          .single();
        if (opponentProfile) {
          await admin
            .from('profiles')
            .update({ wins: (opponentProfile.wins ?? 0) + 1 })
            .eq('id', opponentId);
        }

        // Mark game as completed with forfeit
        await admin
          .from('games')
          .update({
            status: 'completed',
            winner_id: opponentId,
            win_reason: 'forfeit',
            completed_at: timestamp,
          })
          .eq('id', activeGame.id);
      }

      // Close the room and clear both players
      await admin
        .from('rooms')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', room.id);

      const playerIds = [room.player1_id, room.player2_id].filter(Boolean) as string[];
      if (playerIds.length > 0) {
        await admin
          .from('profiles')
          .update({ current_room_id: null })
          .in('id', playerIds);
      }
    } else if (room.status === 'post_game') {
      // Leaving during post-game: immediately close the room and clear both players
      await admin
        .from('rooms')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          rematch_state: null,
        })
        .eq('id', room.id);

      // Clear BOTH players' current_room_id
      const playerIds = [room.player1_id, room.player2_id].filter(Boolean) as string[];
      if (playerIds.length > 0) {
        await admin
          .from('profiles')
          .update({ current_room_id: null })
          .in('id', playerIds);
      }
    } else {
      // Closed or other status — just clear the user's room reference
      await admin
        .from('profiles')
        .update({ current_room_id: null })
        .eq('id', user.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error in /api/rooms/leave:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
