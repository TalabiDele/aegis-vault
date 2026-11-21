# AGENTS.md — AegisVault Engineering Guardrails

Read `docs/SPEC.md` before writing code. Follow every rule below without exception.

## Architecture & Code Discipline
- **FSD Unidirectional Imports:** `app` -> `widgets` -> `features` -> `entities` -> `shared`. Never import upward or across sibling `features/*`. Keep `src/app/` as a thin routing, layout, and API boundary layer.
- **Strict TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`. No `any`, no `@ts-ignore`, no `// TODO`, no stubbed mocks.
- **Clean Dependencies:** Use `pnpm` only. NEVER use `--legacy-peer-deps` or `--force`. Keep `wagmi@^2` aligned with RainbowKit v2. Do NOT install `ethers` or the legacy `siwe` package—use `viem/siwe` natively.
- **Database Strategy (No Docker):** Do NOT create Dockerfiles or `docker-compose.yml`. Prisma connects to an external/native PostgreSQL instance via `DATABASE_URL` (and `DIRECT_URL` for CLI migrations when using Neon serverless Postgres). Ponder (`indexer/`) uses its built-in PGlite database in local dev (with optional separate `DATABASE_URL` + `DATABASE_SCHEMA` for production) so Prisma and Ponder never share or collide on schemas.

## Flat Institutional UI System
- **Zero Shadows, Zero Gradients:** Enforce `shadow-none` on all components and charts. Never use CSS gradients. Build hierarchy strictly with `1px` crisp borders, flat surface contrast, spacing, and typography.
- **Financial Typography:** Use `JetBrains Mono` with `tabular-nums` for all addresses, hashes, nonces, balances, USD values, and gas metrics. Always render addresses through `<AddressDisplay />` with EIP-55 checksumming (`getAddress`).

## Web3 & Security Boundaries
- **Zero Client Secrets:** Never prefix RPC keys, Tenderly keys, or session secrets with `NEXT_PUBLIC_`. Route all `wagmi` transports through `/api/rpc/[chainId]` (`batch: true`) and all simulations through `/api/simulate`.
- **RPC Allowlisting:** `/api/rpc/[chainId]` must validate `chainId`, parse single/batch JSON-RPC via Zod, allowlist read/broadcast methods only, and enforce per-IP rate limiting.
- **Replay-Proof Auth:** Store SIWE nonces in PostgreSQL (5-min TTL) and atomically delete them on `/api/auth/siwe/verify`. Validate `domain` and `nonce` via `viem/siwe`. Persist sessions only in `HttpOnly`, `SameSite=Strict` `iron-session` cookies—never `localStorage`/`sessionStorage`.
- **On-Chain Authorization:** All mutating metadata APIs must verify both the SIWE session cookie and on-chain Safe ownership (`isOwner`).
- **Safe Security & Local Parity:** Always batch with `onlyCalls: true` (`MultiSendCallOnly`) resolved via `@safe-global/safe-deployments`. Flag non-canonical `operation === 1` (`DELEGATECALL`) as `CRITICAL`. Use a `SafeQueueAdapter` that talks to `@safe-global/api-kit` on live chains and PostgreSQL (`LocalPendingTx`) on local Anvil (`31337`).
- **Zero Float Financial Math:** Keep all wei/token balances as `BigInt` (or numeric strings across forms/JSON). Use `viem` `parseUnits` / `formatUnits` exclusively.
- **SSR & Bundles:** Configure `wagmi` with `ssr: true` + `cookieStorage` hydrated in `src/app/layout.tsx`. Use standalone `viem/actions` (`multicall`, `readContract`) for tree-shaking.

## Mandatory Phase Gate
Before reporting completion of any phase, run `pnpm tsc --noEmit && pnpm build` and fix every error or SSR warning. Stop after the requested phase and wait for review.