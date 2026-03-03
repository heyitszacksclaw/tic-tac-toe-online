'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const supabase = createClient();

  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const draws = profile?.draws ?? 0;

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
        <button
          onClick={handleSignOut}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          Sign out
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-8">
          {/* Greeting & Stats */}
          <div className="text-center">
            <div className="mb-2">
              {isEditingName ? (
                <div className="inline-flex items-center gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-center text-lg font-semibold focus:border-[var(--color-primary)] focus:outline-none"
                    maxLength={20}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="group inline-flex items-center gap-2"
                  title="Click to edit display name"
                >
                  <h1 className="text-xl font-semibold">
                    Hello, {displayName || 'Player'}
                  </h1>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <path
                      d="M10.5 1.5l2 2L4.5 11.5H2.5v-2l8-8z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center justify-center gap-6 text-sm text-[var(--color-text-muted)]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--color-success)]"></span>
                <span>{wins} {wins === 1 ? 'win' : 'wins'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--color-danger)]"></span>
                <span>{losses} {losses === 1 ? 'loss' : 'losses'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--color-warning)]"></span>
                <span>{draws} {draws === 1 ? 'draw' : 'draws'}</span>
              </div>
            </div>
          </div>

          {/* Active Room Banner */}
          {profile?.current_room_id && (
            <div className="p-4 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-center">
              <p className="text-sm text-[var(--color-primary)] font-medium mb-2">
                You&apos;re already in a room
              </p>
              <button
                onClick={() => {
                  // We'll need to fetch the room code from the room ID
                  // For now, this will be wired up in Milestone 2
                  setError('Redirecting to your active room...');
                }}
                className="text-sm text-[var(--color-primary)] underline hover:text-[var(--color-primary-hover)]"
              >
                Return to room →
              </button>
            </div>
          )}

          {/* Create Room */}
          {!profile?.current_room_id && (
            <div className="space-y-4">
              <button
                onClick={handleCreateRoom}
                disabled={loading === 'create'}
                className="w-full px-6 py-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base"
              >
                {loading === 'create' ? 'Creating room...' : 'Create Room'}
              </button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--color-border)]"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                    or join an existing room
                  </span>
                </div>
              </div>

              {/* Join Room */}
              <form onSubmit={handleJoinRoom} className="flex gap-3">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center text-lg font-mono tracking-widest placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors uppercase"
                  placeholder="ABC123"
                  maxLength={6}
                />
                <button
                  type="submit"
                  disabled={roomCode.length !== 6 || loading === 'join'}
                  className="px-6 py-3 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-light)] border border-[var(--color-border)] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {loading === 'join' ? 'Joining...' : 'Join'}
                </button>
              </form>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
