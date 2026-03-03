# Tic Tac Toe Online

A real-time multiplayer Tic Tac Toe game built with Next.js 15, Supabase, and deployed on Vercel.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Supabase (Auth, PostgreSQL, Realtime)
- **Deployment:** Vercel (auto-deploy from GitHub)

## Features (In Progress)

- [x] Email/password authentication
- [x] OAuth (Google, GitHub) — UI ready, providers need configuration
- [x] Animated landing page
- [x] Protected routes with middleware
- [x] User profiles with display names
- [ ] Room management & lobby
- [ ] Real-time gameplay
- [ ] Post-game features (rematch, forfeit)
- [ ] Audio & visual polish
- [ ] Rate limiting & security hardening

## Getting Started

```bash
npm install
cp .env.local.example .env.local
# Fill in your Supabase credentials
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
