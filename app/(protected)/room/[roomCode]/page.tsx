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

  // Fetch room data including rematch_state
  const { data: room } = await admin
    .from('rooms')
    .select('id, room_code, status, creator_id, player1_id, player2_id, rematch_state')
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

  // If room is closed, go home with reason
  if (room.status === 'closed') {
    redirect('/home?reason=room_closed');
  }

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

  // If game is active/post_game, fetch the game data so we can pass it to the client
  let activeGame = null;
  let gameCompletedAt: string | null = null;
  if (room.status === 'playing' || room.status === 'post_game') {
    const { data: game } = await admin
      .from('games')
      .select(
        'id, room_id, player_x, player_o, game_state, status, winner_id, win_reason, turn_deadline, completed_at'
      )
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    activeGame = game ?? null;
    gameCompletedAt = game?.completed_at ?? null;
  }

  // Fetch profiles for X and O if game exists
  let playerXProfile = null;
  let playerOProfile = null;
  if (activeGame) {
    const allProfileIds = [activeGame.player_x, activeGame.player_o].filter(Boolean) as string[];
    const { data: gameProfiles } = await admin
      .from('profiles')
      .select('id, display_name, wins, losses, draws')
      .in('id', allProfileIds);

    playerXProfile = gameProfiles?.find((p) => p.id === activeGame.player_x) ?? null;
    playerOProfile = gameProfiles?.find((p) => p.id === activeGame.player_o) ?? null;
  }

  // Parse rematch state
  const rematchState = room.rematch_state as { votes: Record<string, boolean>; deadline: string } | null;

  return (
    <RoomClient
      roomCode={room.room_code}
      roomId={room.id}
      roomStatus={room.status}
      creatorId={room.creator_id}
      currentUser={{ id: user.id, displayName: currentProfile?.display_name || 'Player' }}
      initialPlayer1={player1}
      initialPlayer2={player2}
      initialGame={activeGame}
      playerXProfile={playerXProfile}
      playerOProfile={playerOProfile}
      initialRematchState={rematchState}
      initialCompletedAt={gameCompletedAt}
    />
  );
}
