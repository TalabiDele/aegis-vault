# Master Engineering Specification: AegisVault — Institutional Multi-Sig Treasury & Governance Portal

You are a Principal Full-Stack Web3 & Application Security Engineer. Build **AegisVault**, a production-grade **Institutional Multi-Sig Treasury & Governance Portal** using Next.js (App Router), TypeScript, `viem`, `wagmi`, Safe Smart Accounts (v1.4.1), Tenderly Pre-Execution Simulation, Ponder Event Indexing, and PostgreSQL + Prisma.

## 0. Strict Agent Operating Rules
1. **Zero Placeholders:** Never leave `// TODO`, `// implement later`, hardcoded fake transaction hashes, or stubbed security checks. Every route, hook, and UI state must be wired end-to-end.
2. **Strict TypeScript:** Enforce `"strict": true` and `"noUncheckedIndexedAccess": true`. Never use `any` or `@ts-ignore`.
3. **Clean Package Management:** Use `pnpm`. NEVER use `--legacy-peer-deps` or `--force`. Keep peer dependencies cleanly aligned and `pnpm-lock.yaml` synchronized.
4. **Verification Gate:** At the end of every phase, run `pnpm tsc --noEmit` and `pnpm build`. Resolve all type, lint, and SSR hydration errors before proceeding.
5. **Local Development Fallback:** Support running completely against a local **Foundry Anvil** mainnet fork (via `foundry/fork.sh`) so every feature works deterministically without real mainnet funds.

---

## 1. System Architecture & Data Boundaries

AegisVault is a **hybrid Web2/Web3 financial terminal** with strict trust boundaries:

- **On-Chain & Safe Layer (Canonical Truth):** Safe owners, signing threshold, current Safe nonce, ETH/ERC-20 balances, token allowances, pending multi-sig proposals, and EIP-712 co-signer confirmations come from EVM RPC nodes (proxied through our Next.js BFF) and the Safe Transaction Service (`@safe-global/api-kit`).
- **Off-Chain Institutional Layer (PostgreSQL + Prisma):** Organization workspaces, saved Safe addresses, verified vendor Address Book labels, internal proposal titles/memos, invoice references, spending policy metadata, and single-use SIWE authentication nonces live in PostgreSQL behind an `HttpOnly` encrypted session cookie.
- **Indexing Layer (Ponder):** A standalone TypeScript indexer in `indexer/` indexes Safe `ExecutionSuccess`, `AddedOwner`, `RemovedOwner`, `ChangedThreshold`, and ERC-20 `Transfer`/`Approval` events into PostgreSQL to power instant historical charts, allowance discovery, and CSV accounting exports without hitting RPC log limits.
- **Simulation Layer (Tenderly BFF Proxy):** Every queued or draft transaction can be dry-run via `/api/simulate` using Safe storage-slot overrides so co-signers inspect exact balance diffs, internal call traces, and security warnings before signing.

---

## 2. UI / UX Design System (Flat Institutional Terminal)

Build a **flat, high-density, minimalist financial interface**:

### Visual Constraints
- **NO drop shadows** (`shadow-none` everywhere) and **NO color gradients** anywhere in the app.
- Establish hierarchy strictly through `1px` crisp borders, flat surface contrast, spacing, and typography.
- **Light-first institutional palette** (defined in `src/app/globals.css` via Tailwind CSS v4 `@theme` tokens):
  - Page Canvas: `#F8FAFC`
  - Elevated Surface / Cards / Tables: `#FFFFFF`
  - Subtle Surface / Table Header / Muted Panels: `#F1F5F9`
  - Primary Border: `#E2E8F0` | Active Border: `#94A3B8`
  - Primary Text: `#0F172A` | Secondary Text: `#475569` | Muted Text: `#64748B`
  - Primary Action Accent: `#0F172A` (Slate 900, white text, hover `#1E293B`)
  - Semantic Flat Badges (`1px` border, low-saturation background):
    - Verified / Executed / Inflow: bg `#ECFDF5`, text `#065F46`, border `#A7F3D0`
    - Pending / Nonce Conflict / Warning: bg `#FFFBEB`, text `#92400E`, border `#FDE68A`
    - Critical Risk / Revert / Unlimited Approval / `DELEGATECALL`: bg `#FEF2F2`, text `#991B1B`, border `#FECACA`
    - Info / Queued: bg `#F8FAFC`, text `#334155`, border `#CBD5E1`

