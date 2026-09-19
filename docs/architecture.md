# Architecture

```
Web (Next.js) ── owner wallet signs ──► Treasury contract (Arc) ◄── agent key (server) ── Agent (decide + execute)
      │                                        │ events                                        ▲
      └──────── REST ──► API (Fastify/Prisma) ◄┘ indexer                                      │
                              └──────────── invoices, decisions, audit trail ──────────────────┘
```

- **Source of truth for money:** the contract. Balances, limits, spend counters, pause state are read live.
- **Source of truth for the activity feed:** contract events, rebuilt by `apps/api/src/indexer.ts` (idempotent).
- **Off-chain state:** supplier names, invoices, agent decisions, audit trail (PRD §32).
- **Invoice flow:** submit → analyze (agent reads policy from chain, decides) → execute (`executePayment`, or `requestPayment` when the owner must approve) → indexer marks PAID.
