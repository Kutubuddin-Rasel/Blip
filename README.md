# Blip - Real-time Chat Application

## Project Overview

Blip is a direct-chat application. Firebase verifies phone ownership; Blip manages sessions, durable messages, and real-time delivery through a single Nest instance and PostgreSQL.

## Technology Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **State Management**: Zustand (Client State), TanStack React Query (Server State)
- **Styling**: TailwindCSS, Shadcn/UI
- **Real-time**: Socket.io Client
- **Authentication**: Firebase Client SDK

### Backend
- **Framework**: NestJS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Real-time**: Socket.io Gateway
- **Authentication**: Firebase Admin SDK, Passport-JWT

## Key Features

- **Secure Phone Authentication**: Users sign in via SMS OTP using Firebase, with sessions managed securely via HttpOnly cookies.
- **Real-time Messaging**: Instant message delivery using WebSockets with room-based architecture.
- **Optimistic UI Updates**: Messages appear in the chat interface instantly before server confirmation to ensure responsiveness.
- **Infinite Scroll**: Efficiently loads chat history using cursor-based pagination and intersection observers.
- **Core Error States**: Login, discovery, and sending show validation, session, rate-limit, and retryable errors.
- **Draft Mode**: Logic to handle conversation creation seamlessly when the first message is sent.

The controlled beta supports direct conversations only. The participant relation
remains in PostgreSQL, but group rows are not reachable through chat APIs or
Socket.IO rooms. Redis and contact syncing are not required.

## Prerequisites

Ensure the following are installed and running:
- Node.js 24.21.0 and npm 11.19.0 (pinned in `.nvmrc` and both app manifests)
- PostgreSQL
- A Firebase Project (for Phone Authentication)

## Getting Started

### 1. Backend Setup

Create the local backend configuration from the source-controlled example:
```bash
cp backend/.env.example backend/.env
```

Replace every `change-me` and Firebase placeholder. The Firebase private key
must keep its newlines escaped as `\n` inside the environment variable.

Start PostgreSQL from the repository root. Compose interpolation
must explicitly read the backend environment file:
```bash
docker compose --env-file backend/.env up -d postgres
```

Install, generate the Prisma client, and apply the checked-in migrations:
```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
```

Start the server:
```bash
npm run start:dev
```
The backend will run on `http://localhost:3000`.

### Controlled-beta request boundaries

The single Nest instance applies fixed 60-second windows: 10 exact-phone
discoveries per signed-in user, 20 direct start attempts per signed-in user,
60 ordinary message sends per signed-in user, and 20 combined signup/signin
exchanges per network address. Invalid requests also count. At the boundary,
the API returns HTTP 429 with a safe `Rate limit exceeded` body and a
`Retry-After` header. A committed message can still be retried with the same
client message ID, conversation, and content; this returns the original row
without creating another message. Refresh and logout are not limited. JSON
and URL-encoded request bodies are limited to 16 KiB.

The auth-exchange network key uses the socket address and deliberately ignores
untrusted forwarding headers. If deployed behind a proxy, configure a trusted
client-address path before opening beta access; otherwise clients behind that
proxy share one auth-exchange bucket. Limits are per process and reset when
the single instance restarts.

### 2. Frontend Setup

Create the frontend configuration from its example:
```bash
cp frontend/.env.example frontend/.env.local
```

Fill in the Firebase web-app values, then install and start the frontend:
```bash
cd frontend
npm ci
npm run dev
```
The frontend will run on `http://localhost:3696` (as per package scripts).

### Session and origin configuration

Set `NEXT_PUBLIC_FRONTEND_URL` in the backend to the exact browser origin allowed by CORS, and `NEXT_PUBLIC_BACKEND_URL` in the frontend to the backend origin. Browser requests include credentials. Locally, use the same host name (`localhost`) for both ports so the development `SameSite=Lax` refresh cookie is sent. Set `NODE_ENV=production` for production and serve the frontend/API over HTTPS on the same site: the refresh cookie is then `HttpOnly`, `Secure`, `SameSite=Strict`, and scoped to `/auth`. M8 must verify the deployed origins and TLS behavior.

Firebase verifies the phone once during login or signup. Blip then owns the session. A reload restores it using the refresh cookie even when Firebase client state is signed out. Access JWTs stay in browser memory and expire after `ACCESSTOKEN_EXPIRY` (the example uses 15 minutes); the stable refresh credential expires after `REFRESHTOKEN_EXPIRY` (the example uses 7 days). A new login for the same user replaces the previous refresh session. Logout clears the matching refresh credential, while an already issued access JWT remains valid until its short expiry.

## Architecture Highlights

- **Hybrid Auth**: Uses Firebase only for phone verification. The backend issues its own JWTs for application access, preventing vendor lock-in for session management.
- **Cursor Pagination**: Unlike offset pagination, cursor-based fetching provides consistently fast database queries regardless of message history depth.
- **Optimistic Cache Updates**: React Query cache is manually manipulated upon sending a message to achieve "zero latency" perception for the sender.

## License

This project is proprietary and confidential.
