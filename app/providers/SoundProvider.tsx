'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

type SoundType = 'move' | 'win' | 'lose' | 'draw';

interface SoundContextValue {
  muted: boolean;
  toggleMute: () => void;
  playSound: (type: SoundType) => void;
}

const STORAGE_KEY = 'ttt-muted';

const SoundContext = createContext<SoundContextValue | null>(null);

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

function playMoveBeep() {
  createBeep(440, 0.12);
}

function playWinBeep() {
  createBeep(523, 0.15);
  setTimeout(() => createBeep(659, 0.15), 120);
  setTimeout(() => createBeep(784, 0.25), 240);
}

function playLoseBeep() {
  createBeep(300, 0.2, 0.1);
  setTimeout(() => createBeep(240, 0.3, 0.1), 180);
}

function playDrawBeep() {
  createBeep(392, 0.15);
  setTimeout(() => createBeep(392, 0.15), 150);
}

// ─── Provider ──────────────────────────────────────────────────────────────

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMuted] = useState(false);

  // Read from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setMuted(stored === 'true');
      }
    } catch {
      // sessionStorage not available
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // sessionStorage not available
      }
      return next;
    });
  }, []);

  const playSound = useCallback(
    (type: SoundType) => {
      if (muted) return;
      switch (type) {
        case 'move':
          playMoveBeep();
          break;
        case 'win':
          playWinBeep();
          break;
        case 'lose':
          playLoseBeep();
          break;
        case 'draw':
          playDrawBeep();
          break;
      }
    },
    [muted]
  );

  return (
    <SoundContext.Provider value={{ muted, toggleMute, playSound }}>
      {children}
    </SoundContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useSoundContext(): SoundContextValue {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSoundContext must be used within a SoundProvider');
  }
  return context;
}
