# Demo script (3-5 min)

Automated version: `pnpm --filter @vaultos/api e2e` runs every step below with assertions.

1. **Create treasury.** Connect (or demo wallet), keep the default policy, click *Create treasury*. Treasury > *Add funds* (25,000 USDC).
2. **Rules.** Policies: add AWS and Supplier A (one signature each).
3. **$750 AWS invoice.** Invoices > *New invoice* > *Analyze invoice*: the lock opens, *Pay $750 now*. Show the transaction link.
4. **$4,500 Supplier A.** Analyze: bolt held. *Send to owner for approval*, then Approvals > *Approve and pay*.
5. **Attack.** New invoice, "Someone not on my approved list", $20,000. Analyze: rejected. Open it and click *Simulate a compromised agent*: the contract refuses (unapproved recipient + over cap).
6. **Pause.** *Emergency pause*, submit another invoice: rejected. *Resume*.