### Typography & Data Formatting
- UI Font: `Inter` (via `next/font/google`).
- Financial & Web3 Font: `JetBrains Mono` with `tabular-nums` applied to ALL addresses, hashes, nonces, balances, USD amounts, gas metrics, and percentages.
- Every Ethereum address renders via a shared `<AddressDisplay />` component showing: optional verified Address Book label, truncated EIP-55 checksummed address (`0x1234...abcd`), one-click copy button, and block explorer link.

### Persistent App Shell Layout
- **Left Sidebar (`240px` fixed on desktop, slide-over drawer on mobile):**
  - Top: Brand wordmark (`AegisVault`) + **Safe Workspace Switcher** dropdown showing active Safe label, checksummed address, and threshold pill (e.g., `2 / 3`).
  - Navigation links: `Treasury`, `Queue` (with live pending count pill), `Batch Builder`, `Allowances` (with unlimited-approval risk count pill), `Governance`.
  - Bottom: Active Network indicator pill + Local Anvil Fork / Chain status.
- **Topbar (`56px` height, `1px` bottom border):**
  - Left: Page title & breadcrumb.
  - Right: **Batch Cart button** (opens right slide-over drawer showing count of queued calls ready to bundle), **SIWE Auth badge** (`Session Verified` or `Sign In to Edit Metadata`), and **RainbowKit ConnectButton** (`compact`).
- **Global Guard Banner:** Renders directly under the topbar whenever the connected wallet's `chainId` does not match the active Safe's `chainId` (with a one-click `Switch Network` button), or when connected wallet is NOT an owner of the active Safe (`Read-Only Mode`).

---

## 3. Project Setup, Dependencies & Environment Variables

### Installation Commands
```bash
# 1. Core Web3, Safe SDK & Data Fetching (wagmi v2 pinned for RainbowKit v2 peer alignment)
pnpm add wagmi@^2 viem@^2 @tanstack/react-query@^5 @rainbow-me/rainbowkit@^2 \
  @safe-global/protocol-kit@^8 @safe-global/api-kit@^5 @safe-global/types-kit@^4 @safe-global/safe-deployments

# 2. State, Forms, Validation, Sessions & Database
pnpm add zustand react-hook-form @hookform/resolvers zod iron-session @prisma/client

# 3. UI, Charts & CSV Utilities
pnpm add lucide-react recharts clsx tailwind-merge papaparse

# 4. Dev & Testing Dependencies
pnpm add -D prisma @types/papaparse @playwright/test @synthetixio/synpress tsx

# 5. ShadCN UI Primitives (configure with CSS variables and override all shadows to shadow-none)
pnpm dlx shadcn@latest add button card table badge tabs dialog sheet input label select \
  textarea separator alert skeleton tooltip dropdown-menu checkbox popover scroll-area
```

> **CRITICAL:** Do NOT install `siwe` or `ethers`. Use `viem/siwe` natively (`generateSiweNonce`, `createSiweMessage`, `parseSiweMessage`, `verifySiweMessage`).

