'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import GameBoard from './GameBoard';

interface PlayerProfile {
  id: string;
  display_name: string;
  wins: number;
  losses: number;
  draws: number;
}

interface GameData {
  id: string;
  room_id: string;
  player_x: string;
  player_o: string;
  game_state: {
    board: (string | null)[];
    currentTurn: string;
    moveCount: number;
    winningLine: number[] | null;
    lastMoveIndex: number | null;
    lastMoveTimestamp: string | null;
  };
  status: string;
  winner_id: string | null;
  win_reason: string | null;
  turn_deadline: string;
  completed_at?: string | null;
}

interface RematchState {
  votes: Record<string, boolean>;
  deadline: string;
}

interface RoomClientProps {
  roomCode: string;
  roomId: string;
  roomStatus: string;
  creatorId: string;
  currentUser: { id: string; displayName: string };
  initialPlayer1: PlayerProfile | null;
  initialPlayer2: PlayerProfile | null;
  initialGame: GameData | null;
  playerXProfile: PlayerProfile | null;
  playerOProfile: PlayerProfile | null;
  initialRematchState: RematchState | null;
  initialCompletedAt: string | null;
}

export default function RoomClient({
  roomCode,
  roomId,
  roomStatus,
  creatorId,
  currentUser,
  initialPlayer1,
  initialPlayer2,
  initialGame,
  playerXProfile,
  playerOProfile,
  initialRematchState,
  initialCompletedAt,
}: RoomClientProps) {
  const [player1, setPlayer1] = useState<PlayerProfile | null>(initialPlayer1);
  const [player2, setPlayer2] = useState<PlayerProfile | null>(initialPlayer2);
  const [status, setStatus] = useState(roomStatus);
  const [game, setGame] = useState<GameData | null>(initialGame);
  const [xProfile, setXProfile] = useState<PlayerProfile | null>(playerXProfile);
  const [oProfile, setOProfile] = useState<PlayerProfile | null>(playerOProfile);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rematchState, setRematchState] = useState<RematchState | null>(initialRematchState);
  const [completedAt, setCompletedAt] = useState<string | null>(initialCompletedAt);
  const router = useRouter();
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isCreator = currentUser.id === creatorId;
  // Only the host can start the game
  const canStartGame = status === 'ready' && player1 && player2 && isCreator;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Fetch current game data
  const fetchGame = useCallback(async () => {
    const supabaseClient = createClient();
    const { data: gameRow } = await supabaseClient
      .from('games')
      .select(
        'id, room_id, player_x, player_o, game_state, status, winner_id, win_reason, turn_deadline, completed_at'
      )
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!gameRow) return;

    setGame(gameRow);
    if (gameRow.completed_at) {
      setCompletedAt(gameRow.completed_at);
    }

    // Fetch player profiles for X and O
    const ids = [gameRow.player_x, gameRow.player_o].filter(Boolean) as string[];
    const { data: gameProfiles } = await supabaseClient
      .from('profiles')
      .select('id, display_name, wins, losses, draws')
      .in('id', ids);

    if (gameProfiles) {
      setXProfile(gameProfiles.find((p) => p.id === gameRow.player_x) ?? null);
      setOProfile(gameProfiles.find((p) => p.id === gameRow.player_o) ?? null);
    }
  }, [roomId]);

  // Fetch rematch state from room
  const fetchRematchState = useCallback(async () => {
    const supabaseClient = createClient();
    const { data: room } = await supabaseClient
      .from('rooms')
      .select('rematch_state')
      .eq('id', roomId)
      .single();

    if (room) {
      setRematchState(room.rematch_state as RematchState | null);
    }
  }, [roomId]);

  // Refresh room data from DB
  const refreshRoom = useCallback(async () => {
    const supabaseClient = createClient();
    const { data: room } = await supabaseClient
      .from('rooms')
      .select('status, player1_id, player2_id, rematch_state')
      .eq('room_code', roomCode)
      .single();

    if (!room) return;

    setStatus(room.status);
    setRematchState(room.rematch_state as RematchState | null);

    if (room.player1_id) {
      const { data: p1 } = await supabaseClient
        .from('profiles')
        .select('id, display_name, wins, losses, draws')
        .eq('id', room.player1_id)
        .single();
      if (p1) setPlayer1(p1);
    }

    if (room.player2_id) {
      const { data: p2 } = await supabaseClient
        .from('profiles')
        .select('id, display_name, wins, losses, draws')
        .eq('id', room.player2_id)
        .single();
      if (p2) setPlayer2(p2);
    } else {
      setPlayer2(null);
    }
  }, [roomCode]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel(`room:${roomCode}`)
      .on('broadcast', { event: 'player_joined' }, async () => {
        showToast('A player has joined the room!');
        await refreshRoom();
      })
      .on('broadcast', { event: 'player_left' }, async () => {
        showToast('A player has left the room.');
        await refreshRoom();
      })
      .on('broadcast', { event: 'room_closing' }, () => {
        showToast('Room is closing...');
        setTimeout(() => router.push('/home'), 1500);
      })
      .on('broadcast', { event: 'game_starting' }, async () => {
        await fetchGame();
        setRematchState(null);
        setStatus('playing');
      })
      .on('broadcast', { event: 'player_left_game' }, async (payload: { payload: { userId: string } }) => {
        if (payload.payload.userId !== currentUser.id) {
          showToast('Your opponent left — You win!');
          await fetchGame();
        }
      })
      .on('broadcast', { event: 'rematch_vote' }, async () => {
        // Other player voted for rematch — refresh rematch state
        await fetchRematchState();
      })
      .on('broadcast', { event: 'rematch_starting' }, async () => {
        // Both players agreed — fetch new game data
        showToast('New game starting!');
        setRematchState(null);
        await fetchGame();
        setStatus('playing');
      })
      .on('broadcast', { event: 'player_left_postgame' }, (payload: { payload: { userId: string } }) => {
        if (payload.payload.userId !== currentUser.id) {
          showToast('Your opponent left the room.');
          setTimeout(() => router.push('/home?reason=room_closed'), 1500);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        // Presence state available via channel.presenceState()
      })
      .subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          await channel.track({
            userId: currentUser.id,
            displayName: currentUser.displayName,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, currentUser.id, currentUser.displayName]);

  // Postgres changes subscription for room table
  useEffect(() => {
    const dbChannel = supabase
      .channel(`room-db:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        async (payload) => {
          const newRoom = payload.new as { status: string; rematch_state: RematchState | null };
          const newStatus = newRoom.status;
          setStatus(newStatus);
          setRematchState(newRoom.rematch_state ?? null);

          if (newStatus === 'closed') {
            showToast('Room has been closed.');
            setTimeout(() => router.push('/home?reason=room_closed'), 1500);
          } else if (newStatus === 'ready') {
            await refreshRoom();
          } else if (newStatus === 'playing') {
            // Could be new game from rematch or initial game start
            await fetchGame();
            setRematchState(null);
          } else if (newStatus === 'post_game') {
            await fetchGame();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dbChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  async function handleLeaveRoom() {
    setError(null);
    setLoading('leave');

    try {
      const res = await fetch('/api/rooms/leave', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to leave room.');
        setLoading(null);
        return;
      }

      // Broadcast to others
      if (channelRef.current) {
        if (status === 'playing') {
          // Leaving during an active game — notify opponent of forfeit
          await channelRef.current.send({
            type: 'broadcast',
            event: 'player_left_game',
            payload: { userId: currentUser.id },
          });
        } else if (status === 'post_game') {
          // Leaving during post-game — notify opponent
          await channelRef.current.send({
            type: 'broadcast',
            event: 'player_left_postgame',
            payload: { userId: currentUser.id },
          });
        } else if (isCreator) {
          await channelRef.current.send({
            type: 'broadcast',
            event: 'room_closing',
            payload: { reason: 'creator_left' },
          });
        } else {
          await channelRef.current.send({
            type: 'broadcast',
            event: 'player_left',
            payload: { userId: currentUser.id },
          });
        }
      }

      router.push('/home');
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(null);
    }
  }

  async function handleStartGame() {
    setError(null);
    setLoading('start');

    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to start game.');
        setLoading(null);
        return;
      }

      // Broadcast game starting to both players
      if (channelRef.current) {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'game_starting',
          payload: { gameId: data.gameId },
        });
      }

      // Fetch game and update state
      await fetchGame();
      setStatus('playing');
      setLoading(null);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(null);
    }
  }

  async function handleRematch() {
    try {
      const res = await fetch('/api/game/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to request rematch.');
        return;
      }

      // Broadcast vote event for the other player
      if (channelRef.current) {
        if (data.newGameStarted) {
          // Both voted — broadcast rematch_starting
          await channelRef.current.send({
            type: 'broadcast',
            event: 'rematch_starting',
            payload: { gameId: data.gameId },
          });
          // Fetch new game for this client too
          await fetchGame();
          setRematchState(null);
          setStatus('playing');
        } else {
          // Only my vote — broadcast rematch_vote
          await channelRef.current.send({
            type: 'broadcast',
            event: 'rematch_vote',
            payload: { userId: currentUser.id },
          });
          // Update local rematch state
          await fetchRematchState();
        }
      }
    } catch {
      showToast('Network error. Please try again.');
    }
  }

  async function handleLeavePostGame() {
    await handleLeaveRoom();
  }

  // ─── Render game board when playing or post_game ──────────────────────────

  if ((status === 'playing' || status === 'post_game') && game && xProfile && oProfile) {
    return (
      <>
        {/* Toast for room events */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl bg-[var(--color-surface-light)] border border-[var(--color-border-strong)] text-sm font-medium shadow-[var(--shadow-lg)]"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
        <GameBoard
          game={game}
          currentUser={currentUser}
          playerX={xProfile}
          playerO={oProfile}
          roomId={roomId}
          roomCode={roomCode}
          onRematch={handleRematch}
          onLeaveRoom={handleLeavePostGame}
          rematchState={rematchState}
          completedAt={completedAt}
        />
      </>
    );
  }

  // ─── Lobby UI ─────────────────────────────────────────────────────────────

  // Format room code with space in middle (e.g., "AB3 K9F")
  const displayCode = `${roomCode.slice(0, 3)} ${roomCode.slice(3)}`;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/20 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <line x1="4" y1="4" x2="16" y2="16" stroke="var(--color-x)" strokeWidth="3" strokeLinecap="round" />
              <line x1="16" y1="4" x2="4" y2="16" stroke="var(--color-x)" strokeWidth="3" strokeLinecap="round" />
              <circle cx="30" cy="10" r="7" stroke="var(--color-o)" strokeWidth="3" fill="none" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight">Tic Tac Toe Online</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-medium hidden sm:inline ${status === 'ready' ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
            {status === 'waiting' ? 'Waiting for opponent' : status === 'ready' ? 'Ready to play' : status}
          </span>
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              status === 'ready' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'
            }`}
            style={status === 'ready'
              ? { boxShadow: '0 0 6px var(--color-success)' }
              : { boxShadow: '0 0 6px var(--color-warning)' }
            }
          />
        </div>
      </header>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-[var(--color-surface-light)] border border-[var(--color-border-strong)] text-sm font-medium shadow-[var(--shadow-lg)]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg space-y-10">

          {/* Room Code Display */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-4 font-semibold">
              Room Code
            </p>
            <div className="inline-flex items-center gap-4 mb-4">
              <span className="text-5xl sm:text-6xl font-mono font-bold tracking-wider text-[var(--color-text)]"
                style={{ letterSpacing: '0.12em' }}
              >
                {displayCode}
              </span>
              <div className="relative">
                <button
                  onClick={handleCopyCode}
                  className="p-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-strong)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-dim)] transition-all"
                  title="Copy room code"
                >
                  {copied ? (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-[var(--color-success)]">
                      <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-[var(--color-text-muted)]">
                      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M11 5V3.5A1.5 1.5 0 009.5 2H3.5A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
                <AnimatePresence>
                  {copied && (
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-[var(--color-success)] whitespace-nowrap font-medium"
                    >
                      Copied!
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Share this code with your opponent to let them join
            </p>
          </motion.div>

          {/* Players */}
          <div className="grid grid-cols-2 gap-4">
            {/* Player 1 */}
            <PlayerCard
              player={player1}
              label="Player 1"
              isCurrentUser={player1?.id === currentUser.id}
              isCreator={player1?.id === creatorId}
              delay={0.1}
            />
            {/* Player 2 */}
            <PlayerCard
              player={player2}
              label="Player 2"
              isCurrentUser={player2?.id === currentUser.id}
              isCreator={player2?.id === creatorId}
              isWaiting={!player2}
              delay={0.2}
            />
          </div>

          {/* Status Message */}
          <AnimatePresence mode="wait">
            {status === 'waiting' && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-3 py-4 px-5 rounded-2xl bg-[var(--color-warning-dim)] border border-[var(--color-warning)]/20 text-sm text-[var(--color-warning)] font-medium"
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-warning)]"></span>
                </span>
                Waiting for opponent to join...
              </motion.div>
            )}
            {status === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-3 py-4 px-5 rounded-2xl bg-[var(--color-success-dim)] border border-[var(--color-success)]/20 text-sm text-[var(--color-success)] font-medium"
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-success)]"></span>
                </span>
                Both players present — ready to play!
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 rounded-xl bg-[var(--color-danger-dim)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] text-sm text-center"
            >
              {error}
            </motion.div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {/* Start Game — only the host can start */}
            {status === 'ready' && isCreator && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={handleStartGame}
                disabled={!canStartGame || loading === 'start'}
                className="btn-primary w-full text-base py-5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                style={{ fontSize: '1.0625rem' }}
              >
                {loading === 'start' ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner />
                    Starting game...
                  </span>
                ) : (
                  <>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                      <polygon points="8,4 18,11 8,18" fill="currentColor" />
                    </svg>
                    Start Game
                  </>
                )}
              </motion.button>
            )}

            {/* Non-host waiting message */}
            {status === 'ready' && !isCreator && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="w-full px-6 py-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] text-sm text-center"
              >
                Waiting for host to start the game...
              </motion.div>
            )}

            {/* Waiting status when only one player */}
            {status === 'waiting' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="w-full px-6 py-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] text-sm text-center"
              >
                Waiting for another player to join...
              </motion.div>
            )}

            {/* Leave Room */}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              onClick={handleLeaveRoom}
              disabled={loading === 'leave'}
              className="w-full px-6 py-3.5 rounded-xl bg-transparent hover:bg-[var(--color-danger-dim)] border border-[var(--color-border)] hover:border-[var(--color-danger)]/30 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading === 'leave' ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  Leaving...
                </span>
              ) : (
                isCreator ? 'Close Room & Leave' : 'Leave Room'
              )}
            </motion.button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  label,
  mark,
  markColor,
  isCurrentUser,
  isCreator,
  isWaiting = false,
  delay = 0,
}: {
  player: PlayerProfile | null;
  label: string;
  mark?: string;
  markColor?: string;
  isCurrentUser: boolean;
  isCreator: boolean;
  isWaiting?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={`p-5 rounded-2xl border transition-colors ${
        isWaiting
          ? 'bg-[var(--color-surface)]/40 border-[var(--color-border)] border-dashed'
          : isCurrentUser
          ? 'bg-[var(--color-primary)]/8 border-[var(--color-primary)]/30'
          : 'bg-[var(--color-surface)] border-[var(--color-border-strong)]'
      }`}
      style={isCurrentUser && !isWaiting ? { background: 'rgba(99,102,241,0.07)' } : undefined}
    >
      {isWaiting ? (
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface)] border border-dashed border-[var(--color-border-strong)] flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="text-[var(--color-text-subtle)]" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">{label}</p>
          <p className="text-xs text-[var(--color-text-subtle)]">Waiting...</p>
        </div>
      ) : (
        <>
          {/* Avatar + Mark */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold flex-shrink-0 ${
                  isCurrentUser
                    ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                    : 'bg-[var(--color-surface-light)] text-[var(--color-text-muted)]'
                }`}
              >
                {player?.display_name?.[0]?.toUpperCase() || '?'}
              </div>
              {/* Mark badge — only shown when mark is assigned (during game, not lobby) */}
              {mark && markColor && (
                <span
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black border-2 border-[var(--color-bg)]"
                  style={{ background: markColor, color: '#0a0a0f' }}
                >
                  {mark}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="text-sm font-bold truncate">
                  {player?.display_name || 'Player'}
                </span>
                {isCurrentUser && (
                  <span className="text-xs bg-[var(--color-primary-dim)] text-[var(--color-primary)] font-semibold px-1.5 py-0.5 rounded-md shrink-0">you</span>
                )}
                {isCreator && (
                  <span className="text-xs bg-[var(--color-warning-dim)] text-[var(--color-warning)] font-semibold px-1.5 py-0.5 rounded-md shrink-0">host</span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-subtle)]">{label}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatBadge label="W" value={player?.wins ?? 0} color="var(--color-success)" />
            <StatBadge label="L" value={player?.losses ?? 0} color="var(--color-danger)" />
            <StatBadge label="D" value={player?.draws ?? 0} color="var(--color-warning)" />
          </div>
        </>
      )}
    </motion.div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-2 py-2.5 rounded-xl bg-[var(--color-bg)]/70 border border-[var(--color-border)]/50">
      <p className="text-sm font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-[var(--color-text-subtle)] font-medium">{label}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
      <path d="M8 2a6 6 0 016 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
