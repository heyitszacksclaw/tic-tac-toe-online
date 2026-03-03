# Tic Tac Toe Online — Product Requirements Document
Version: 1.1 Last Updated: March 2026 Status: Draft — Pre-Implementation

## 1. Product Overview
A minimal, elegant web application that allows authenticated users to create or join private game rooms and play real-time tic-tac-toe against each other. The architecture is designed to be extensible to other game types in the future by storing all game state as a flexible JSON blob.

## 2. Constraints & Guiding Principles
- **Zero cost.** All services must offer a free tier that requires no credit card to sign up.
- **Minimal UI.** The visual identity is clean, simple, and elegant. No clutter, no visual excess.
- **Security first.** All authentication data, passwords, and emails must be handled with industry-standard security practices. No plaintext storage, no insecure endpoints.
- **Extensibility.** The game state storage model (JSON blob) must be generic enough that new game types can be added in the future without schema changes.

## 3. Functional Requirements

### 3.1 Authentication
| ID | Requirement |
|----|-------------|
| AUTH-1 | Users must be able to sign up with an email and password. |
| AUTH-2 | Users must be able to sign in via OAuth social providers including Google (Gmail), GitHub, and any other major providers supported by the chosen auth platform. |
| AUTH-3 | Email verification is not required. Users may begin using the app immediately after sign-up or OAuth login. |
| AUTH-4 | Users must be able to log out. |
| AUTH-5 | Passwords must be hashed and salted; plaintext passwords must never be stored or transmitted beyond the initial TLS-encrypted request. |
| AUTH-6 | Session tokens or JWTs must be used to maintain authenticated state. |
| AUTH-7 | Unauthenticated users must not be able to access any game functionality. They may only see the landing page and the sign-in/sign-up flow. |

### 3.2 Landing Page
| ID | Requirement |
|----|-------------|
| LAND-1 | The landing page must display a brief description of the application and its purpose. |
| LAND-2 | The landing page must present sign-in and sign-up entry points. |
| LAND-3 | The landing page must not expose any game functionality to unauthenticated users. |

### 3.3 Room Management
| ID | Requirement |
|----|-------------|
| ROOM-1 | An authenticated user can create a new game room. Creating a room generates a unique 6-digit alphanumeric room code. |
| ROOM-2 | When a user creates a room, they are automatically placed into that room as Player 1 and enter the pre-game lobby. |
| ROOM-3 | Before joining a room, the user is prompted to choose a display name. It defaults to the name associated with their login account (e.g., their Google profile name or email prefix for email/password accounts). The user may change it to any non-empty string (max 20 characters). The display name is saved to the user's account whenever edited and persists as the default for future rooms. |
| ROOM-4 | An authenticated user can join an existing room by entering its room code. They enter the pre-game lobby alongside the room creator. |
| ROOM-5 | A room has a maximum capacity of 2 players. Any join attempt on a full room must be rejected with a clear error message. |
| ROOM-6 | A user may only be in one room at a time. If a user is currently in a room (including during the post-game rematch window), they must not be able to create or join another room from any client, tab, or device. The user is released from the room when: (a) they explicitly leave, (b) the post-game rematch timer expires, or (c) the room is closed for any reason. |
| ROOM-7 | If a user who is already in a room navigates to the join/create page (e.g., in another tab), the UI must not present join or create options. Instead, it must display a prompt or link to return to their active room. |
| ROOM-8 | Room codes must be 6-character alphanumeric (letters and digits), randomly generated, and not sequential or guessable. Codes are freed for reuse after a room is fully closed. |
| ROOM-9 | If a room creator is waiting in the pre-game lobby and no second player has joined within 5 minutes, the room auto-closes and the creator is automatically redirected to the lobby/home screen. |
| ROOM-10 | In the pre-game lobby (before the game has started), if a player who joined leaves or disconnects, their seat is released and another player may join using the room code. The room creator remains in the lobby. Once a game is in progress, seats are locked and no replacement players may join. |