### `.env.example` (Validate with Zod in `src/shared/config/env.ts`)
```env
# --- Client-Safe Public Vars (NEXT_PUBLIC_ ONLY) ---
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_WC_PROJECT_ID=""
NEXT_PUBLIC_DEFAULT_CHAIN_ID="8453"

# --- Server-Only Secrets (NEVER expose to client bundle) ---
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aegisvault"
IRON_SESSION_SECRET="replace-with-at-least-32-character-random-secret"

# Upstream RPC endpoints (used strictly inside /api/rpc/[chainId] and indexer)
RPC_URL_MAINNET=""
RPC_URL_BASE=""
RPC_URL_ARBITRUM=""
RPC_URL_SEPOLIA=""
RPC_URL_ANVIL="http://127.0.0.1:8545"

# Tenderly Simulation API (used strictly inside /api/simulate)
TENDERLY_ACCOUNT=""
TENDERLY_PROJECT=""
TENDERLY_ACCESS_KEY=""

# Optional Safe Transaction Service API Key
SAFE_API_KEY=""
```

> Load `IRON_SESSION_SECRET` and server secrets through lazy getter functions in `src/shared/config/env.ts` so `next build` static analysis never crashes when runtime env vars are absent during image builds.

---

## 4. Database Schema (`prisma/schema.prisma`)

Implement these exact models with PostgreSQL:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Organization {
  id           String             @id @default(cuid())
  name         String
  slug         String             @unique
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt
  safes        SafeWorkspace[]
  addressBook  AddressBookEntry[]
}

model SafeWorkspace {
  id               String           @id @default(cuid())
  organizationId   String
  organization     Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  label            String
  address          String           // Stored as EIP-55 checksummed address
  chainId          Int
  isDefault        Boolean          @default(false)
  createdAt        DateTime         @default(now())
  proposals        ProposalMeta[]
  spendingPolicies SpendingPolicy[]

  @@unique([address, chainId])
  @@index([organizationId])
}

model SiweNonce {
  id        String   @id @default(cuid())
  nonce     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([expiresAt])
}

model ProposalMeta {
  id            String            @id @default(cuid())
  safeTxHash    String            @unique
  safeId        String
  safe          SafeWorkspace     @relation(fields: [safeId], references: [id], onDelete: Cascade)
  nonce         Int
  title         String
  description   String?
  invoiceRef    String?
  category      String            @default("OPERATIONS") // PAYROLL | VENDOR | DEFI | GOVERNANCE | REVOKE | OPERATIONS
  createdBy     String            // Signer checksummed address
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  comments      ProposalComment[]

  @@index([safeId, nonce])
}

model ProposalComment {
  id         String       @id @default(cuid())
  proposalId String
  proposal   ProposalMeta @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  author     String       // Signer checksummed address
  body       String
  createdAt  DateTime     @default(now())

  @@index([proposalId])
}

model AddressBookEntry {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  address        String       // EIP-55 checksummed
  chainId        Int?         // Null means valid across all EVM chains
  label          String
  entityType     String       @default("VENDOR") // VENDOR | SIGNER | PROTOCOL | TREASURY
  notes          String?
  verifiedBy     String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, address, chainId])
}

