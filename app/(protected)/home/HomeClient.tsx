'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

interface Profile {
  id: string;
  display_name: string;
  wins: number;
  losses: number;
  draws: number;
  current_room_id: string | null;
}

interface HomeClientProps {
  user: { id: string; email: string };
  profile: Profile | null;
}

export default function HomeClient({ user, profile }: HomeClientProps) {
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<{ roomCode: string; roomId: string } | null>(null);
  const [activeRoomLoading, setActiveRoomLoading] = useState(true);
  const [roomClosedToast, setRoomClosedToast] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const draws = profile?.draws ?? 0;
  const totalGames = wins + losses + draws;

  // Check for room_closed redirect reason (NOTIFY-5)
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'room_closed') {
      setRoomClosedToast(true);
      setTimeout(() => setRoomClosedToast(false), 4000);
      // Clean the URL without triggering a navigation
      window.history.replaceState({}, '', '/home');
    }
  }, [searchParams]);

  // On mount, check for active room
  useEffect(() => {
    async function checkActiveRoom() {
      try {
        const res = await fetch('/api/user/active-room');
        if (res.ok) {
          const data = await res.json();
          if (data.roomCode) {
            setActiveRoom({ roomCode: data.roomCode, roomId: data.roomId });
          }
        }
      } catch {
        // Silently fail
      } finally {
        setActiveRoomLoading(false);
      }
    }
    checkActiveRoom();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  async function handleSaveName() {
    if (!displayName.trim()) return;
    const trimmed = displayName.trim().slice(0, 20);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', user.id);

    if (updateError) {
      setError('Failed to update display name.');
    } else {
      setDisplayName(trimmed);
      setIsEditingName(false);
    }
  }

  async function handleCreateRoom() {
    setError(null);
    setLoading('create');

    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok) {
        // If already in room, offer to return
        if (res.status === 409 && data.roomCode) {
          setActiveRoom({ roomCode: data.roomCode, roomId: '' });
          setLoading(null);
          return;
        }
        setError(data.error || 'Failed to create room.');
        setLoading(null);
        return;
      }

      router.push(`/room/${data.roomCode}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(null);
    }
  }

  async function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading('join');

    const code = roomCode.trim().toUpperCase().replace(/\s/g, '');
    if (code.length !== 6) {
      setError('Room code must be 6 characters.');
      setLoading(null);
      return;
    }

    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.roomCode) {
          setActiveRoom({ roomCode: data.roomCode, roomId: '' });
          setLoading(null);
          return;
        }
        setError(data.error || 'Failed to join room.');
        setLoading(null);
        return;
      }

      router.push(`/room/${data.roomCode}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(null);
    }
  }

  const hasActiveRoom = !!activeRoom && !activeRoomLoading;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      {/* Room closed notification (NOTIFY-5) */}
      {roomClosedToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-[var(--color-surface-light)] border border-[var(--color-border-strong)] text-sm font-medium shadow-lg flex items-center gap-3" style={{ animation: 'fadeIn 0.2s ease-out' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="var(--color-warning)" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="var(--color-warning)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>The room has been closed.</span>
          <button onClick={() => setRoomClosedToast(false)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)] transition-colors ml-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-[var(--color-border)]" style={{background: 'linear-gradient(180deg, rgba(18,18,26,0.95) 0%, transparent 100%)'}}>
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
        <button
          onClick={handleSignOut}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface)] border border-transparent hover:border-[var(--color-border)]"
        >
          Sign out
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-10">

          {/* Greeting & Name Editor */}
          <div className="text-center">
            <div className="mb-6">
              {isEditingName ? (
                <div className="inline-flex flex-col items-center gap-3">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-primary)] text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-glow)] w-56"
                    maxLength={20}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveName}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditingName(false)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="group inline-flex flex-col items-center gap-2"
                  title="Click to edit display name"
                >
                  <h1 className="text-3xl font-bold group-hover:text-[var(--color-primary)] transition-colors">
                    Hello, {displayName || 'Player'}
                  </h1>
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M10.5 1.5l2 2L4.5 11.5H2.5v-2l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Edit name
                  </span>
                </button>
              )}
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="stat-card">
                <p className="text-2xl font-bold text-[var(--color-success)] mb-0.5">{wins}</p>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{wins === 1 ? 'Win' : 'Wins'}</p>
              </div>
              <div className="stat-card">
                <p className="text-2xl font-bold text-[var(--color-danger)] mb-0.5">{losses}</p>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{losses === 1 ? 'Loss' : 'Losses'}</p>
              </div>
              <div className="stat-card">
                <p className="text-2xl font-bold text-[var(--color-warning)] mb-0.5">{draws}</p>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{draws === 1 ? 'Draw' : 'Draws'}</p>
              </div>
            </div>
            {totalGames > 0 && (
              <p className="text-xs text-[var(--color-text-subtle)] mt-3">
                {totalGames} {totalGames === 1 ? 'game' : 'games'} played
              </p>
            )}
          </div>

          {/* Active Room Banner */}
          {!activeRoomLoading && hasActiveRoom && (
            <div className="p-5 rounded-2xl bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/25">
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-primary)]"></span>
                </span>
                <p className="text-sm text-[var(--color-primary)] font-semibold">
                  Active room
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold tracking-wider text-[var(--color-text)]">
                  {activeRoom!.roomCode.slice(0, 3)} {activeRoom!.roomCode.slice(3)}
                </span>
                <button
                  onClick={() => router.push(`/room/${activeRoom!.roomCode}`)}
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] font-semibold hover:text-[var(--color-primary-hover)] transition-colors"
                >
                  Return to room
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Create & Join (only if not in a room) */}
          {!hasActiveRoom && !activeRoomLoading && (
            <div className="space-y-5">
              {/* Create Room */}
              <button
                onClick={handleCreateRoom}
                disabled={loading === 'create'}
                className="btn-primary w-full text-base py-4"
              >
                {loading === 'create' ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner />
                    Creating room...
                  </span>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.75" />
                      <path d="M10 6v8M6 10h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Create Room
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="divider">
                <span className="divider-text">or join an existing room</span>
              </div>

              {/* Join Room */}
              <form onSubmit={handleJoinRoom} className="space-y-3">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  className="w-full px-5 py-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-strong)] text-center text-2xl font-mono font-bold tracking-[0.35em] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-glow)] focus:outline-none transition-all uppercase"
                  placeholder="ABC123"
                  maxLength={6}
                />
                <button
                  type="submit"
                  disabled={roomCode.length !== 6 || loading === 'join'}
                  className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {loading === 'join' ? (
                    <span className="flex items-center justify-center gap-2">
                      <LoadingSpinner />
                      Joining...
                    </span>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M7 9h7M10 6l3 3-3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9 2H4a2 2 0 00-2 2v10a2 2 0 002 2h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      Join Room
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Skeleton while loading active room status */}
          {activeRoomLoading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-14 rounded-xl bg-[var(--color-surface)]" />
              <div className="h-4 rounded bg-[var(--color-surface)] w-1/2 mx-auto" />
              <div className="h-14 rounded-xl bg-[var(--color-surface)]" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-[var(--color-danger-dim)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] text-sm text-center">
              {error}
            </div>
          )}
        </div>
      </main>
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
