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
pnpm install

# Copy environment config
cp .env.example .env

# Start development server
pnpm dev
```

The dev server runs at `http://localhost:5173` and proxies API requests to the backend worker.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Type-check and build for web production |
| `pnpm build:capacitor` | Type-check and build the staging native WebView bundle |
| `pnpm build:capacitor:staging` | Build native assets against `staging.construct.computer` |
| `pnpm build:capacitor:production` | Build native assets against `beta.construct.computer` |
| `pnpm cap:sync` | Build the native bundle and sync Android/iOS projects |
| `pnpm cap:sync:staging` | Build/sync native projects against staging |
| `pnpm cap:sync:production` | Build/sync native projects against production/beta |
| `pnpm cap:open:android` | Open the Android project in Android Studio |
| `pnpm cap:open:ios` | Open the iOS project in Xcode |
| `pnpm ota:bundle` | Zip the current `dist` bundle and write an OTA channel manifest locally |
| `pnpm ota:publish:staging` | Build and upload a staging OTA bundle + manifest to R2 |
| `pnpm ota:publish:production` | Build and upload a production OTA bundle + manifest to R2 |
| `pnpm android:run` | Build, sync, and run Android |
| `pnpm ios:run` | Build, sync, and run iOS |
| `pnpm preview` | Build and preview with Wrangler |
| `pnpm lint` | Run ESLint |
| `pnpm deploy` | Build and deploy to Cloudflare Pages |

## Native Mobile

This app uses Capacitor from the same React/Vite codebase for Android and iOS.
The normal web build remains unchanged; native builds use `vite --mode capacitor`
to avoid copying web-only Cloudflare/PWA artifacts into the app bundle.

Native-only APIs live behind `src/native/*` wrappers. Import those wrappers from
application code instead of importing Capacitor plugins directly, so browser
builds keep working without platform checks scattered across the app.

Native builds use `@capgo/capacitor-updater` in manual mode for live updates.
The Worker serves `/api/ota/latest` and `/api/ota/bundles/:channel/:version.zip`
from the shared R2 bucket. OTA updates are only for web assets; native plugin,
permission, entitlement, or Capacitor runtime changes still require app-store
builds.

Native build environment files are checked in because they only contain public
client config:

- `.env.capacitor-staging` points installed apps at `https://staging.construct.computer/api`.
- `.env.capacitor-production` points installed apps at `https://beta.construct.computer/api`.

Do not point installed mobile builds at localhost; the device cannot reach the
developer machine's loopback address.

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
