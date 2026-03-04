import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, RATE_LIMITS.ROOM_VALIDATE);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const code = (searchParams.get('code') || '').trim().toUpperCase();

    if (!code || code.length !== 6) {
      return NextResponse.json({ valid: false, reason: 'Invalid room code format.' });
    }

    const admin = createAdminClient();

    const { data: room } = await admin
      .from('rooms')
      .select('id, status, player1_id, player2_id')
      .eq('room_code', code)
      .neq('status', 'closed')
      .maybeSingle();

    if (!room) {
      return NextResponse.json({ valid: false, reason: 'Room not found.' });
    }

    if (room.status !== 'waiting') {
      return NextResponse.json({ valid: false, reason: 'Room is no longer accepting players.' });
    }

    if (room.player2_id) {
      return NextResponse.json({ valid: false, reason: 'Room is full.' });
    }

    const playerCount = room.player1_id ? 1 : 0;
    return NextResponse.json({ valid: true, playerCount });
  } catch (err) {
    console.error('Unexpected error in /api/rooms/validate:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
