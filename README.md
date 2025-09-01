# ConsultFlow Platform Monorepo

Full‑stack prototype for user interactions (virtual consultations).

## Structure
- `backend/` Express REST API + WebSocket, JWT auth, Google OAuth, Stripe, Nodemailer, JSON file storage under `backend/data/`.
- `frontend/` React + Vite + Material UI dashboard with dark/light themes.
- `tests/` Playwright E2E.

## Quick start
Backend (API at http://localhost:4000):
1) Copy `backend/.env.example` to `backend/.env` and set values (see Env Vars below).
2) In a terminal:
    - Windows cmd
    - cd backend
    - npm install
    - npm run dev

Frontend (Vite dev server at http://localhost:5173):
1) Create `frontend/.env`:
    VITE_API_URL=http://localhost:4000
    VITE_WS_URL=ws://localhost:4000/ws
2) In a second terminal:
    - Windows cmd
    - cd frontend
    - npm install
    - npm run dev

Open http://localhost:5173

## Environment variables (backend/.env)
See `backend/.env.example` for the full list. Key settings:
- PORT=4000
- CLIENT_URL=http://localhost:5173
- ADMIN_USER=admin, ADMIN_PASS=123 (admin login)
- JWT_SECRET, SESSION_SECRET
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (see Google OAuth below)
- SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM (verification emails)
- STRIPE_SECRET_KEY
- Optional TLS: TLS_KEY, TLS_CERT (switches server to HTTPS and WSS)

Frontend env (`frontend/.env`):
- VITE_API_URL=http://localhost:4000
- VITE_WS_URL=ws://localhost:4000/ws

## Features
- Email/password auth for users; admin login via env.
- Google OAuth sign‑in/up with automatic user account creation and profile completion flow.
- JWT‑protected routes, axios interceptors that auto‑attach token and redirect on 401.
- User registration with email verification.
- File uploads per user (200MB per file; 10 files per request) stored under `backend/data/uploads/<email>/`.
- Stripe Checkout session creation endpoint (pricing page in UI).
- WebSocket `/ws` broadcast channel with optional `?token=` for identity.

## API overview
Base URL: `http://localhost:4000`

Public
- GET /health → { status: ok }
- POST /auth/login { username,password } → { token, role }
- GET /auth/google → Google OAuth (redirect)
- GET /auth/google/callback → redirects to CLIENT_URL with token

Users/Accounts
- POST /users/users → register user (sends verify email, returns verifyToken in dev)
- POST /users/users/verify { token } → activate user
- POST /users/users/login { email,password } → basic login
- GET /users/users (JWT) → list users
- POST /users/users/admin (JWT admin) → create active user directly

Profile
- GET /profile/profile (JWT) → current user profile (sans password)
- PUT /profile/profile (JWT) → update profile fields
- GET /profile/profile/completeness (JWT) → { isComplete, missingFields, completionPercentage }

Payments
- POST /payments/checkout-session (JWT) → { id, url } Stripe Checkout

Uploads
- POST /uploads/upload (JWT, multipart field: files[]) → save to user folder
- GET /uploads/files (JWT) → list user files

WebSocket
- Connect: ws://localhost:4000/ws (or wss with TLS)
- Optional auth: append `?token=<JWT>` to identify user
- Messages: {type:'ping'} → {type:'pong'}, {type:'consult_request', symptom}

## Data storage
Temporary JSON files under `backend/data/`:
- users/users.json, users/verifications.json
- events/<uuid>.json
- uploads/<email>/*
Seeding: first run seeds sample providers with basic AI agent metadata.

## Google OAuth
Integrated via Passport Google OAuth 2.0.
- Frontend button at login uses VITE_API_URL + `/auth/google`.
- On success, backend issues JWT and redirects to `${CLIENT_URL}/auth/callback?token=...&role=...&name=...`.
- New Google users are auto‑created as users (email verified). Providers can still self‑register.
See `GOOGLE_OAUTH_SETUP.md` for detailed setup.

## Frontend routes & components (quick map)
- `/login` LoginForm + GoogleAuthButton
- `/adminLogin` AdminLogin
- `/` Dashboard (protected)
- `/signup` ConsumerRegistration
- `/signup/provider` ProviderRegistration
- `/auth/callback` AuthCallback (Google redirect handler + profile completeness check)
- `/profile/complete` ProfileCompletion (guided form)
- `/meetups` Meetups (list + create with selected user)
- `/pricing` Pricing (links to Stripe Checkout)
- Shared: SideNav, PageHeader, ProviderCard, Consultation, EmailVerify, ErrorBoundary

## Testing (Playwright)
Prereqs: backend on :4000 and frontend on :5173.
- Install: from `frontend/` or repo root devDeps: `@playwright/test` (already in frontend/package.json)
- Run tests:
  - cd tests
  - npx playwright test

## Email (verification) setup
Option A — Local dev (MailDev/MailHog): keep defaults from `.env.example` (SMTP_HOST=localhost, PORT=1025). Emails appear in the tool UI.
Option B — Gmail: set SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_SECURE=true and use an App Password. Configure EMAIL_FROM.

## Notes & troubleshooting
- 401 token errors return a redirect hint; the frontend interceptor clears auth and navigates to /login.
- If GOOGLE_CLIENT_ID/SECRET are missing, backend will log and exit early; copy `.env.example` and fill them or remove Google from your flow.
- Set CLIENT_URL to your frontend origin to enable proper OAuth redirects and CORS.

## Roadmap
- Replace JSON files with a database.
- Provider availability + smarter matchmaking.
- Harden sessions/cookies for production (secure cookies when behind HTTPS).
- Accessibility passes and richer validations.

