'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlayerProfile {
  id: string;
  display_name: string;
  wins: number;
  losses: number;
  draws: number;
}

interface GameState {
  board: (string | null)[];
  currentTurn: string;
  moveCount: number;
  winningLine: number[] | null;
  lastMoveIndex: number | null;
  lastMoveTimestamp: string | null;
}

interface GameData {
  id: string;
  room_id: string;
  player_x: string;
  player_o: string;
  game_state: GameState;
  status: string;
  winner_id: string | null;
  win_reason: string | null;
  turn_deadline: string;
}

interface GameBoardProps {
  game: GameData;
  currentUser: { id: string; displayName: string };
  playerX: PlayerProfile;
  playerO: PlayerProfile;
  onGameEnd?: () => void;
}

// ─── Sound helpers ─────────────────────────────────────────────────────────

function createBeep(frequency: number, duration: number, volume = 0.15): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available — silently ignore
  }
}

function playMoveSound() { createBeep(440, 0.12); }
function playWinSound() {
  createBeep(523, 0.15);
  setTimeout(() => createBeep(659, 0.15), 120);
  setTimeout(() => createBeep(784, 0.25), 240);
}
function playLoseSound() {
  createBeep(300, 0.2, 0.1);
  setTimeout(() => createBeep(240, 0.3, 0.1), 180);
}
function playDrawSound() {
  createBeep(392, 0.15);
  setTimeout(() => createBeep(392, 0.15), 150);
}

// ─── Cell position labels ────────────────────────────────────────────────────

