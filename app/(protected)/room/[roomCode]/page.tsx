import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import RoomClient from './RoomClient';

interface RoomPageProps {
  params: Promise<{ roomCode: string }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomCode } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const admin = createAdminClient();

  // Fetch room data
  const { data: room } = await admin
    .from('rooms')
    .select('id, room_code, status, creator_id, player1_id, player2_id')
    .eq('room_code', roomCode.toUpperCase())
    .single();

  if (!room) {
    redirect('/home');
  }

  // Verify user belongs to this room
  const isParticipant =
    room.player1_id === user.id ||
    room.player2_id === user.id ||
    room.creator_id === user.id;

  if (!isParticipant) {
    redirect('/home');
  }

  // If room is closed, go home
  if (room.status === 'closed') {
    redirect('/home');
  }

  // If game is already playing, redirect to game page (future milestone)
  // For now, stay on room page

  // Fetch player profiles
  const playerIds = [room.player1_id, room.player2_id].filter(Boolean) as string[];
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, wins, losses, draws')
    .in('id', playerIds);

  const player1 = profiles?.find((p) => p.id === room.player1_id) ?? null;
  const player2 = profiles?.find((p) => p.id === room.player2_id) ?? null;

  // Get current user's profile
  const { data: currentProfile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  return (
    <RoomClient
      roomCode={room.room_code}
      roomId={room.id}
      roomStatus={room.status}
      creatorId={room.creator_id}
      currentUser={{ id: user.id, displayName: currentProfile?.display_name || 'Player' }}
      initialPlayer1={player1}
      initialPlayer2={player2}
    />
  );
}
