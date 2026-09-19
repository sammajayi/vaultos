# Demo script (3-5 min)

Automated version: `pnpm --filter @vaultos/api e2e` runs every step below with assertions.

1. **Create treasury.** Connect (or demo wallet), keep the default policy, click *Create treasury*. Treasury > *Add funds* (25,000 USDC).
2. **Rules.** Policies: add AWS and Supplier A (one signature each).
3. **Scenario A: $750 AWS, autonomous.** Invoices > *New invoice* > *Analyze invoice*: the lock opens, *Pay $750 now*. Show the transaction link.
4. **Scenario B: $3,500, human approval.** Analyze: bolt held. *Send to owner for approval*, then Approvals > *Approve and pay*.
5. **Scenario C: $20,000, unknown wallet.** New invoice, "Someone not on my approved list". Analyze: rejected. Open it and click *Simulate a compromised agent*: the contract refuses (unapproved recipient, over the cap).
6. **Agent-to-agent.** Agents > *Approve Research Agent*, ask a question, *Buy answer for 0.25 USDC*: the Payment Agent pays the Research Agent on-chain, which verifies the payment before answering.
7. **Pause.** *Emergency pause*, submit another invoice or buy research: refused. *Resume*.

Plain API form of step 3-4: `POST /treasuries/:address/agent/decide` with `{ "recipient": "0x...", "amount": "750", "description": "AWS monthly bill" }` returns `{ "decision": "AUTONOMOUS_APPROVAL", "reason": "..." }`.
