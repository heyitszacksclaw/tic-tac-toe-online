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
    const { allowed } = await checkRateLimit(user.id, RATE_LIMITS.ROOM_JOIN);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const roomCode = (body.roomCode || '').trim().toUpperCase();

    if (!roomCode || roomCode.length !== 6) {
      return NextResponse.json({ error: 'Invalid room code.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Check user is not already in a room
    const { data: profile } = await admin
      .from('profiles')
      .select('current_room_id')
      .eq('id', user.id)
      .single();

    if (profile?.current_room_id) {
      // Check if the existing room is still active
      const { data: existingRoom } = await admin
        .from('rooms')
        .select('room_code, status')
        .eq('id', profile.current_room_id)
        .single();

      if (existingRoom && existingRoom.status !== 'closed') {
        return NextResponse.json(
          { error: 'You are already in a room', roomCode: existingRoom.room_code },
          { status: 409 }
        );
      }

      // Stale reference — clear it
      await admin
        .from('profiles')
        .update({ current_room_id: null })
        .eq('id', user.id);
    }

    // Find the room
    const { data: room, error: roomError } = await admin
      .from('rooms')
      .select('id, room_code, status, player1_id, player2_id, creator_id')
      .eq('room_code', roomCode)
      .eq('status', 'waiting')
      .maybeSingle();

    if (roomError) {
      console.error('Room lookup error:', roomError);
      return NextResponse.json({ error: 'Failed to look up room.' }, { status: 500 });
    }

    if (!room) {
      return NextResponse.json({ error: 'Room not found or no longer available.' }, { status: 404 });
    }

    if (room.player2_id) {
      return NextResponse.json({ error: 'Room is full.' }, { status: 409 });
    }

    if (room.player1_id === user.id || room.creator_id === user.id) {
      return NextResponse.json({ error: 'You cannot join your own room.' }, { status: 409 });
    }

    // Set user as player2 and update room status to 'ready'
    const { error: updateError } = await admin
      .from('rooms')
      .update({ player2_id: user.id, status: 'ready' })
      .eq('id', room.id);

    if (updateError) {
      console.error('Room update error:', updateError);
      return NextResponse.json({ error: 'Failed to join room.' }, { status: 500 });
    }

    // Set user's current_room_id
    await admin
      .from('profiles')
      .update({ current_room_id: room.id })
      .eq('id', user.id);

    return NextResponse.json({ roomCode: room.room_code, roomId: room.id });
  } catch (err) {
    console.error('Unexpected error in /api/rooms/join:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
