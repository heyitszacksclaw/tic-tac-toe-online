import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-2xl mx-auto text-center">
          {/* Logo / Title */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] mb-6">
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Tic Tac Toe"
              >
                {/* X mark */}
                <line x1="4" y1="4" x2="16" y2="16" stroke="var(--color-x)" strokeWidth="3" strokeLinecap="round" />
                <line x1="16" y1="4" x2="4" y2="16" stroke="var(--color-x)" strokeWidth="3" strokeLinecap="round" />
                {/* O mark */}
                <circle cx="30" cy="10" r="7" stroke="var(--color-o)" strokeWidth="3" fill="none" />
                {/* Grid hint */}
                <line x1="0" y1="22" x2="40" y2="22" stroke="var(--color-border)" strokeWidth="1.5" />
                <line x1="20" y1="24" x2="20" y2="40" stroke="var(--color-border)" strokeWidth="1.5" />
                {/* Small X */}
                <line x1="6" y1="28" x2="14" y2="36" stroke="var(--color-x)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
                <line x1="14" y1="28" x2="6" y2="36" stroke="var(--color-x)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Tic Tac Toe
              <span className="block text-[var(--color-primary)]">Online</span>
            </h1>
            <p className="text-lg text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
              Challenge friends to real-time matches. Create a room, share the code, and play instantly.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium transition-colors duration-150 text-base"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-light)] border border-[var(--color-border)] text-[var(--color-text)] font-medium transition-colors duration-150 text-base"
            >
              Sign In
            </Link>
          </div>

          {/* Feature hints */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-[var(--color-text-muted)]">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M13 3L7 10l6 7" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 10 10)" />
                  <circle cx="10" cy="10" r="8" stroke="var(--color-accent)" strokeWidth="1.5" fill="none" opacity="0.3" />
                </svg>
              </div>
              <span>Real-time gameplay</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="3" width="14" height="14" rx="3" stroke="var(--color-primary)" strokeWidth="1.5" fill="none" />
                  <path d="M7 10l2 2 4-4" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span>Private room codes</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 3v14M3 10h14" stroke="var(--color-success)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <span>Track your stats</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-[var(--color-text-muted)]">
        <p>Built with Next.js & Supabase — No cost, no ads, just fun.</p>
      </footer>
    </div>
  );
}
