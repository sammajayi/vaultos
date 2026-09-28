# VaultOS

> Give software the ability to move money, without giving AI the keys.

**VaultOS lets businesses give AI agents controlled access to their USDC treasury, while smart contracts
enforce spending policies onchain.**

A business funds a USDC treasury on **Arc**, sets spending policy, and lets an AI Payment Agent handle invoices.
The agent can only *ask* the treasury to pay. The contract decides. Spec, including the locked MVP:
[`vaultos_arc_hackathon_prd.md`](./vaultos_arc_hackathon_prd.md).

```
          AI PAYMENT AGENT      HUMAN APPROVER
                    └──────┬──────┘
                     POLICY ENGINE
                           ↓
                   TREASURY CONTRACT
                           ↓
                     ARC  →  USDC
```

## The MVP, item by item

| # | Item | Where |
| - | ---- | ----- |
| 1 | Treasury contract: deposit, withdraw, agent registration, recipients, limits, pause, authorized payments, audit events | `contracts/Treasury.sol` |
| 2 | Policy engine: `maxTransaction`, `dailyLimit` (+ monthly, expiry), `approvedRecipients`, `agentActive`, `humanApprovalThreshold` | `contracts/PolicyEngine.sol` |
| 3 | AI Payment Agent: `{recipient, amount, description}` → `{decision, reason}` | `apps/agent`, `POST /treasuries/:a/agent/decide` |
| 4 | Human approval flow | Approvals screen |
| 5 | Dashboard (balance, daily/monthly spend, agents, policies, activity, pending, rejected) | `apps/web` |
| 6 | Security demonstration: $750 paid, $20,000 unknown wallet refused by the contract, $3,500 approved by a human | `pnpm --filter @vaultos/api e2e` |
| 7 | Agent-to-agent: Payment Agent pays a Research Agent $0.25 under the same policy | Agents screen |

## Problem

Automation that holds a treasury key means one bug, stolen credential or prompt injection can move funds
outside the company's rules.

## Solution

Separate **intelligence** from **authority**.

```
Invoice → Agent (decides) → Treasury contract (enforces) → USDC on Arc
                                   ↑
                        Owner approves anything above the agent's limit
```

The **PolicyEngine** holds the rules (recipient allowlist, per-payment cap, daily and monthly limits,
human-approval threshold, policy and agent expiry). The **Treasury** holds the USDC and asks the engine to
evaluate every payment, then adds pause, duplicate-invoice protection and balance checks. The agent has no
`transfer()`; it can call only `executePayment` and `requestPayment`.

## Why Arc

USDC is the native asset and gas token, finality is sub-second, and the chain is EVM-compatible, so a
policy-enforcing treasury is a normal Solidity contract with USDC-denominated settlement. Details that
mattered here (verified against docs.arc.io):

