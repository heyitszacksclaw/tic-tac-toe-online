import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)] bg-grid-pattern">
      {/* Radial glow behind hero */}
      <div className="fixed inset-0 bg-radial-glow pointer-events-none" />

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-6 py-16 relative">
        <div className="max-w-2xl mx-auto text-center">

          {/* Logo / Icon */}
          <div className="mb-10">
            <div className="inline-flex items-center justify-center w-28 h-28 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border-strong)] mb-8 shadow-[var(--shadow-md)]" style={{boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)'}}>
              <svg
                width="58"
                height="58"
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

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-5 leading-tight">
              Tic Tac Toe
              <span className="block text-[var(--color-primary)] text-glow-primary">
                Online
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-[var(--color-text-muted)] max-w-lg mx-auto leading-relaxed">
              Challenge friends to real-time matches — no setup needed.
              Create a private room, share the code, and start playing in seconds.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link
              href="/signup"
              className="btn-primary w-full sm:w-auto text-base"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M9 2v14M2 9h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Get Started — It&apos;s Free
            </Link>
            <Link
              href="/login"
              className="btn-secondary w-full sm:w-auto text-base"
            >
              Sign In
            </Link>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Real-time */}
            <div className="card-elevated flex flex-col items-center gap-4 py-7 px-5 group hover:border-[var(--color-accent)] transition-colors duration-200">
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 flex items-center justify-center group-hover:border-[var(--color-accent)]/50 transition-colors">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="var(--color-accent)" strokeWidth="1.5" fill="none" opacity="0.4" />
                  <path d="M12 7v5l3.5 3.5" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[var(--color-text)] font-semibold text-sm mb-1.5">Real-time gameplay</p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">Moves sync instantly between players — no refresh needed</p>
              </div>
            </div>

            {/* Private rooms */}
            <div className="card-elevated flex flex-col items-center gap-4 py-7 px-5 group hover:border-[var(--color-primary)] transition-colors duration-200">
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/20 flex items-center justify-center group-hover:border-[var(--color-primary)]/50 transition-colors">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--color-primary)" strokeWidth="1.5" />
                  <path d="M7 11V7a5 5 0 0110 0v4" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[var(--color-text)] font-semibold text-sm mb-1.5">Private room codes</p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">6-character codes keep your match private and invite-only</p>
              </div>
            </div>

            {/* Stats */}
            <div className="card-elevated flex flex-col items-center gap-4 py-7 px-5 group hover:border-[var(--color-success)] transition-colors duration-200">
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-success-dim)] border border-[var(--color-success)]/20 flex items-center justify-center group-hover:border-[var(--color-success)]/50 transition-colors">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8 18V10M12 18V4M16 18v-6" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[var(--color-text)] font-semibold text-sm mb-1.5">Track your stats</p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">Wins, losses, and draws tracked across every match you play</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-[var(--color-text-subtle)] relative">
        <p>Built with Next.js &amp; Supabase — No cost, no ads, just fun.</p>
      </footer>
    </div>
  );
}
