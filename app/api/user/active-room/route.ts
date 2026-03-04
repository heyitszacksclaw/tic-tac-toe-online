import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET() {
  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, RATE_LIMITS.USER_ACTIVE_ROOM);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const admin = createAdminClient();

    // Get user's current room
    const { data: profile } = await admin
      .from('profiles')
      .select('current_room_id')
      .eq('id', user.id)
      .single();

    if (!profile?.current_room_id) {
      return NextResponse.json({ roomCode: null });
    }

    // Look up the room
    const { data: room } = await admin
      .from('rooms')
      .select('id, room_code, status')
      .eq('id', profile.current_room_id)
      .single();

    if (!room || room.status === 'closed') {
      // Clear stale reference
      await admin.from('profiles').update({ current_room_id: null }).eq('id', user.id);
      return NextResponse.json({ roomCode: null });
    }

    return NextResponse.json({ roomCode: room.room_code, roomId: room.id, status: room.status });
  } catch (err) {
    console.error('Unexpected error in /api/user/active-room:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
