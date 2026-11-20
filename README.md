# OutLayer Dashboard

Web dashboard for [OutLayer](https://outlayer.ai) — verifiable off-chain compute and agent custody for NEAR, running in Intel TDX enclaves.

Live at [app.outlayer.ai](https://app.outlayer.ai) (moving to `app.outlayer.ai`).

Extracted 2026-08-04 from the [outlayer](https://github.com/out-layer/outlayer) monorepo (`dashboard/`) with full history.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS v4
- NEAR wallets via `@hot-labs/near-connect`

## Develop

```bash
npm install
cp .env.example .env.local   # contracts, RPC URLs, coordinator API per network
npm run dev                  # http://localhost:3000
```

## llms.txt

`public/llms.txt` and `public/llms-full.txt` are **tracked artifacts**, and they are
what the site serves. Their markdown sources (README, API.md, CUSTODY.md,
wasi-examples, …) live in the out-layer/outlayer monorepo.

The `llms` workflow (`.github/workflows/llms.yml`) keeps them current, on a change
only: out-layer/outlayer calls it when a push there touches the docs, and it runs on a
change here to the manifest, the generator or the docs sidebar (or by hand). It
clones out-layer/outlayer, regenerates with `--strict`, and commits the files when
they changed (`chore(llms): regenerate from out-layer/outlayer@<sha>`).

`npm run dev` and `npm run build` only check them (`npm run llms:check`): the files
exist and the docs sidebar matches `scripts/llms-manifest.mjs`. A build never
regenerates, so no server's checkout of the monorepo can replace them.

To regenerate by hand (to see a manifest change before pushing it):

```bash
LLMS_SOURCES_ROOT=~/projects/near-offshore npm run llms
```

Edit `scripts/llms-manifest.mjs` to change what is indexed or inlined.

Deploy on the server is one command (as `nextjs-user`):

```bash
scripts/deploy.sh   # pulls, npm ci, builds, restarts the service
```
