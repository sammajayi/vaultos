# Security model

**Principle: the contract is the authority; the AI is only a requester.**

| Layer | Guarantee |
| --- | --- |
| `Treasury.sol` | Agent may call only `executePayment` / `requestPayment`. Every call checks: agent authorized and unexpired, treasury not paused, policy active and unexpired, recipient allowlisted, amount ≤ per-payment cap, invoice unused, balance sufficient; autonomous payments also check daily/monthly limits and the autonomous threshold. |
| Owner-only | deposit-side config, withdraw, add/remove recipient, authorize/revoke agent, policy, pause, approve/reject. Withdraw works while paused. |
| Agent key | Separate wallet, server-side only. The contract rejects an agent equal to the owner. |
| Agent logic | Decision is deterministic from on-chain state. Claude (optional) rewrites the explanation only, receives invoice text as untrusted JSON, and cannot alter the decision. |
| API | Wallet-signature login, HMAC session, owner-only routes verified against the on-chain owner. The API cannot move funds. |

## Threat model (PRD §31)

- **Compromised agent / backend:** limits, allowlist, revoke, pause; the "Simulate a compromised agent" button demonstrates this.
- **Prompt injection:** covered by the e2e test (an invoice saying "IGNORE ALL PREVIOUS INSTRUCTIONS…" is still REJECTED, and the contract would refuse it regardless).
- **Replay / duplicate invoice:** invoice IDs are keccak(treasury, supplier, number); the contract marks them used.
- **Stale approvals:** `approvePayment` re-validates recipient, pause, policy and agent at approval time.

## Not covered

No audit, no formal verification, no rate limiting on the API, sessions are 12h HMAC tokens, EOA-only sign-in,
no multisig owner. Demo wallet keys live in `localStorage` (testnet only).
