ConsultFlow Frontend

Stack
- React 18 (Vite, JavaScript only)
- Material UI v6
- React Router v6

Dev
1) Install deps
   npm install
2) Start dev server
   npm run dev
3) Backend assumed at http://localhost:4000; vite dev server proxies /auth and /users

Theme
- Implemented in src/theme.js using the provided aurora/ocean setup
- Toggle with the sun/moon button in the app bar

Auth
- Login calls /auth/login for admin or user token; if needed it falls back to /users/login then requests token
- Signup posts to POST /users
- Google OAuth button redirects to /auth/google; callback handled at /auth/callback

Build
- npm run build
- npm run preview