function getCellLabel(index: number, value: string | null): string {
  const row = Math.floor(index / 3) + 1;
  const col = (index % 3) + 1;
  const content = value ? value : 'empty';
  return `Row ${row} Column ${col}, ${content}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GameBoard({
  game: initialGame,
  currentUser,
  playerX,
  playerO,
  onGameEnd,
}: GameBoardProps) {
  const [game, setGame] = useState<GameData>(initialGame);
  const [optimisticBoard, setOptimisticBoard] = useState<(string | null)[] | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [muted, setMuted] = useState(false);
  const [forfeitDialog, setForfeitDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});
  const [lastPlayedSound, setLastPlayedSound] = useState<string | null>(null);
  const [myTurnTimedOut, setMyTurnTimedOut] = useState(false);
  const [opponentLeftToast, setOpponentLeftToast] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutClaimedRef = useRef(false);
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const gameState = game.game_state;
  const board = optimisticBoard ?? gameState.board;
  const isGameOver = game.status !== 'active';

  const isPlayerX = currentUser.id === game.player_x;
  const isPlayerO = currentUser.id === game.player_o;
  const myMark = isPlayerX ? 'X' : 'O';
  const opponentMark = isPlayerX ? 'O' : 'X';
  const isMyTurn = !isGameOver && !myTurnTimedOut && gameState.currentTurn === myMark;
  const isOpponentTurn = !isGameOver && gameState.currentTurn === opponentMark;

  const myProfile = isPlayerX ? playerX : playerO;
  const opponentProfile = isPlayerX ? playerO : playerX;

  // Determine game result for current user
  let gameResult: 'win' | 'lose' | 'draw' | null = null;
  if (isGameOver) {
    if (game.win_reason === 'draw') gameResult = 'draw';
    else if (game.winner_id === currentUser.id) gameResult = 'win';
    else if (game.winner_id) gameResult = 'lose';
  }

  // ─── Realtime subscription ────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`game:${game.id}:${game.room_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          const updated = payload.new as GameData;
          setGame(updated);
          setOptimisticBoard(null); // Clear optimistic — server is authoritative
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const map: Record<string, boolean> = {};
        for (const presences of Object.values(state)) {
          for (const p of presences as unknown as Array<{ userId: string }>) {
            map[p.userId] = true;
          }
        }
        setPresenceMap(map);
      })
      .on('broadcast', { event: 'player_left_game' }, (payload: { payload: { userId: string } }) => {
        if (payload.payload.userId !== currentUser.id) {
          setOpponentLeftToast(true);
        }
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
  }, [game.id, game.room_id]);

  // ─── Turn timer (TURN-1, TURN-2, RT-3) ───────────────────────────────────

  useEffect(() => {
    if (isGameOver) {
      if (timerRef.current) clearInterval(timerRef.current);
      setMyTurnTimedOut(false);
      return;
    }

    timeoutClaimedRef.current = false;
    setMyTurnTimedOut(false);

    const updateTimer = () => {
      const deadline = new Date(game.turn_deadline);
      const now = new Date();
      const remaining = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0 && !timeoutClaimedRef.current) {
        timeoutClaimedRef.current = true;

        if (isOpponentTurn) {
          // Opponent's turn expired — claim the timeout win
          claimTimeout();
        } else if (gameState.currentTurn === myMark) {
          // Our own turn expired — show "timed out" state and wait
          // for the opponent's client to claim the timeout
          setMyTurnTimedOut(true);
        }
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.turn_deadline, isGameOver, isOpponentTurn, gameState.currentTurn, myMark]);

  // ─── Sound effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (muted) return;

    const moveKey = `move-${gameState.lastMoveIndex}-${gameState.moveCount}`;
    if (gameState.lastMoveIndex !== null && moveKey !== lastPlayedSound && !isGameOver) {
      setLastPlayedSound(moveKey);
      playMoveSound();
    }
  }, [gameState.lastMoveIndex, gameState.moveCount, muted, isGameOver, lastPlayedSound]);

  useEffect(() => {
    if (muted || !isGameOver || lastPlayedSound === `end-${game.id}`) return;
    setLastPlayedSound(`end-${game.id}`);
    if (gameResult === 'win') playWinSound();
    else if (gameResult === 'lose') playLoseSound();
    else if (gameResult === 'draw') playDrawSound();
  }, [isGameOver, gameResult, muted, game.id, lastPlayedSound]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleCellClick = useCallback(
    async (cellIndex: number) => {
      if (!isMyTurn) return;
      if (board[cellIndex] !== null) return;
      if (isGameOver) return;

      setError(null);

      // Optimistic update (show mark immediately)
      const newBoard = [...board];
      newBoard[cellIndex] = myMark;
      setOptimisticBoard(newBoard);

      try {
        const res = await fetch('/api/game/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: game.id, cellIndex }),
        });

        if (!res.ok) {
          const data = await res.json();
          setOptimisticBoard(null); // Revert optimistic
          setError(data.error || 'Move failed. Please try again.');
        }
        // Success: server broadcasts via postgres_changes, which sets new game state
      } catch {
        setOptimisticBoard(null);
        setError('Network error. Please try again.');
      }
    },
    [isMyTurn, board, isGameOver, myMark, game.id]
  );

  const claimTimeout = useCallback(async () => {
    try {
      const res = await fetch('/api/game/timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        // If the game is already completed or has a winner, the realtime
        // subscription will pick up the final state — no action needed.
        if (res.status === 409) return;
        console.error('Timeout claim failed:', data.error);
        // Allow retry on next interval tick
        timeoutClaimedRef.current = false;
      }
    } catch {
      // Network error — allow retry on next interval tick
      timeoutClaimedRef.current = false;
    }
  }, [game.id]);

  const handleForfeit = useCallback(async () => {
    setForfeitDialog(false);
    try {
      await fetch('/api/game/forfeit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id }),
      });
    } catch {
      setError('Failed to forfeit. Please try again.');
    }
  }, [game.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, cellIndex: number) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCellClick(cellIndex);
      }
    },
    [handleCellClick]
  );

  // ─── Derived display values ───────────────────────────────────────────────

  const timerIsUrgent = timeLeft <= 10 && !isGameOver;
  const timerColor = timeLeft <= 5
    ? 'var(--color-danger)'
    : timeLeft <= 10
    ? 'var(--color-warning)'
    : 'var(--color-text-muted)';

  const winnerName = game.winner_id === currentUser.id
    ? 'You'
    : game.winner_id === game.player_x
    ? playerX.display_name
    : playerO.display_name;

  const resultMessage = () => {
    if (!isGameOver) return null;
    if (game.win_reason === 'draw') return 'Draw!';
    if (game.win_reason === 'timeout') {
      if (gameResult === 'win') return 'Opponent timed out — You win!';
      return 'Time ran out — You lose!';
    }
    if (game.win_reason === 'forfeit') {
      if (gameResult === 'win') return 'Opponent forfeited — You win!';
      return 'You forfeited — You lose!';
    }
    if (gameResult === 'win') return 'You win!';
    if (gameResult === 'lose') return `${winnerName} wins!`;
    return null;
  };

  const resultColor = gameResult === 'win'
    ? 'var(--color-success)'
    : gameResult === 'lose'
    ? 'var(--color-danger)'
    : 'var(--color-warning)';

  // ─── Render ───────────────────────────────────────────────────────────────

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

        <div className="flex items-center gap-3">
          {/* Sound toggle (AV-8) */}
          <button
            onClick={() => setMuted((m) => !m)}
            className="p-2 rounded-lg hover:bg-[var(--color-surface)] transition-colors"
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-subtle)" strokeWidth="2" strokeLinecap="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          {/* Forfeit button (GAME-10) */}
          {!isGameOver && (
            <button
              onClick={() => setForfeitDialog(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] border border-transparent hover:border-[var(--color-danger)]/20 transition-all"
            >
              End Game
            </button>
          )}
        </div>
      </header>

      {/* Opponent left toast */}
      <AnimatePresence>
        {opponentLeftToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-[var(--color-surface-light)] border border-[var(--color-border-strong)] text-sm font-medium shadow-[var(--shadow-lg)]"
          >
            Your opponent left — You win!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main layout */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-2xl space-y-6">

          {/* Game result banner */}
          <AnimatePresence>
            {isGameOver && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="text-center p-6 rounded-2xl border"
                style={{
                  background: `color-mix(in srgb, ${resultColor} 8%, var(--color-surface))`,
                  borderColor: `color-mix(in srgb, ${resultColor} 25%, transparent)`,
                }}
              >
                <p className="text-2xl font-bold mb-1" style={{ color: resultColor }}>
                  {resultMessage()}
                </p>
                {game.win_reason === 'three_in_row' && (
                  <p className="text-sm text-[var(--color-text-muted)]">Three in a row!</p>
                )}
                {game.win_reason === 'draw' && (
                  <p className="text-sm text-[var(--color-text-muted)]">No winner — well played!</p>
                )}
                {onGameEnd && (
                  <button
                    onClick={onGameEnd}
                    className="mt-4 px-5 py-2.5 rounded-xl bg-[var(--color-surface-light)] border border-[var(--color-border-strong)] text-sm font-semibold hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    Back to Home
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Turn indicator + timer */}
          {!isGameOver && myTurnTimedOut && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center justify-center gap-3 px-5 py-4 rounded-2xl border text-center"
              style={{
                background: 'color-mix(in srgb, var(--color-danger) 8%, var(--color-surface))',
                borderColor: 'color-mix(in srgb, var(--color-danger) 25%, transparent)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="var(--color-danger)" strokeWidth="1.5" />
                <path d="M7 4v3.5l2 1.5" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
                Time ran out — You lose!
              </span>
            </motion.div>
          )}
          {!isGameOver && !myTurnTimedOut && (
            <motion.div
              key={gameState.currentTurn}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between px-5 py-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-strong)]"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
                  style={{
                    background: gameState.currentTurn === 'X'
                      ? 'rgba(99,102,241,0.15)'
                      : 'rgba(34,211,238,0.15)',
                    color: gameState.currentTurn === 'X'
                      ? 'var(--color-x)'
                      : 'var(--color-o)',
                  }}
                >
                  {gameState.currentTurn}
                </span>
                <span className="text-sm font-semibold">
                  {isMyTurn ? (
                    <span style={{ color: 'var(--color-text)' }}>Your turn</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {opponentProfile.display_name}&apos;s turn
                    </span>
                  )}
                </span>
              </div>

              {/* Timer (TURN-2, RT-3) */}
              <div
                className="flex items-center gap-2"
                style={{
                  animation: timerIsUrgent ? 'urgentPulse 1s ease-in-out infinite' : undefined,
                }}
                aria-label={`${timeLeft} seconds remaining`}
                aria-live="polite"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="6" stroke={timerColor} strokeWidth="1.5" />
                  <path d="M7 4v3.5l2 1.5" stroke={timerColor} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span
                  className="text-lg font-mono font-bold tabular-nums"
                  style={{ color: timerColor, minWidth: '2.5ch' }}
                >
                  {timeLeft}
                </span>
              </div>
            </motion.div>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-4 py-3 rounded-xl bg-[var(--color-danger-dim)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] text-sm text-center font-medium"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main game area: player panels + board */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">

            {/* My player panel */}
            <GamePlayerPanel
              profile={myProfile}
              mark={myMark}
              isActiveTurn={isMyTurn}
              isConnected={presenceMap[currentUser.id] ?? true}
              isMe={true}
            />

            {/* Board (card-elevated style) */}
            <div
              className="flex-1 card-elevated p-4 sm:p-6 rounded-2xl"
              style={{
                animation: !isGameOver && gameState.winningLine ? 'none' : undefined,
              }}
            >
              <GameBoardGrid
                board={board}
                winningLine={isGameOver ? gameState.winningLine : null}
                lastMoveIndex={gameState.lastMoveIndex}
                isMyTurn={isMyTurn}
                isGameOver={isGameOver}
                onCellClick={handleCellClick}
                onCellKeyDown={handleKeyDown}
                myMark={myMark}
              />
            </div>

            {/* Opponent panel */}
            <GamePlayerPanel
              profile={opponentProfile}
              mark={opponentMark}
              isActiveTurn={isOpponentTurn}
              isConnected={presenceMap[opponentProfile.id] ?? false}
              isMe={false}
            />
          </div>

          {/* Move count */}
          <p className="text-center text-xs text-[var(--color-text-subtle)]">
            Move {gameState.moveCount} of 9
          </p>
        </div>
      </main>

      {/* Forfeit dialog (GAME-10) */}
      <AnimatePresence>
        {forfeitDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setForfeitDialog(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="card-elevated w-full max-w-sm rounded-2xl p-6 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-danger-dim)] border border-[var(--color-danger)]/20 flex items-center justify-center mx-auto mb-4">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                    <path d="M11 4v7M11 15v2" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="text-base font-bold">End Game?</h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Ending the game counts as a forfeit — a loss for you and a win for your opponent.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setForfeitDialog(false)}
                  className="flex-1 py-3 rounded-xl bg-[var(--color-surface-light)] border border-[var(--color-border-strong)] text-sm font-semibold hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleForfeit}
                  className="flex-1 py-3 rounded-xl bg-[var(--color-danger)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Forfeit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Player Panel ─────────────────────────────────────────────────────────────

function GamePlayerPanel({
  profile,
  mark,
  isActiveTurn,
  isConnected,
  isMe,
}: {
  profile: PlayerProfile;
  mark: string;
  isActiveTurn: boolean;
  isConnected: boolean;
  isMe: boolean;
}) {
  const markColor = mark === 'X' ? 'var(--color-x)' : 'var(--color-o)';
  const markBg = mark === 'X' ? 'rgba(99,102,241,0.15)' : 'rgba(34,211,238,0.15)';

  return (
    <motion.div
      animate={isActiveTurn ? { scale: 1.01 } : { scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`
        lg:w-44 p-4 rounded-2xl border transition-all duration-200
        ${isActiveTurn
          ? 'border-[var(--color-border-strong)] shadow-[var(--shadow-md)]'
          : 'border-[var(--color-border)] opacity-75'
        }
      `}
      style={{
        background: isActiveTurn
          ? mark === 'X'
            ? 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, var(--color-surface) 100%)'
            : 'linear-gradient(135deg, rgba(34,211,238,0.08) 0%, var(--color-surface) 100%)'
          : 'var(--color-surface)',
        boxShadow: isActiveTurn
          ? mark === 'X'
            ? '0 0 20px rgba(99,102,241,0.12), var(--shadow-md)'
            : '0 0 20px rgba(34,211,238,0.10), var(--shadow-md)'
          : undefined,
      }}
    >
      {/* Avatar + mark */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="relative">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{
              background: isMe
                ? 'rgba(99,102,241,0.18)'
                : 'var(--color-surface-light)',
              color: isMe ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            {profile.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          {/* Mark badge */}
          <span
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black border-2 border-[var(--color-bg)]"
            style={{ background: markBg, color: markColor, borderColor: 'var(--color-bg)' }}
          >
            {mark}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-bold truncate leading-tight">
              {profile.display_name}
            </span>
            {isMe && (
              <span className="text-[10px] bg-[var(--color-primary-dim)] text-[var(--color-primary)] font-semibold px-1 py-0.5 rounded shrink-0">
                you
              </span>
            )}
          </div>
          {/* Connection status (RT-4) */}
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                background: isConnected ? 'var(--color-success)' : 'var(--color-warning)',
                boxShadow: isConnected
                  ? '0 0 4px var(--color-success)'
                  : '0 0 4px var(--color-warning)',
              }}
            />
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              {isConnected ? 'connected' : 'reconnecting…'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats (STAT-3) */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <MiniStat label="W" value={profile.wins} color="var(--color-success)" />
        <MiniStat label="L" value={profile.losses} color="var(--color-danger)" />
        <MiniStat label="D" value={profile.draws} color="var(--color-warning)" />
      </div>

      {/* Active turn indicator */}
      {isActiveTurn && (
        <div
          className="mt-3 text-center text-[10px] font-bold uppercase tracking-wider py-1 rounded-lg"
          style={{
            color: markColor,
            background: markBg,
          }}
        >
          Playing
        </div>
      )}
    </motion.div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-1 py-2 rounded-lg bg-[var(--color-bg)]/60 border border-[var(--color-border)]/40">
      <p className="text-sm font-bold leading-tight" style={{ color }}>{value}</p>
      <p className="text-[10px] text-[var(--color-text-subtle)] font-medium">{label}</p>
    </div>
  );
}

// ─── Board Grid ───────────────────────────────────────────────────────────────

function GameBoardGrid({
  board,
  winningLine,
  lastMoveIndex,
  isMyTurn,
  isGameOver,
  onCellClick,
  onCellKeyDown,
  myMark,
}: {
  board: (string | null)[];
  winningLine: number[] | null;
  lastMoveIndex: number | null;
  isMyTurn: boolean;
  isGameOver: boolean;
  onCellClick: (i: number) => void;
  onCellKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => void;
  myMark: string;
}) {
  return (
    <div
      className="relative"
      role="grid"
      aria-label="Tic Tac Toe board"
    >
      {/* 3×3 grid */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
      >
        {board.map((cell, i) => {
          const row = Math.floor(i / 3);
          const col = i % 3;
          const isWinningCell = winningLine?.includes(i) ?? false;
          const isLastMove = lastMoveIndex === i;
          const isEmpty = cell === null;
          const canClick = isMyTurn && isEmpty && !isGameOver;

          return (
            <button
              key={i}
              role="gridcell"
              aria-label={getCellLabel(i, cell)}
              aria-rowindex={row + 1}
              aria-colindex={col + 1}
              onClick={() => onCellClick(i)}
              onKeyDown={(e) => onCellKeyDown(e, i)}
              disabled={!canClick && !isEmpty}
              className={`
                relative flex items-center justify-center
                rounded-2xl border transition-all duration-150
                focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2
                ${canClick
                  ? 'cursor-pointer hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-strong)] hover:scale-[0.97]'
                  : 'cursor-default'
                }
                ${isWinningCell
                  ? cell === 'X'
                    ? 'border-[var(--color-x)]/50 bg-[rgba(99,102,241,0.12)]'
                    : 'border-[var(--color-o)]/50 bg-[rgba(34,211,238,0.10)]'
                  : 'bg-[var(--color-surface)] border-[var(--color-border-strong)]'
                }
              `}
              style={{
                aspectRatio: '1',
                minHeight: '80px',
                boxShadow: isWinningCell
                  ? cell === 'X'
                    ? '0 0 16px rgba(99,102,241,0.20)'
                    : '0 0 16px rgba(34,211,238,0.18)'
                  : isLastMove
                  ? 'var(--shadow-sm)'
                  : 'none',
              }}
            >
              {/* Hover hint for empty cells on your turn */}
              {canClick && isEmpty && (
                <span
                  className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-2xl"
                  aria-hidden="true"
                >
                  <CellMark mark={myMark} opacity={0.2} animate={false} />
                </span>
              )}

              {/* Actual mark */}
              {cell && (
                <span
                  className="animate-scale-in"
                  aria-hidden="true"
                >
                  <CellMark mark={cell} opacity={1} animate />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Win line overlay (AV-6) */}
      {winningLine && (
        <WinLine winningLine={winningLine} board={board} />
      )}
    </div>
  );
}

// ─── Cell Mark Symbols ────────────────────────────────────────────────────────

function CellMark({ mark, opacity, animate }: { mark: string; opacity: number; animate: boolean }) {
  if (mark === 'X') {
    return (
      <svg
        width="52" height="52" viewBox="0 0 52 52" fill="none"
        style={{ opacity }}
        aria-hidden="true"
      >
        <line
          x1="12" y1="12" x2="40" y2="40"
          stroke="var(--color-x)"
          strokeWidth={animate ? 4.5 : 3}
          strokeLinecap="round"
        />
        <line
          x1="40" y1="12" x2="12" y2="40"
          stroke="var(--color-x)"
          strokeWidth={animate ? 4.5 : 3}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width="52" height="52" viewBox="0 0 52 52" fill="none"
      style={{ opacity }}
      aria-hidden="true"
    >
      <circle
        cx="26" cy="26" r="16"
        stroke="var(--color-o)"
        strokeWidth={animate ? 4.5 : 3}
        fill="none"
      />
    </svg>
  );
}

// ─── Win Line ────────────────────────────────────────────────────────────────

function WinLine({ winningLine, board }: { winningLine: number[]; board: (string | null)[] }) {
  // Grid: 3 cells + 2 gaps. Using a 100×100 viewBox.
  // Cell size: (100 - 2*gapFrac) / 3 where gap is ~4% of total (12px gap in a ~300px board)
  const gapFrac = 4; // percent of total size for each gap
  const cellSize = (100 - 2 * gapFrac) / 3; // ~30.67

  const getCenter = (index: number) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    return {
      x: col * (cellSize + gapFrac) + cellSize / 2,
      y: row * (cellSize + gapFrac) + cellSize / 2,
    };
  };

  const firstCell = winningLine[0];
  const lastCell = winningLine[winningLine.length - 1];
  const start = getCenter(firstCell);
  const end = getCenter(lastCell);
  const winnerMark = board[winningLine[0]];
  const lineColor = winnerMark === 'X' ? 'var(--color-x)' : 'var(--color-o)';

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <line
        x1={start.x} y1={start.y}
        x2={end.x} y2={end.y}
        stroke={lineColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.85"
        className="animate-draw-line"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
