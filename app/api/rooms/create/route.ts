import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import crypto from 'crypto';

// Charset: no I, O, 0, 1 for readability
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length];
  }
  return code;
}

export async function POST() {
  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, RATE_LIMITS.ROOM_CREATE);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
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

    // Generate a unique room code
    let roomCode = '';
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generateRoomCode();
      // Check uniqueness among active rooms
      const { data: existing } = await admin
        .from('rooms')
        .select('id')
        .eq('room_code', candidate)
        .neq('status', 'closed')
        .maybeSingle();

      if (!existing) {
        roomCode = candidate;
        break;
      }
      attempts++;
    }

    if (!roomCode) {
      return NextResponse.json({ error: 'Failed to generate a unique room code. Try again.' }, { status: 500 });
    }

    // Create the room
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data: room, error: roomError } = await admin
      .from('rooms')
      .insert({
        room_code: roomCode,
        creator_id: user.id,
        player1_id: user.id,
        status: 'waiting',
        expires_at: expiresAt,
      })
      .select('id, room_code')
      .single();

    if (roomError || !room) {
      console.error('Room creation error:', roomError);
      return NextResponse.json({ error: 'Failed to create room.' }, { status: 500 });
    }

    // Set user's current_room_id
    await admin
      .from('profiles')
      .update({ current_room_id: room.id })
      .eq('id', user.id);

    return NextResponse.json({ roomCode: room.room_code, roomId: room.id });
  } catch (err) {
    console.error('Unexpected error in /api/rooms/create:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
