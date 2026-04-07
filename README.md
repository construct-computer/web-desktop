# Construct Web Desktop

The web-based desktop environment for [construct.computer](https://construct.computer) — an AI agent platform that gives you a personal computer in the cloud.

## Overview

A full desktop OS experience built with React, featuring windowed apps, a dock, menu bar, Spotlight chat, and real-time agent interaction. Users can watch their AI agent work in real-time, take over at any point, and collaborate mid-task.

## Tech Stack

- **React 19** + **TypeScript**
- **Tailwind CSS 4** for styling
- **Zustand** for state management
- **Vite 7** for build tooling
- **Cloudflare Pages** for deployment
- **WebSocket** for real-time agent communication

## Features

- Desktop environment with windowed apps (chat, terminal, browser, files, email, calendar, settings)
- Spotlight — floating AI chat with slash commands, voice input, and file attachments
- Real-time agent streaming with tool call visualization
- Dock with magnification, Launchpad, Mission Control
- Wallpaper selection, sound effects, keyboard shortcuts
- Telegram Mini App companion (`/mini` route)
- Device-code linking for native macOS companion app (`/link` route)
- Setup wizard for first-time onboarding
- Subscription gating and usage tracking

## Setup

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start development server
npm run dev
```

The dev server runs at `http://localhost:5173` and proxies API requests to the backend worker.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Build and preview with Wrangler |
| `npm run lint` | Run ESLint |
| `npm run deploy` | Build and deploy to Cloudflare Pages |

## Project Structure

```
src/
├── assets/          # Images, wallpapers, animations (WebM/GIF)
├── components/
│   ├── apps/        # Windowed applications (Chat, Terminal, Files, etc.)
│   ├── auth/        # Login screen, device linking
│   ├── desktop/     # Desktop shell (Dock, MenuBar, Spotlight, Wallpaper)
│   ├── mini/        # Telegram Mini App screens
│   ├── screens/     # Full-screen states (Welcome, Returning, Subscription)
│   ├── ui/          # Shared UI primitives (Button, Dialog, Tooltip)
│   └── window/      # Window manager, title bar, resize handles
├── hooks/           # Custom React hooks
├── icons/           # App icons (PNG)
├── lib/             # Config, utilities, app registry, sounds
├── services/        # API client, WebSocket, audio, STT
├── stores/          # Zustand stores (agent, auth, billing, settings, etc.)
└── types/           # TypeScript type definitions
```

## License

Proprietary — Construct Computer, Inc.