- Testnet chain ID `5042002`, RPC `https://rpc.testnet.arc.io`; mainnet `5042`.
- USDC ERC-20 interface `0x3600…0000` uses **6 decimals** (native/gas view is 18). The contract uses the ERC-20 view.
- Gas is paid in USDC (fund the deployer and agent wallets from the [Circle faucet](https://faucet.circle.com)).

## Architecture

| Path | What it is |
| --- | --- |
| `contracts/` | `Treasury.sol` (funds, spend counters, requests, pause), `PolicyEngine.sol` (rules, agents, recipients), `TreasuryFactory.sol` |
| `test/` | Foundry tests: 41 incl. a fuzz test that the agent can never pay outside policy |
| `apps/agent` | Decision pipeline: parse → policy context (from chain) → deterministic decision; optional Claude-written explanation; restricted on-chain executor |
| `apps/api` | Fastify + Prisma/Postgres. Wallet-signature auth, invoice workflow, event indexer, audit trail |
| `apps/web` | Next.js app. Owner actions are signed by the user's wallet |
| `packages/sdk`, `packages/types` | ABIs, Arc chain config, USDC helpers, shared types |

The PRD's `AgentRegistry` is folded into `PolicyEngine`. Category restrictions are stored off-chain as
recipient metadata (hash on-chain).

## Security model

See [`docs/security.md`](./docs/security.md). In short: the contract is authoritative; the agent key is
server-side, never the owner, and never `NEXT_PUBLIC_*`; the LLM only rewrites the explanation and cannot
change a decision; invoice text is treated as untrusted.

## Run it locally

### Prerequisites

- Node 20+ and pnpm 9 (`corepack enable` picks up the pinned version)
- [Foundry](https://book.getfoundry.sh) (`forge`, `anvil`)
- Postgres running locally (default `localhost:5432`)

### 1. Install and configure

```bash
pnpm install
cp .env.example .env            # monorepo root; read by the API and by forge scripts
createdb vaultos
pnpm db:push                    # creates the schema and generates the Prisma client
```

Fill in `.env`. The API refuses to start if any of these is missing or malformed:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | e.g. `postgresql://localhost:5432/vaultos` |
| `SESSION_SECRET` | any string of 8+ characters |
| `ARC_RPC_URL`, `ARC_CHAIN_ID`, `ARC_USDC_ADDRESS` | see the chain sections below |
| `TREASURY_FACTORY_ADDRESS` | printed by the deploy script |
| `AGENT_PRIVATE_KEY` | `0x` + 64 hex chars. A dedicated key, never the treasury owner |
| `API_PORT` | optional, defaults to `4000` |
| `WEB_ORIGIN` | optional, comma-separated CORS origins. Defaults to `http://localhost:3000`; the web app runs on `3100`, so set `http://localhost:3100` |
| `RESEARCH_AGENT_ADDRESS` | optional, any address you own (it only receives the $0.25 payments) |

The web app reads its own env file. Create `apps/web/.env.local` (public values only, never keys):

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.io
NEXT_PUBLIC_ARC_CHAIN_ID=5042002
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_EXPLORER_URL=https://explorer.testnet.arc.io
NEXT_PUBLIC_FACTORY_ADDRESS=<same as TREASURY_FACTORY_ADDRESS>
```

### 2. Pick a chain

**Local chain (fastest, no faucet):**

```bash
anvil &
DEPLOYER_PRIVATE_KEY=<anvil key> forge script scripts/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Put the printed USDC and factory addresses in `.env` (`ARC_USDC_ADDRESS`, `TREASURY_FACTORY_ADDRESS`), set
`ARC_CHAIN_ID=31337` and `ARC_RPC_URL=http://127.0.0.1:8545`, and mirror them in `apps/web/.env.local`.

**Arc testnet:**

```bash
# 1. fund the DEPLOYER and AGENT wallets with testnet USDC (gas): https://faucet.circle.com
# 2. deploy
forge script scripts/Deploy.s.sol --rpc-url https://rpc.testnet.arc.io --broadcast
# 3. set TREASURY_FACTORY_ADDRESS, ARC_CHAIN_ID=5042002, ARC_RPC_URL,
#    ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
```

### 3. Start the services

The API and the web app are separate processes; the web app shows errors until the API is up.

```bash
pnpm dev                          # API (:4000) and web (:3100) together, via turbo
# or individually:
pnpm --filter @vaultos/api dev    # API with auto-reload
pnpm --filter @vaultos/web dev    # http://localhost:3100
```

Check the API: `curl localhost:4000/health` should return `200`.

### 4. Verify

```bash
forge test                        # contracts
pnpm test                         # agent and API unit tests
pnpm --filter @vaultos/api e2e    # full PRD demo with assertions (API must be running, local chain)
```

### Troubleshooting

- **"API not available" in the browser:** the API isn't running, or `NEXT_PUBLIC_API_URL` doesn't match `API_PORT`.
- **CORS errors:** add the web origin (e.g. `http://localhost:3100`) to `WEB_ORIGIN` and restart the API.
- **`Invalid environment:` on API start:** the message lists the offending variables; compare with `.env.example`.
- **Database errors:** make sure Postgres is running and you ran `pnpm db:push`.

The "Try with a demo wallet" button creates a throwaway key in the browser (testnet only).
`ANTHROPIC_API_KEY` is optional; without it the agent's explanations are rule-generated.

## Demo

See [`docs/demo.md`](./docs/demo.md).

## Known limits

- Not deployed to Arc testnet by the build (needs a funded key you control). Contracts and app are verified locally on anvil; run `Deploy.s.sol` for Arc.
- Local anvil is a standard EVM, not Arc's; Arc-specific behaviour (e.g. 20 gwei fee floor) is untested here. Arc's own tooling: `arc-anvil`.
- Owner-approved payments are not gated by daily/monthly limits (they count toward them). Deliberate; see contract docs.
- "Simulate a compromised agent" is a dry-run through the real contract; it moves no funds.
- Unaudited hackathon code. Do not use with real funds.