### 3.4 Pre-Game Lobby
| ID | Requirement |
|----|-------------|
| LOBBY-1 | When two players are present in the pre-game lobby, a "Start Game" button becomes visible to both players. |
| LOBBY-2 | Either player may click "Start Game." Once clicked, the game begins immediately. Only one player needs to click it. |
| LOBBY-3 | While only one player is in the lobby, the UI displays the room code prominently with a message to share it with the opponent, and the "Start Game" button is disabled or hidden. |
| LOBBY-4 | While waiting in the lobby, both players can see each other's display names and stats (wins, losses, draws). |
| LOBBY-5 | Either player may leave the pre-game lobby at any time via a "Leave Room" button. If the room creator leaves, the room is closed and the other player (if present) is redirected to the home screen with a notification. If the non-creator leaves, their seat is freed per ROOM-10. |

### 3.5 Gameplay — Tic Tac Toe
| ID | Requirement |
|----|-------------|
| GAME-1 | The game begins when either player clicks "Start Game" in the pre-game lobby with both players present. |
| GAME-2 | The starting player for each round is randomized. The starting player is always assigned the X mark; the other player is O. Assignments may change between rounds. |
| GAME-3 | Players alternate turns. A player may only place their mark (X or O) on an empty cell during their turn. Players may place marks even while the opponent is temporarily disconnected. |
| GAME-4 | The game ends when one player achieves three marks in a row (horizontal, vertical, or diagonal) or all 9 cells are filled. |
| GAME-5 | A draw (all cells filled, no winner) increments only the draw counter for both players. It does not count as a loss. |
| GAME-6 | After a game ends, both players are presented with the option to "Play Again" or "Leave Room." A 1-minute countdown timer begins and is visible to both players. |
| GAME-7 | A new round starts only when both players click "Play Again" within the 1-minute window. The UI must show each player's choice in real time (e.g., "Player 1 wants to play again — waiting for Player 2…"). If both agree, a new round begins with a freshly randomized starting player. |
| GAME-8 | If the 1-minute timer expires without both players agreeing to rematch, the room closes and both players are redirected to the home screen. |
| GAME-9 | Either player may click a "Leave Room" button during the post-game phase. This immediately closes the room. The other player is shown a notification (e.g., "Your opponent has left. Returning to home screen.") and redirected to the home screen. |
| GAME-10 | Either player may click an "End Game" button at any time during active gameplay. This triggers a confirmation dialog: "Are you sure? Ending the game counts as a forfeit (loss for you, win for opponent)." If confirmed, the game ends, the forfeiting player receives a loss, the opponent receives a win, and the room moves to the post-game phase (GAME-6). |
| GAME-11 | All game state must be stored as a JSON blob in the database. This blob must contain all information needed to render and continue the game (board state, current turn, player assignments, round metadata). The JSON blob approach must be generic enough that future game types can use the same storage column with a different JSON structure. |

### 3.6 Turn Timer & Disconnection
| ID | Requirement |
|----|-------------|
| TURN-1 | Each player has 30 seconds to make their move on their turn. |
| TURN-2 | A visible countdown timer must be displayed to both players during each turn. |
| TURN-3 | If a player's 30-second timer expires without a move, they forfeit the game. The forfeiting player receives a loss; the opponent receives a win. |
| TURN-4 | If a player disconnects (closes tab, loses connection) during gameplay, their 30-second turn timer continues to count down on the server side. |
| TURN-5 | If a disconnected player reconnects within the 30-second window, they resume play normally with their remaining time. |
| TURN-6 | If a disconnected player does not reconnect within 30 seconds (measured from when it becomes their turn), they forfeit. The forfeiting player receives a loss; the opponent receives a win. The room moves to the post-game phase. |
| TURN-7 | A page reload must not eject a player from their game. On reload, the client must detect the user's active room and restore the game view with the current, most up-to-date state — including any moves made, game outcomes, or room closures that occurred during the reload. |
| TURN-8 | If it is the opponent's turn when a player disconnects, the game continues normally for the active player. The disconnected player's forfeit timer only starts when it becomes their turn. |

