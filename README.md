# Blip - Real-time Chat Application

## Project Overview

Blip is a high-performance, scalable real-time chat application designed with a modern architecture. It leverages a hybrid authentication system combining Firebase for SMS verification and a custom backend for session management, ensuring both security and flexibility. The application supports real-time messaging, infinite scroll history, and optimistic UI updates to provide a seamless user experience.

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
- **Caching/PubSub**: Redis (ioredis)
- **Real-time**: Socket.io Gateway
- **Authentication**: Firebase Admin SDK, Passport-JWT

## Key Features

- **Secure Phone Authentication**: Users sign in via SMS OTP using Firebase, with sessions managed securely via HttpOnly cookies.
- **Real-time Messaging**: Instant message delivery using WebSockets with room-based architecture.
- **Optimistic UI Updates**: Messages appear in the chat interface instantly before server confirmation to ensure responsiveness.
- **Infinite Scroll**: Efficiently loads chat history using cursor-based pagination and intersection observers.
- **Robust Error Handling**: Integrated toast notifications for network or validation errors.
- **Draft Mode**: Logic to handle conversation creation seamlessly when the first message is sent.

## Prerequisites

Ensure the following are installed and running:
- Node.js (v18+)
- PostgreSQL
- Redis
- A Firebase Project (for Phone Authentication)

## Getting Started

### 1. Backend Setup

Navigate to the backend directory:
```bash
cd backend
```

Install dependencies:
```bash
npm install
```

Create a `.env` file in the `backend` directory with the following variables:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/blip_db"
REDIS_URL="redis://localhost:6379"
ACCESSTOKEN_SECRET="your_jwt_secret"
REFRESHTOKEN_SECRET="your_refresh_secret"
FIREBASE_SERVICE_ACCOUNT_PATH="./path/to/firebase-admin.json"
NEXT_PUBLIC_FRONTEND_URL="http://localhost:3000"
```

Run database migrations:
```bash
npx prisma db push
```

Start the server:
```bash
npm run start:dev
```
The backend will run on `http://localhost:3000`.

### 2. Frontend Setup

Navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

Create a `.env.local` file in the `frontend` directory:
```env
NEXT_PUBLIC_BACKEND_URL="http://localhost:3000"
NEXT_PUBLIC_FIREBASE_API_KEY="your_api_key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your_project.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your_project_id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your_bucket.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
NEXT_PUBLIC_FIREBASE_APP_ID="your_app_id"
```

Start the development server:
```bash
npm run dev
```
The frontend will run on `http://localhost:3696` (as per package scripts).

## Architecture Highlights

- **Hybrid Auth**: Uses Firebase only for phone verification. The backend issues its own JWTs for application access, preventing vendor lock-in for session management.
- **Cursor Pagination**: Unlike offset pagination, cursor-based fetching provides consistently fast database queries regardless of message history depth.
- **Optimistic Cache Updates**: React Query cache is manually manipulated upon sending a message to achieve "zero latency" perception for the sender.

## License

This project is proprietary and confidential.
