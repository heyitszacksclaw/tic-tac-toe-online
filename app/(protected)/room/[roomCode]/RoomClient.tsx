'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface PlayerProfile {
  id: string;
  display_name: string;
  wins: number;
  losses: number;
  draws: number;
}

interface RoomClientProps {
  roomCode: string;
  roomId: string;
  roomStatus: string;
  creatorId: string;
  currentUser: { id: string; displayName: string };
  initialPlayer1: PlayerProfile | null;
  initialPlayer2: PlayerProfile | null;
}

export default function RoomClient({
  roomCode,
  roomId,
  roomStatus,
  creatorId,
  currentUser,
  initialPlayer1,
  initialPlayer2,
}: RoomClientProps) {
  const [player1, setPlayer1] = useState<PlayerProfile | null>(initialPlayer1);
  const [player2, setPlayer2] = useState<PlayerProfile | null>(initialPlayer2);
  const [status, setStatus] = useState(roomStatus);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isCreator = currentUser.id === creatorId;
  const canStartGame = isCreator && status === 'ready' && player1 && player2;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Refresh room data from DB
  const refreshRoom = useCallback(async () => {
    const res = await fetch(`/api/rooms/validate?code=${roomCode}`);
    // Also fetch fresh player data
    const supabaseClient = createClient();
    const { data: room } = await supabaseClient
      .from('rooms')
      .select('status, player1_id, player2_id')
      .eq('room_code', roomCode)
      .single();

    if (!room) return;

    setStatus(room.status);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      .on('broadcast', { event: 'game_starting' }, ({ payload }) => {
        const gameId = payload?.gameId as string | undefined;
        if (gameId) {
          router.push(`/room/${roomCode}/game/${gameId}`);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        // Presence state available via channel.presenceState()
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
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
          const newStatus = (payload.new as { status: string }).status;
          setStatus(newStatus);

          if (newStatus === 'closed') {
            showToast('Room has been closed.');
            setTimeout(() => router.push('/home'), 1500);
          } else if (newStatus === 'ready') {
            await refreshRoom();
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
      // Fallback
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
        if (isCreator) {
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

      // Redirect creator to game page
      router.push(`/room/${roomCode}/game/${data.gameId}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(null);
    }
  }

  // Format room code with space in middle (e.g., "AB3 K9F")
  const displayCode = `${roomCode.slice(0, 3)} ${roomCode.slice(3)}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 40 40" fill="none">
              <line x1="4" y1="4" x2="16" y2="16" stroke="var(--color-x)" strokeWidth="3" strokeLinecap="round" />
              <line x1="16" y1="4" x2="4" y2="16" stroke="var(--color-x)" strokeWidth="3" strokeLinecap="round" />
              <circle cx="30" cy="10" r="7" stroke="var(--color-o)" strokeWidth="3" fill="none" />
            </svg>
          </div>
          <span className="text-sm font-semibold">Tic Tac Toe Online</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-text-muted)] hidden sm:inline">
            {status === 'waiting' ? 'Waiting for opponent...' : status === 'ready' ? 'Ready to play' : status}
          </span>
          <div
            className={`w-2 h-2 rounded-full ${
              status === 'ready' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'
            }`}
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
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-8">

          {/* Room Code Display */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center"
          >
            <p className="text-xs uppercase tracking-widest text-[var(--color-text-muted)] mb-3 font-medium">
              Room Code
            </p>
            <div className="inline-flex items-center gap-3">
              <span className="text-4xl sm:text-5xl font-mono font-bold tracking-wider text-[var(--color-text)]">
                {displayCode}
              </span>
              <div className="relative">
                <button
                  onClick={handleCopyCode}
                  className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors"
                  title="Copy room code"
                >
                  {copied ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--color-success)]">
                      <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--color-text-muted)]">
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
                      className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-[var(--color-success)] whitespace-nowrap"
                    >
                      Copied!
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-4">
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
                className="flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-warning)]"></span>
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
                className="flex items-center justify-center gap-2 text-sm text-[var(--color-success)]"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-success)]"></span>
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
              className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
            >
              {error}
            </motion.div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {/* Start Game — only creator sees this */}
            {isCreator && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={handleStartGame}
                disabled={!canStartGame || loading === 'start'}
                className="w-full px-6 py-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-base"
              >
                {loading === 'start' ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner />
                    Starting game...
                  </span>
                ) : (
                  'Start Game'
                )}
              </motion.button>
            )}

            {/* Non-creator sees waiting for host */}
            {!isCreator && status !== 'ready' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="w-full px-6 py-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] text-sm text-center"
              >
                Waiting for host to start the game...
              </motion.div>
            )}

            {!isCreator && status === 'ready' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="w-full px-6 py-4 rounded-xl bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 text-[var(--color-success)] text-sm text-center font-medium"
              >
                Ready! Waiting for host to start...
              </motion.div>
            )}

            {/* Leave Room */}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              onClick={handleLeaveRoom}
              disabled={loading === 'leave'}
              className="w-full px-6 py-3 rounded-xl bg-transparent hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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

// Player card component
function PlayerCard({
  player,
  label,
  isCurrentUser,
  isCreator,
  isWaiting = false,
  delay = 0,
}: {
  player: PlayerProfile | null;
  label: string;
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
      className={`p-4 rounded-xl border transition-colors ${
        isWaiting
          ? 'bg-[var(--color-surface)]/50 border-[var(--color-border)] border-dashed'
          : isCurrentUser
          ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/30'
          : 'bg-[var(--color-surface)] border-[var(--color-border)]'
      }`}
    >
      {isWaiting ? (
        <div className="text-center py-4">
          <div className="w-10 h-10 rounded-full bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--color-text-muted)]">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Waiting...</p>
        </div>
      ) : (
        <>
          {/* Avatar */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                isCurrentUser
                  ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                  : 'bg-[var(--color-surface-light)] text-[var(--color-text-muted)]'
              }`}
            >
              {player?.display_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold truncate">
                  {player?.display_name || 'Player'}
                </span>
                {isCurrentUser && (
                  <span className="text-xs text-[var(--color-primary)] font-medium shrink-0">you</span>
                )}
                {isCreator && (
                  <span className="text-xs text-[var(--color-warning)] font-medium shrink-0">host</span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-1 text-center">
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
    <div className="px-1 py-1.5 rounded-lg bg-[var(--color-bg)]/60">
      <p className="text-xs font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
      <path d="M7 2a5 5 0 015 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
