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
    } else {
      // Post-game or playing — just clear the user's room reference
      await admin
        .from('profiles')
        .update({ current_room_id: null })
        .eq('id', user.id);

      // If room is in post_game and both players are leaving, close it
      if (room.status === 'post_game') {
        // Check if the other player is also gone
        const otherId = room.player1_id === user.id ? room.player2_id : room.player1_id;
        if (otherId) {
          const { data: otherProfile } = await admin
            .from('profiles')
            .select('current_room_id')
            .eq('id', otherId)
            .single();
          if (!otherProfile?.current_room_id) {
            await admin
              .from('rooms')
              .update({ status: 'closed', closed_at: new Date().toISOString() })
              .eq('id', room.id);
          }
        } else {
          await admin
            .from('rooms')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .eq('id', room.id);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error in /api/rooms/leave:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
