# Tic Tac Toe Online

Real-time multiplayer Tic Tac Toe built with Next.js 15, Supabase, and deployed on Vercel.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **Auth:** Supabase Auth (Email/Password, Google OAuth, GitHub OAuth)
- **Database:** Supabase PostgreSQL with Row Level Security
- **Real-Time:** Supabase Realtime (WebSocket)
- **Rate Limiting:** Upstash Redis
- **Hosting:** Vercel (Hobby tier)
- **Animations:** CSS Keyframes + Framer Motion

## Features

- Real-time multiplayer gameplay
- Private room codes for playing with friends
- Google & GitHub OAuth sign-in
- 30-second turn timers
- Win/loss/draw stats tracking
- Sound effects & animations
- Keyboard accessible
- Mobile responsive

## Development

```bash
npm install
npm run dev
```

## Environment Variables

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## License

MIT