### 3.7 Navigation & Forfeit Protection
| ID | Requirement |
|----|-------------|
| NAV-1 | During an active game, if a player attempts to navigate away from the game page (browser back button, clicking a link, or any in-app navigation), a confirmation dialog must appear: "If you leave, you forfeit this game. Leave anyway?" with Cancel and Confirm options. |
| NAV-2 | If the player confirms navigation away, they forfeit the game. The forfeiting player receives a loss; the opponent receives a win. The room moves to the post-game phase. |
| NAV-3 | If the player cancels, they remain in the game and play continues normally. |
| NAV-4 | This confirmation dialog does not apply during the pre-game lobby or post-game phase — only during active gameplay. |

### 3.8 Real-Time Synchronization
| ID | Requirement |
|----|-------------|
| RT-1 | When a player makes a move, the updated board state must be reflected on the opponent's screen without requiring a page refresh. |
| RT-2 | Updates must be delivered via a push mechanism (e.g., WebSocket, server-sent events, or database-level realtime subscriptions). Polling is not acceptable. |
| RT-3 | The turn timer must be synchronized between both clients. Minor drift (< 1 second) is acceptable. |
| RT-4 | Connection status indicators must be visible to both players during gameplay (e.g., a subtle "opponent connected" / "opponent reconnecting…" state). |

### 3.9 Player Stats
| ID | Requirement |
|----|-------------|
| STAT-1 | The system must track the following stats per user: wins, losses, and draws. |
| STAT-2 | A draw increments only the draw counter for both players. Draws are not counted as losses. |
| STAT-3 | During a game and in the pre-game lobby, each player's stats (wins, losses, draws) must be visible beneath their display name. |
| STAT-4 | Stats must persist across sessions and be tied to the user's account. |
| STAT-5 | Win/loss streaks are not tracked at this time. |
| STAT-6 | Game history is not tracked at this time. |

### 3.10 Audio & Visual Feedback
| ID | Requirement |
|----|-------------|
| AV-1 | A subtle sound effect must play when a player places a mark. |
| AV-2 | A subtle sound effect must play on game win. |
| AV-3 | A subtle sound effect must play on game loss / forfeit. |
| AV-4 | A subtle sound effect must play on draw. |
| AV-5 | Smooth animations must accompany mark placement (e.g., a fade-in or draw-on effect). |
| AV-6 | A winning line must be visually highlighted with an animation (e.g., a line drawn through the three winning cells). |
| AV-7 | Transition animations should exist for game state changes (game start, game end, rematch). |
| AV-8 | All audio must be tasteful and quiet by default. A sound/mute toggle must be accessible at all times during gameplay. Mute preference persists for the browser session (until tab close). |

### 3.11 Post-Game & Disconnection Notifications
| ID | Requirement |
|----|-------------|
| NOTIFY-1 | When a game ends due to opponent disconnection/timeout, the remaining player must be shown a clear notification: "Your opponent disconnected. You win!" The player then enters the post-game phase and may leave the room. |
| NOTIFY-2 | When a game ends due to the opponent clicking "End Game" (forfeit), the non-forfeiting player must be shown: "Your opponent forfeited. You win!" |
| NOTIFY-3 | When a game ends due to the opponent navigating away, the remaining player must be shown: "Your opponent left the game. You win!" |
| NOTIFY-4 | If a disconnected player reconnects after the game has already ended (due to their timeout), they must see a notification explaining the outcome: "You were disconnected and your turn timer expired. You forfeited the game." They are then redirected to the home screen. |
| NOTIFY-5 | If a player returns to the app and their room has been closed (opponent forfeited, rematch timer expired, etc.), they must see a summary notification explaining what happened before being redirected to the home screen. |
| NOTIFY-6 | All end-of-game notifications must include an "OK" or "Continue" button. The player is redirected to the home screen only after clicking it. |

