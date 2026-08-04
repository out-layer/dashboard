# OutLayer Dashboard

Web dashboard for [OutLayer](https://outlayer.ai) — verifiable off-chain compute and agent custody for NEAR, running in Intel TDX enclaves.

Live at [outlayer.fastnear.com](https://outlayer.fastnear.com) (moving to `app.outlayer.ai`).

Extracted 2026-08-04 from the [near-outlayer](https://github.com/fastnear/near-outlayer) monorepo (`dashboard/`) with full history.

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

`public/llms.txt` and `public/llms-full.txt` are **tracked artifacts**. Their markdown
sources (README, API.md, CUSTODY.md, wasi-examples, …) live in the near-outlayer
monorepo, so a standalone clone cannot rebuild them. To refresh after monorepo docs
change:

```bash
LLMS_SOURCES_ROOT=~/projects/near-offshore npm run llms
```

Without `LLMS_SOURCES_ROOT`, `dev`/`build` keep the committed files untouched.
Edit `scripts/llms-manifest.mjs` to change what is indexed or inlined.

### Refreshing on the server

The deploy host can regenerate at build time from its own monorepo checkout.
Set the path once in `.env.local` (the script loads env files via `@next/env`,
same precedence as the app):

```bash
# .env.local on the deploy host
LLMS_SOURCES_ROOT=/path/to/near-outlayer
```

Then every deploy is just:

```bash
cd /path/to/near-outlayer && git pull          # sources must be fresh first
cd /path/to/dashboard
git checkout -- public/llms.txt public/llms-full.txt   # drop last build's rewrite so git pull is clean
git pull
npm run build
```

The `git checkout --` line matters: regeneration rewrites two TRACKED files, and a
dirty tree makes the next `git pull` abort.