model SpendingPolicy {
  id             String        @id @default(cuid())
  safeId         String
  safe           SafeWorkspace @relation(fields: [safeId], references: [id], onDelete: Cascade)
  tokenAddress   String
  maxSingleTxWei String        // Stored as stringified BigInt, never Float
  requiresMemo   Boolean       @default(true)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@unique([safeId, tokenAddress])
}
```

Include a `prisma/seed.ts` script that seeds a demo Organization (`Kodesy Institutional Treasury`), a default Safe workspace (configurable for Sepolia or local Anvil fork), 5 verified vendor/protocol Address Book entries, and 2 sample spending policies.

---

## 5. Canonical Smart Contracts & Web3 Configuration

- **Supported Chains (`src/shared/config/chains.ts`):** Ethereum Mainnet (`1`), Base (`8453`), Arbitrum One (`42161`), Sepolia (`11155111`), and optional Local Anvil Fork (`31337` when enabled in dev).
- **Canonical Safe Addresses:** Do NOT hardcode Safe deployment addresses manually. Resolve canonical `MultiSendCallOnly` and `SafeL2`/`Safe` v1.4.1 addresses dynamically via `@safe-global/safe-deployments` (`getMultiSendCallOnlyDeployment({ version: '1.4.1', network: String(chainId) })`).
- **Typed `as const` ABIs (`src/shared/web3/abis/`):**
  - `erc20.ts`: `name`, `symbol`, `decimals`, `balanceOf`, `allowance`, `approve`, `transfer`, `Transfer` event, `Approval` event.
  - `safe.ts`: `getOwners`, `getThreshold`, `nonce`, `VERSION`, `execTransaction`, `addOwnerWithThreshold`, `removeOwner`, `changeThreshold`, `isOwner`, `ExecutionSuccess` event.
  - `multiSendCallOnly.ts`: `multiSend(bytes transactions)`.

---

## 6. Exact BFF API Route Contracts

All route handlers must validate inputs with Zod, return structured JSON errors, and never leak stack traces or upstream API keys.

1. **`POST /api/rpc/[chainId]`** (JSON-RPC BFF Proxy)
   - Validates `chainId` against allowed chains.
   - Accepts both single JSON-RPC object and batch array (`wagmi` `{ batch: true }`).
   - Enforces strict method allowlist: `eth_chainId`, `eth_blockNumber`, `eth_call`, `eth_getBalance`, `eth_getCode`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_estimateGas`, `eth_feeHistory`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_getLogs`, `eth_sendRawTransaction`. Rejects any other method with `403`.
   - Applies sliding-window per-IP rate limiting (e.g., 120 req/min).
   - Forwards request server-side to the chain's upstream RPC URL and returns response.

2. **`POST /api/simulate`** (Pre-Execution Safe Simulator)
   - **Request Body:** `{ chainId: number, safeAddress: Address, signerAddress: Address, to: Address, value: string, data: Hex, operation: 0 | 1 }`
   - **Behavior:**
     - Builds a pre-validated Safe signature (`v = 1`) for `signerAddress` (`pad(signerAddress, 32) + 32 zero bytes + 0x01`).
     - Encodes `safe.execTransaction(...)` via `viem`.
     - Calls Tenderly Simulation API with `state_objects` overriding Safe storage slot `4` (`threshold`) to `1` so a 3-of-5 Safe can be simulated before collecting remaining signatures.
     - Runs server-side static risk heuristics (`analyzeTransactionRisk`) on `to`, `data`, and `operation` (flagging non-canonical `DELEGATECALL`, `maxUint256` ERC-20 approvals, `setApprovalForAll`, and unverified recipients).
   - **Response Body:**
     ```ts
     {
       success: boolean;
       gasUsed: number | null;
       revertReason: string | null;
       assetChanges: Array<{
         tokenSymbol: string;
         tokenAddress: string;
         from: string;
         to: string;
         rawAmount: string;
         formattedAmount: string;
         dollarValue?: string;
         direction: 'IN' | 'OUT';
       }>;
       callTrace: SimulatedCallNode | null;
       risks: Array<{
         severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
         code: string;
         title: string;
         detail: string;
       }>;
     }
     ```

3. **SIWE Auth Routes (`/api/auth/siwe/*`)**
   - `GET /api/auth/siwe/nonce`: Generates cryptographic nonce with `generateSiweNonce()`, stores in `SiweNonce` table with 5-minute TTL, returns `{ nonce }`.
   - `POST /api/auth/siwe/verify`: Accepts `{ message: string, signature: Hex }`. Parses message with `parseSiweMessage`, verifies `domain` strictly equals expected server host, atomically deletes matching unexpired nonce from `SiweNonce` table (preventing replay), calls `verifySiweMessage` via server `viem` PublicClient (supports both EOAs and ERC-1271 smart wallets), sets `iron-session` `HttpOnly` cookie (`SameSite=Strict`, `Secure` in prod) containing `{ address, chainId, issuedAt }`.
   - `GET /api/auth/siwe/session`: Returns `{ authenticated: boolean, address?: Address, chainId?: number }`.
   - `POST /api/auth/siwe/logout`: Destroys the `HttpOnly` session cookie.

4. **Off-Chain Metadata Routes (SIWE Session Protected)**
   - `GET / POST /api/proposals`: Fetches or creates `ProposalMeta` (title, description, invoiceRef, category) linked to a `safeTxHash`. Write operations require a valid SIWE session AND verify that the session address is an on-chain owner of the target Safe (`isOwner` check).
   - `POST /api/proposals/[safeTxHash]/comments`: Appends an audit comment from a verified Safe owner.
   - `GET / POST / DELETE /api/address-book`: Manages verified institutional vendor labels.

---

## 7. Page-by-Page Functional Specification

1. **`/treasury` (Treasury Overview)**
   - **KPI Strip (4 flat cards):** Total Liquid Value (USD), Stablecoin Ratio (%), Signer Quorum (`M of N` + Current Nonce), Pending Queue Count.
   - **Token Holdings Table:** Fetched in a single RPC call via `viem/actions` `multicall` (`balanceOf`, `decimals`, `symbol`). Columns: Asset, Balance (tabular mono), Price, Value (USD), Allocation %, Quick Action (`Add to Batch`).
   - **Historical Cashflow / Balance Chart:** Flat `recharts` Area/Bar chart (solid fill/stroke, zero gradients) backed by Ponder indexer data, plus **Export CSV** button for accounting reconciliation.
   - **Recent Executed Transactions Table:** Decoded action label, recipient (resolved against Address Book), amount, timestamp, explorer tx link.

2. **`/queue` (Multi-Sig Transaction Queue & Nonce Manager)**
   - Pulls pending Safe transactions via `@safe-global/api-kit`, enriches with PostgreSQL `ProposalMeta` and decoded calldata (`viem` `decodeFunctionData` + 4byte fallback).
   - **Nonce Grouping Engine:** Groups all pending proposals by `nonce` ascending.
     - Highlights the **Next Executable Nonce** (matching on-chain `safe.nonce()`).
     - When 2+ proposals share a nonce, renders an amber **Nonce Conflict Group** container explaining that executing one automatically invalidates all competing proposals at that nonce.
     - Provides a **"Create Rejection / Replacement Tx"** button that constructs a `0 ETH` self-transfer to the Safe at the exact conflicting nonce.
   - **Per-Proposal Action Row:** Signer progress bar (`2 / 3`), inline `Simulate` drawer trigger, `Co-Sign (EIP-712)` button, `Execute On-Chain` button (enabled only when confirmations >= threshold AND nonce === current on-chain nonce), and link to `/proposals/[safeTxHash]`.

3. **`/batch-builder` (Multi-Payout & CSV Batch Creator)**
   - **Single Entry Form (React Hook Form + Zod):** Token selector (ETH or ERC-20 from Safe balances), Recipient (with Address Book autocomplete + EIP-55 validation), Amount (validated numeric string converted via `parseUnits`, never JS float), Optional Memo/Invoice Ref.
   - **CSV Bulk Import (`papaparse`):** Upload `recipient,token,amount,memo` CSV with row-by-row validation preview highlighting invalid addresses or insufficient balance before adding to the Zustand Batch Cart.
   - **Pre-Proposal Review & Simulation:** Clicking **"Simulate & Propose Batch"** encodes a `MultiSendCallOnly` batch (`onlyCalls: true`), runs `/api/simulate`, displays net asset diffs + risk badges, and only enables the **"Sign & Propose"** button after review.

4. **`/allowances` (ERC-20 Allowance Auditor & Batch Revoker)**
   - Combines Ponder-indexed `Approval` events with curated protocol spender registries and queries live allowances in one `multicall` batch.
   - Table columns: Token, Spender (resolved label + address), Approved Amount (`Unlimited` red badge if `allowance === maxUint256`), Risk Level, Action (`Queue Revoke` -> pushes `approve(spender, 0n)` into Zustand Batch Cart).
   - Bulk select checkbox + **"Queue Selected Revocations"** button to revoke multiple spenders in a single multi-sig signature.

5. **`/governance` (Signers, Threshold, Policies & Address Book)**
   - **Safe Security Posture Card:** Safe version, signing threshold (`M of N`), fallback handler, guard address, owner list with labels.
   - **Governance Proposal Actions:** Forms to queue `addOwnerWithThreshold`, `removeOwner`, or `changeThreshold` into the Safe proposal flow.
   - **Institutional Address Book Tab:** Full CRUD table (SIWE-gated) for labeling counterparties (`VENDOR`, `SIGNER`, `PROTOCOL`, `TREASURY`) with instant propagation across all views.
   - **Spending Policy Warnings Tab:** Configure soft threshold rules per token (e.g., flag any single USDC payout exceeding 50,000 USDC or missing an invoice reference).

6. **`/proposals/[safeTxHash]` (Proposal Deep-Dive & Audit Report)**
   - Full **Pre-Execution Simulation Panel**: Status (`Will Succeed` / `Will Revert`), Gas Estimate, Net Asset Balance Diffs table, expandable Internal Call Trace tree, and Decoded Calldata inspector (supporting nested `MultiSendCallOnly` unpacking).
   - **Automated Security Risk Report:** Displays all findings from `analyzeTransactionRisk`. If a `CRITICAL` risk (such as non-canonical `DELEGATECALL`) is detected, requires an explicit confirmation checkbox before unlocking the `Co-Sign` button.
   - **Co-Signer Audit Trail & Discussion:** Lists confirmed owners with signatures, awaiting owners, and SIWE-authenticated internal review comments.

7. **Persistent Right Slide-Over: `<BatchCartDrawer />`**
   - Powered by Zustand (`src/features/tx-proposal/model/batch-cart.store.ts`).
   - Holds queued payouts, revocations, or governance calls across page navigation.
   - Allows reordering, removing items, running a dry-run simulation on the entire bundle, and proposing as one `MultiSendCallOnly` Safe transaction.

---

## 8. Advanced Folder Structure (Feature-Sliced Design)

Enforce strict unidirectional dependency flow: `app` -> `widgets` -> `features` -> `entities` -> `shared`.

```text
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── treasury/page.tsx
│   │   │   ├── queue/page.tsx
│   │   │   ├── batch-builder/page.tsx
│   │   │   ├── allowances/page.tsx
│   │   │   ├── governance/page.tsx
│   │   │   └── proposals/[safeTxHash]/page.tsx
│   │   ├── api/
│   │   │   ├── auth/siwe/{nonce,verify,session,logout}/route.ts
│   │   │   ├── rpc/[chainId]/route.ts
│   │   │   ├── simulate/route.ts
│   │   │   ├── proposals/route.ts
│   │   │   ├── proposals/[safeTxHash]/comments/route.ts
│   │   │   └── address-book/route.ts
│   │   ├── layout.tsx                       # Server Component: wagmi cookieToInitialState
│   │   ├── providers.tsx                    # Client Component: Wagmi + Query + RainbowKit
│   │   └── globals.css                      # Tailwind v4 flat tokens
│   │
│   ├── widgets/
│   │   ├── app-shell/                       # Sidebar, Topbar, SafeSwitcher, NetworkGuardBanner
│   │   └── batch-cart-drawer/               # Global transaction batching drawer
│   │
│   ├── features/
│   │   ├── tx-proposal/
│   │   │   ├── api/                         # Safe Protocol Kit & API Kit wrappers
│   │   │   ├── hooks/                       # useProposeSafeTx, useConfirmSafeTx, useExecuteSafeTx
│   │   │   ├── model/                       # Zustand batch cart, nonce grouping engine, Zod schemas
│   │   │   └── ui/                          # NonceGroupCard, ProposalRow, CsvUploader, TxStateBanner
│   │   ├── tx-simulation/
│   │   │   ├── hooks/                       # useSimulateSafeTx
│   │   │   ├── lib/                         # Tenderly parser & static risk analyzer
│   │   │   └── ui/                          # SimulationModal, BalanceDiffTable, CallTraceTree, RiskAlert
│   │   ├── allowance-auditor/
│   │   │   ├── hooks/                       # useSafeAllowances (Multicall + Ponder data)
│   │   │   └── ui/                          # AllowanceTable, BatchRevokeBar
│   │   ├── siwe-auth/
│   │   │   ├── hooks/                       # useSiweSession, useSiweSignIn
│   │   │   └── ui/                          # SiweStatusBadge, SiweAuthGate
│   │   └── governance-ops/
│   │       ├── hooks/                       # useAddressBook, useGovernanceProposals
│   │       └── ui/                          # OwnerList, ThresholdForm, AddressBookTable
│   │
│   ├── entities/
│   │   ├── safe/                            # useSafeInfo, useSafeBalances, Safe domain types
│   │   └── token/                           # TokenAmount, AddressDisplay, BigInt math utilities
│   │
│   └── shared/
│       ├── config/                          # wagmi.ts, chains.ts, env.ts, safe-deployments.ts
│       ├── web3/                            # abis/, bigint.ts, decode.ts, security.ts, multisend.ts
│       ├── auth/                            # session.ts (lazy iron-session + requireSiweSession)
│       ├── db/                              # prisma.ts (singleton client)
│       └── ui/                              # Flat ShadCN primitives (zero shadows/gradients)
│
├── indexer/                                 # Standalone Ponder TypeScript indexer workspace
│   ├── package.json
│   ├── ponder.config.ts                     # Indexes Safe & ERC-20 events into Postgres
│   ├── ponder.schema.ts                     # Indexed Transfer, Approval, SafeExecution tables
│   └── src/index.ts                         # Event handlers
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── foundry/
│   └── fork.sh                              # Local Anvil mainnet fork + Safe owner impersonation
└── e2e/
    └── treasury-flow.spec.ts                # Synpress + Playwright wallet E2E suite
```

---

## 9. Ponder Event Indexer Specification (`indexer/`)

Create a lightweight Ponder workspace in `indexer/` that indexes:
1. **Safe Contract Events:** `ExecutionSuccess`, `ExecutionFailure`, `AddedOwner`, `RemovedOwner`, `ChangedThreshold`, `SafeReceived`.
2. **Tracked ERC-20 Events:** `Transfer` (filtered where `from` or `to` is the active Safe) and `Approval` (filtered where `owner` is the active Safe).
3. Expose Ponder's built-in GraphQL/SQL API (or shared PostgreSQL schema) to power `/treasury` historical flow charts, CSV exports, and `/allowances` spender discovery. Include a clean fallback in Next.js read hooks so the UI degrades gracefully to direct Multicall reads if the indexer process is not running locally.

---

## 10. Non-Negotiable Security & Web3 Engineering Guardrails

1. **Zero Client-Side Secret Exposure:** Never use `NEXT_PUBLIC_` for RPC keys, Tenderly keys, or session secrets. All `wagmi` transports route to `/api/rpc/[chainId]` with `{ batch: true }`.
2. **Replay-Proof SIWE (`viem/siwe`):** Nonces expire in 5 minutes and are atomically deleted upon verification. Verify both `domain` and `nonce`. Sessions live exclusively in `HttpOnly`, `SameSite=Strict`, `Secure` (prod) `iron-session` cookies—never in `localStorage` or `sessionStorage`.
3. **Server-Side Ownership Enforcement:** Every mutating Next.js API route (`/api/proposals`, `/api/address-book`, comments) must verify the SIWE session AND verify on-chain via `viem` that the session wallet is a current owner of the target Safe.
4. **Safe Storage Slot-4 Simulation Override:** `/api/simulate` overrides Safe v1.4.1 threshold slot (`0x000...0004`) to `1` and injects a `v = 1` pre-validated owner signature so dry-runs never fail with `GS020`/`GS026` prior to quorum.
5. **`DELEGATECALL` Firewall:** Always build batches with `onlyCalls: true` (`MultiSendCallOnly`). Flag any queued transaction with `operation === 1` targeting a non-canonical contract as `CRITICAL`.
6. **Zero Floating-Point Financial Math:** All wei/token amounts remain `BigInt` (or numeric strings across JSON/forms). Format and parse exclusively via `viem` `formatUnits` / `parseUnits`.
7. **Zero Hydration Mismatches:** Use `wagmi` `ssr: true` with `cookieStorage`, read cookies in `src/app/layout.tsx` via `cookieToInitialState(getConfig(), cookieHeader)`, and instantiate `config` and `QueryClient` inside `useState` in `src/app/providers.tsx`.
8. **Bundle & RPC Efficiency:** Use standalone tree-shakable `viem/actions` (`multicall`, `readContract`) and set TanStack Query `staleTime: 15_000` to align with block cadence and eliminate RPC spam.
9. **Hardened HTTP Security Headers (`next.config.ts`):** Configure strict `Content-Security-Policy` (restricting `connect-src` to `'self'`, WalletConnect relay domains, and Safe Transaction Service APIs), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
10. **Explicit Transaction State Machine:** Handle `idle`, `simulating`, `awaiting_wallet_signature`, `user_rejected`, `proposed_offchain`, `pending_onchain`, `confirmed`, `reverted`, and `wrong_network`. User rejection must show a clean dismissible notice without clearing form inputs or Zustand cart items.

---

## 11. 7-Phase Execution Plan

Work through one phase at a time. Run `pnpm tsc --noEmit && pnpm build` at the end of every phase, report what was created and verified, and pause for confirmation before advancing:

- **Phase 1 — Scaffold, Design Tokens & Security Config:** Initialize Next.js App Router, Tailwind CSS v4 flat tokens (`globals.css`), ShadCN primitives (zero shadows/gradients), clean `pnpm` dependencies, full FSD directories, Zod `env.ts`, and `next.config.ts` security headers.
- **Phase 2 — SSR Web3 Plumbing & BFF RPC Proxy:** Implement `wagmi.ts` (`ssr: true`, `cookieStorage`), `chains.ts`, `safe-deployments.ts`, `layout.tsx`, `providers.tsx`, typed ABIs, BigInt utilities, and `/api/rpc/[chainId]` (allowlist + Zod + rate limit).
- **Phase 3 — Database, Seed & Replay-Proof SIWE Auth:** Write `prisma/schema.prisma`, `prisma/seed.ts`, `prisma.ts`, lazy `iron-session` helper, `/api/auth/siwe/*` routes using `viem/siwe`, and `features/siwe-auth` hooks/UI.
- **Phase 4 — Safe SDK Layer, Tenderly Simulator & Calldata Security:** Implement Safe Protocol Kit / API Kit wrappers (`onlyCalls: true`), `/api/simulate` with slot-4 threshold override, calldata + nested MultiSend decoder, `analyzeTransactionRisk`, and `viem` Multicall hooks (`useSafeInfo`, `useSafeBalances`, `useSafeAllowances`).
- **Phase 5 — App Shell & All 6 Pages:** Build `AppShell`, `BatchCartDrawer`, `/treasury`, `/queue` (with nonce conflict grouping & rejection tx builder), `/batch-builder` (with CSV import), `/allowances` (with batch revoke), `/governance`, and `/proposals/[safeTxHash]`.
- **Phase 6 — Ponder Indexer Workspace:** Set up `indexer/` (`ponder.config.ts`, `ponder.schema.ts`, event handlers) and connect `/treasury` charts, CSV accounting export, and `/allowances` spender discovery with clean Multicall fallback.
- **Phase 7 — Anvil Fork & Synpress E2E Verification:** Write `foundry/fork.sh` (mainnet/Base fork with Safe owner impersonation) and `e2e/treasury-flow.spec.ts` (Synpress + Playwright tests covering wallet connect, wrong-network recovery, simulation diff modal, rejected signature resilience, and batch proposal).
