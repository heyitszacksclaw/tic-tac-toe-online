'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email.trim()) {
      setError('Please enter your email address.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    router.push('/home');
    router.refresh();
  }

  async function handleOAuth(provider: 'google' | 'github') {
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--color-bg)] bg-grid-pattern">
      {/* Background glow */}
      <div className="fixed inset-0 bg-radial-glow pointer-events-none" />

      <div className="w-full max-w-sm relative">
        {/* Back link */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors group"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="group-hover:-translate-x-0.5 transition-transform" aria-hidden="true">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to home
          </Link>
        </div>

        {/* Card container */}
        <div className="card-elevated p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/20 mb-5">
              <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <line x1="4" y1="4" x2="16" y2="16" stroke="var(--color-x)" strokeWidth="3" strokeLinecap="round" />
                <line x1="16" y1="4" x2="4" y2="16" stroke="var(--color-x)" strokeWidth="3" strokeLinecap="round" />
                <circle cx="30" cy="10" r="7" stroke="var(--color-o)" strokeWidth="3" fill="none" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Create your account</h1>
            <p className="text-[var(--color-text-muted)] text-sm">
              Join for free and start playing instantly
            </p>
          </div>

          {/* OAuth Buttons */}
          <div className="flex flex-col gap-3 mb-7">
            <button
              onClick={() => handleOAuth('google')}
              className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--color-surface-light)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border-strong)] transition-all duration-150 text-sm font-medium"
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuth('github')}
              className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--color-surface-light)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border-strong)] transition-all duration-150 text-sm font-medium"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                <path d="M9 0C4.03 0 0 4.03 0 9c0 3.98 2.58 7.35 6.16 8.54.45.08.62-.2.62-.43v-1.5c-2.5.54-3.04-1.21-3.04-1.21-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.37 2.1.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.46 0-.98.35-1.79.93-2.42-.09-.23-.4-1.15.09-2.39 0 0 .76-.24 2.48.93a8.63 8.63 0 0 1 4.52 0c1.72-1.17 2.48-.93 2.48-.93.49 1.24.18 2.16.09 2.39.58.63.93 1.44.93 2.42 0 3.47-2.1 4.23-4.11 4.45.32.28.61.83.61 1.67v2.48c0 .24.16.52.62.43C15.42 16.35 18 12.98 18 9c0-4.97-4.03-9-9-9Z" />
              </svg>
              Continue with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="divider mb-7">
            <span className="divider-text">or sign up with email</span>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSignUp} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-[var(--color-danger-dim)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  Creating account...
                </span>
              ) : (
                'Create account'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
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