## 4. Non-Functional Requirements

### 4.1 Security
| ID | Requirement |
|----|-------------|
| SEC-1 | All API endpoints must require authentication. No game or room operations may be performed by unauthenticated requests. |
| SEC-2 | Database access must be governed by row-level security (RLS) policies. Users must only be able to read/write data they are authorized to access. |
| SEC-3 | All traffic must be served over HTTPS. |
| SEC-4 | Room codes must be randomly generated 6-character alphanumeric strings. They must not be sequential or predictable. |
| SEC-5 | Server-side validation must enforce all game rules. The client is untrusted. A player must not be able to make a move out of turn, place a mark on an occupied cell, or manipulate game state by crafting API calls. |
| SEC-6 | Passwords must be hashed with a modern algorithm (e.g., bcrypt, argon2). |

### 4.2 Rate Limiting
| ID | Requirement |
|----|-------------|
| RATE-1 | Room creation: max 10 requests per user per minute. |
| RATE-2 | Room join attempts: max 10 requests per user per minute. |
| RATE-3 | Room code validation/lookup: max 10 requests per user per minute (prevents brute-force code scanning). |
| RATE-4 | Game move submissions: max 20 requests per user per minute (generous, but prevents scripted spam). |
| RATE-5 | Rate limit violations must return a clear error (HTTP 429) and must not crash the client. |
| RATE-6 | All rate limits are enforced per-account (not per-device) using a sliding window. |

### 4.3 Responsiveness & Compatibility
| ID | Requirement |
|----|-------------|
| RESP-1 | The application must be fully responsive and usable on mobile phones (minimum 320px viewport width). |
| RESP-2 | The tic-tac-toe board must scale appropriately on small screens while remaining easy to tap. |
| RESP-3 | The application must work on the latest versions of Chrome, Safari, Firefox, and Edge. |

### 4.4 Performance
| ID | Requirement |
|----|-------------|
| PERF-1 | Move-to-display latency (the time between one player submitting a move and the other player seeing it) should be under 500ms under normal network conditions. |
| PERF-2 | Initial page load (landing page) should achieve a Lighthouse performance score of 90+. |

### 4.5 Accessibility
| ID | Requirement |
|----|-------------|
| A11Y-1 | The game board must be navigable via keyboard (tab between cells, enter/space to place mark). |
| A11Y-2 | All cells must have appropriate ARIA labels (e.g., "Row 1 Column 2, empty" or "Row 1 Column 2, X"). |
| A11Y-3 | Win/loss/draw indicators must not rely solely on color. Use text labels or icons in addition to color. |

## 5. Technology Options (For Evaluation)
These are not requirements. They are candidate technologies that meet the zero-cost, no-credit-card constraints and will be evaluated during the implementation phase.
- **Authentication:** Supabase Auth (built-in email/password + OAuth, free tier, no CC) or Clerk (dedicated auth provider, generous free tier).
- **Database & Real-Time:** Supabase Postgres + Realtime (JSONB, RLS, realtime subscriptions, free tier, no CC) or Firebase Realtime Database / Firestore (NoSQL alternative, free tier).
- **Frontend Framework:** Next.js (React-based, SSR/SSG, pairs with Vercel) or Vite + React (lighter SPA option).
- **Hosting:** Vercel (free tier, no CC) or Netlify (similar free tier).
- **Rate Limiting:** Supabase Edge Functions + in-memory store or Upstash Redis (free tier, no CC, serverless compatible).

## 6. Out of Scope (v1)
- Game history / match replay
- Win/loss streaks
- Multiple game types (architecture supports it; implementation is deferred)
- Friend lists or social features
- Spectator mode
- Chat between players
- Custom avatars or theming
- Native mobile apps (responsive web only)
- Leaderboards
