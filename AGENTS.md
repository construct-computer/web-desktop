# Agent Instructions

## Core Commands
- `pnpm dev`: Run local dev server via Vite.
- `pnpm build`: Build the frontend with TypeScript and Vite.
- `pnpm lint`: Run ESLint.
- `pnpm preview`: Build and then run via `wrangler dev`.
- `pnpm deploy`: Build and deploy via `wrangler`.

## Architecture
- **Stack**: React 19, TypeScript, Tailwind 4, Zustand, Vite 7.
- **Deployment**: Uses Cloudflare Wrangler.
- **Structure**:
  - `src/components/apps/`: Windowed applications.
  - `src/components/desktop/`: Desktop environment components (dock, menu bar, etc.).
  - `src/stores/`: Zustand state management.

## Notes
- This is a nested submodule of `construct`.
- It is bumped by `construct` CI when building the worker.
