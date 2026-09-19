# Autonomous Treasury Network on Arc
## Hackathon PRD, Architecture & Build Plan

**Working title:** VaultOS  
**Tagline:** Give software the ability to move money — without giving AI the keys.

---

# 0. Locked MVP (supersedes anything broader below)

**One-sentence definition:** VaultOS lets businesses give AI agents controlled access to their USDC treasury, while smart contracts enforce spending policies onchain.

```text
                    VAULTOS
                       │
          ┌────────────┴────────────┐
          │                         │
      AI PAYMENT AGENT         HUMAN APPROVER
          │                         │
          └────────────┬────────────┘
                       ↓
                POLICY ENGINE
                       ↓
             TREASURY CONTRACT
                       ↓
                      ARC
                       ↓
                     USDC
```

## The 7 things to build

1. **Treasury smart contract**: deposit and withdraw USDC, register an authorized agent, add/remove approved recipients, set spending limits, emergency pause, execute authorized payments, emit payment and audit events.
2. **Policy engine**: starts with only `maxTransaction`, `dailyLimit`, `approvedRecipients`, `agentActive`, `humanApprovalThreshold`. (Monthly limit and expiry were added; they are small extensions of the same engine.)
3. **AI Payment Agent**: input `{ recipient, amount, description }`; output `{ decision, reason }` where decision is `AUTONOMOUS_APPROVAL`, `HUMAN_APPROVAL` or `REJECT`.
4. **Human approval flow**: the dashboard separates "AWS, $750, executes automatically" from "Vendor X, $3,500, approval required". Approve triggers the transaction.
5. **Treasury dashboard**: USDC balance, daily spending, monthly spending, active agents, spending policies, recent transactions, pending approvals, rejected transactions. No fake numbers; everything comes from the chain.
6. **Security demonstration (mandatory)**: $750 AWS is approved and paid on Arc; $20,000 to an unknown wallet is rejected by the smart contract; $3,500 AWS needs human approval, then is approved and paid on Arc.
7. **Agent-to-agent payment**: Payment Agent pays a Research Agent $0.25 USDC on Arc, under the same policy. One controlled machine-to-machine payment, not a marketplace.

## Build order

1. **Blockchain**: Arc connection, USDC, Treasury, tests, deploy. No AI yet.
2. **Backend**: API for Treasury, Payments, Policies, Approvals, Agent.
3. **Agent**: connect the AI to the backend. The AI never owns the treasury (`AI → Private Key → Treasury` is BAD; `AI → Payment Request → Policy Engine → Treasury Contract → Arc` is GOOD).
4. **Frontend**: dashboard built around real blockchain transactions.
5. **Demo**: three scripted scenarios (A autonomous $750, B human approval $3,500, C malicious $20,000 unknown recipient). Only after these are solid: cross-chain funding.

## Implementation status (as built)

| # | Item | Status |
| - | ---- | ------ |
| 1 | Treasury contract | Built. `Treasury.sol` + `TreasuryFactory.sol`; 41 Foundry tests |
| 2 | Policy engine | Built as its own contract, `PolicyEngine.sol`, one per treasury. Treasury calls it on every payment; only the Treasury can change it |
| 3 | Payment Agent | Built. `POST /treasuries/:a/agent/decide`; decision is deterministic from on-chain state, Claude (optional) only writes the explanation |
| 4 | Human approval | Built. Approvals screen; owner signs `approvePayment` / `rejectPayment` |
| 5 | Dashboard | Built. Rejected/blocked items appear in the activity feed and Transactions |
| 6 | Security demo | Built and automated: `pnpm --filter @vaultos/api e2e` |
| 7 | Agent-to-agent | Built. Research Agent sells answers at $0.25; verifies the on-chain payment before answering |
| - | Arc testnet deployment | **Not done**: needs a funded key. Verified on local anvil only |

Deviations from the sections below: `AgentRegistry` is folded into `PolicyEngine`; category restrictions are off-chain metadata; the hard per-payment cap (`maxTransaction`) is separate from the autonomous limit (`humanApprovalThreshold`); owner-approved payments count toward but are not blocked by daily/monthly limits.

---

# 1. Executive Summary

VaultOS is an autonomous treasury and invoice-payment platform built on Arc.

Businesses create a USDC treasury, define spending policies, and authorize specialized AI agents to perform financial operations within those constraints.

The core principle is:

> **The agent can propose and initiate financial actions, but the smart contract determines whether the action is actually allowed.**

The first hackathon MVP focuses on **autonomous invoice payments**.

A company can:

1. Fund an Arc treasury with USDC.
2. Configure spending policies.
3. Add approved suppliers.
4. Submit an invoice.
5. Let a payment agent analyze the invoice.
6. Have the agent request execution.
7. Let the treasury contract enforce limits and permissions.
8. Settle the payment in USDC on Arc.
9. Record the decision, policy checks, and transaction hash.

The product demonstrates Arc as a settlement layer for programmable and agentic financial activity.

---

# 2. Problem

Businesses perform repetitive treasury operations:

- Paying invoices
- Paying suppliers
- Moving operating capital
- Managing recurring payments
- Funding accounts on different chains
- Monitoring spending limits
- Approving transactions

Traditional automation usually looks like:

```text
Business
   ↓
Backend
   ↓
API / Private Key
   ↓
Blockchain
```

This creates a problematic trust model.

If an automated backend or AI agent has direct access to a treasury key, a bug, compromised credential, malicious prompt, or incorrect decision can potentially move funds outside the company's intended rules.

Businesses need automation **without surrendering financial control**.

---

# 3. Solution

VaultOS separates **decision-making** from **financial authority**.

```text
                 BUSINESS
                     |
                     v
              ┌─────────────┐
              │   Treasury  │
              │   Policies  │
              └──────┬──────┘
                     |
          ┌──────────┴──────────┐
          |                     |
          v                     v
    AI Payment Agent       Human Approver
          |                     |
          └──────────┬──────────┘
                     v
              Policy Validation
                     |
                     v
              Treasury Contract
                     |
                     v
                    ARC
                     |
                     v
                  USDC
```

The AI agent never receives unrestricted control over the treasury.

The smart contract enforces:

- Maximum transaction amount
- Daily spending limits
- Monthly spending limits
- Recipient allowlists
- Agent permissions
- Expiration
- Human approval thresholds
- Emergency pause

---

# 4. Product Vision

VaultOS should eventually become an **onchain operating system for autonomous business finance**.

Potential future agents:

### Payment Agent
Handles invoices and supplier payments.

### Payroll Agent
Handles recurring payroll operations.

### Treasury Agent
Monitors balances and moves capital according to policy.

### FX Agent
Handles currency conversion and cross-border settlement.

### Investment Agent
Deploys idle treasury funds into approved strategies.

### Compliance Agent
Checks transactions against business policies.

### Procurement Agent
Receives purchase requests and manages approved supplier payments.

For the hackathon, only the **Payment Agent** needs to be production-quality.

---

# 5. Hackathon MVP

## Core use case

> A business receives an invoice and an AI agent autonomously pays it in USDC on Arc, provided the transaction satisfies the company's onchain policy.

---

## MVP user journey

### Step 1 — Create treasury

User connects wallet and creates a VaultOS treasury.

```text
Treasury
Address: 0x...
Network: Arc
Asset: USDC
Balance: $25,000
```

---

### Step 2 — Configure policy

Example:

```text
Maximum autonomous payment: $1,000
Maximum daily spend: $5,000
Maximum monthly spend: $25,000

Approved recipients:
- AWS
- Supplier A
- Supplier B

Payments above $1,000:
Human approval required
```

---

### Step 3 — Add supplier

```text
Supplier:
AWS

Wallet:
0xABC...

Category:
Cloud Infrastructure
```

---

### Step 4 — Submit invoice

Example:

```text
Invoice
-------------------------
Supplier: AWS
Invoice #: AWS-4921
Amount: $750 USDC
Due date: Sept 30
Description: Cloud services
```

---

### Step 5 — Agent analyzes invoice

The payment agent checks:

- Supplier identity
- Supplier allowlist
- Amount
- Invoice status
- Treasury balance
- Daily spending
- Transaction limit
- Policy rules

Result:

```text
Payment approved for autonomous execution.

Amount: $750
Recipient: AWS
Policy: Cloud Services
Maximum allowed: $1,000
Daily remaining: $4,250
```

---

### Step 6 — Agent executes

The agent calls the treasury contract.

The contract independently validates:

```text
✓ Agent authorized
✓ Recipient approved
✓ Amount <= transaction limit
✓ Daily limit not exceeded
✓ Treasury not paused
✓ Authorization not expired
```

---

### Step 7 — Arc settlement

USDC moves from the treasury to the supplier.

The application displays:

```text
PAYMENT SETTLED

AWS
$750 USDC

Network:
Arc

Transaction:
0x...

Status:
Confirmed
```

---

# 6. Human Approval Flow

If the invoice exceeds the autonomous threshold:

```text
Invoice: $3,500

Agent:
Payment appears valid.

Policy:
Autonomous limit = $1,000

Result:
HUMAN APPROVAL REQUIRED
```

The UI displays:

```text
┌────────────────────────────────────┐
│ Approval Required                  │
│                                    │
│ Supplier       Supplier A          │
│ Amount         $3,500              │
│ Reason         Equipment           │
│                                    │
│ Agent checks                       │
│ ✓ Supplier approved                │
│ ✓ Treasury funded                  │
│ ✓ Invoice valid                    │
│                                    │
│ Policy                              │
│ ⚠ Amount exceeds autonomous limit │
│                                    │
│ [ Reject ]      [ Approve ]        │
└────────────────────────────────────┘
```

Human approval is then required before the contract permits execution.

---

# 7. Emergency Controls

The treasury owner can pause the system.

```text
EMERGENCY PAUSE

All agent-controlled transactions:
BLOCKED
```

This is important because the product is designed around autonomous financial activity.

---

# 8. Product Requirements

## 8.1 Authentication

MVP:

- Wallet connection
- Optional email authentication
- Wallet becomes treasury owner

---

## 8.2 Treasury

The treasury must support:

- Creation
- Ownership
- USDC deposits
- USDC withdrawals
- Balance display
- Agent authorization
- Policy configuration
- Pause/unpause

---

## 8.3 Policies

A policy should contain:

```solidity
struct Policy {
    uint256 maxTransactionAmount;
    uint256 dailyLimit;
    uint256 monthlyLimit;
    uint256 approvalThreshold;
    uint256 expiresAt;
    bool active;
}
```

Additional policy data:

- Recipient allowlist
- Agent allowlist
- Category restrictions

---

## 8.4 Agent permissions

Each agent should have:

```text
Agent address
Treasury
Permissions
Expiration
Active status
```

The treasury owner can:

- Add agent
- Remove agent
- Pause agent
- Change limits

---

## 8.5 Recipients

Recipients should support:

```text
Name
Wallet address
Category
Status
```

Example:

```text
AWS
0x...
Cloud Infrastructure
APPROVED
```

---

## 8.6 Invoice

MVP invoice fields:

```text
id
supplier
supplierAddress
amount
currency
description
invoiceNumber
dueDate
status
createdAt
```

Statuses:

```text
PENDING
ANALYZING
APPROVED
AWAITING_HUMAN_APPROVAL
EXECUTING
PAID
REJECTED
FAILED
```

---

## 8.7 Agent reasoning

The agent should produce structured output.

Example:

```json
{
  "decision": "APPROVE",
  "reason": "Invoice matches an approved supplier and is below the autonomous payment limit.",
  "checks": {
    "recipientApproved": true,
    "amountWithinLimit": true,
    "dailyLimitAvailable": true,
    "treasuryFunded": true
  }
}
```

The agent's explanation is informational.

The smart contract remains the final enforcement layer.

---

# 9. Smart Contract Architecture

Recommended contracts:

```text
contracts/
├── TreasuryFactory.sol
├── Treasury.sol
├── PolicyManager.sol
├── AgentRegistry.sol
└── interfaces/
    └── ITreasury.sol
```

For a hackathon, these can also be consolidated into fewer contracts if necessary.

---

# 10. Treasury Contract

The Treasury contract is the financial authority.

Responsibilities:

- Hold USDC
- Track owner
- Track agents
- Track policy
- Track recipients
- Validate payment requests
- Track spending
- Execute transfers
- Pause/unpause

Conceptual API:

```solidity
function deposit(uint256 amount) external;

function withdraw(
    address token,
    uint256 amount,
    address recipient
) external;

function authorizeAgent(
    address agent
) external;

function revokeAgent(
    address agent
) external;

function addRecipient(
    address recipient,
    bytes32 metadataHash
) external;

function removeRecipient(
    address recipient
) external;

function updatePolicy(
    Policy calldata policy
) external;

function executePayment(
    address recipient,
    uint256 amount,
    bytes32 invoiceId
) external;
```

---

# 11. Critical Security Rule

Do not allow:

```solidity
agent.transfer(anywhere, anyAmount);
```

Instead:

```solidity
executePayment(...)
    -> verifyAgent()
    -> verifyRecipient()
    -> verifyPolicy()
    -> verifyLimit()
    -> verifyPauseState()
    -> updateSpending()
    -> transferUSDC()
```

The contract should reject invalid actions regardless of what the AI agent says.

---

# 12. Spending Limits

The contract should track:

```text
dailySpent
monthlySpent
```

Conceptually:

```solidity
require(
    amount <= policy.maxTransactionAmount,
    "EXCEEDS_TX_LIMIT"
);

require(
    dailySpent + amount <= policy.dailyLimit,
    "EXCEEDS_DAILY_LIMIT"
);

require(
    monthlySpent + amount <= policy.monthlyLimit,
    "EXCEEDS_MONTHLY_LIMIT"
);
```

---

# 13. Human Approval Architecture

For the hackathon, keep human approval simple.

Option A:

```text
Agent requests payment
        ↓
Contract creates pending payment
        ↓
Human signs approval
        ↓
Contract executes
```

Example:

```solidity
function requestPayment(...) external returns (uint256 requestId);

function approvePayment(uint256 requestId) external;

function rejectPayment(uint256 requestId) external;
```

The owner must approve requests above the autonomous threshold.

---

# 14. Events

Emit events for every meaningful action.

```solidity
event TreasuryCreated(
    address indexed treasury,
    address indexed owner
);

event AgentAuthorized(
    address indexed treasury,
    address indexed agent
);

event AgentRevoked(
    address indexed treasury,
    address indexed agent
);

event PaymentRequested(
    uint256 indexed requestId,
    address indexed recipient,
    uint256 amount
);

event PaymentExecuted(
    uint256 indexed requestId,
    address indexed recipient,
    uint256 amount,
    bytes32 invoiceId
);

event PaymentRejected(
    uint256 indexed requestId
);

event TreasuryPaused(
    address indexed treasury
);
```

These events become the foundation for the dashboard's activity feed.

---

# 15. Backend Architecture

Use the backend for application state and orchestration, not as the final authority over money.

```text
apps/
├── web/
├── api/
└── agent/
```

Possible backend stack:

- Node.js
- TypeScript
- PostgreSQL
- Prisma
- viem
- REST API

---

# 16. Database Schema

Core tables:

```text
users
treasuries
agents
recipients
policies
invoices
payment_requests
transactions
```

### users

```text
id
walletAddress
createdAt
```

### treasuries

```text
id
address
ownerId
network
createdAt
```

### agents

```text
id
treasuryId
name
address
status
createdAt
```

### recipients

```text
id
treasuryId
name
walletAddress
category
status
```

### policies

```text
id
treasuryId
maxTransactionAmount
dailyLimit
monthlyLimit
approvalThreshold
expiresAt
active
```

### invoices

```text
id
treasuryId
recipientId
invoiceNumber
amount
description
dueDate
status
createdAt
```

### payment_requests

```text
id
invoiceId
amount
recipient
agentDecision
approvalRequired
status
requestTxHash
executionTxHash
createdAt
```

---

# 17. Agent Architecture

The agent should be a controlled service.

```text
Invoice
   ↓
Parser
   ↓
Policy Context
   ↓
Decision Engine
   ↓
Payment Request
   ↓
Smart Contract
```

The agent should not directly decide that money has been transferred.

Instead:

```text
Agent:
"Request this payment."

Contract:
"Is this allowed?"

Contract:
YES → execute
NO  → revert
```

---

# 18. Agent Decision Pipeline

### Stage 1 — Parse

Extract:

```text
Supplier
Amount
Invoice number
Due date
Description
```

### Stage 2 — Identify supplier

Match supplier against the treasury's approved recipients.

### Stage 3 — Evaluate policy

Check:

```text
Transaction limit
Daily limit
Monthly limit
Recipient status
Agent permissions
```

### Stage 4 — Decide

Possible outcomes:

```text
AUTONOMOUS_APPROVAL
HUMAN_APPROVAL
REJECT
```

### Stage 5 — Execute or request approval

---

# 19. AI Should Return Structured Data

Do not build the system around free-form AI output.

Use a schema such as:

```typescript
type PaymentDecision = {
  decision:
    | "AUTONOMOUS_APPROVAL"
    | "HUMAN_APPROVAL"
    | "REJECT";

  reason: string;

  checks: {
    recipientApproved: boolean;
    amountWithinLimit: boolean;
    dailyLimitAvailable: boolean;
    monthlyLimitAvailable: boolean;
    treasuryFunded: boolean;
  };
};
```

This makes the agent easier to validate and test.

---

# 20. Frontend Architecture

Recommended:

```text
apps/web/
├── app/
│   ├── dashboard/
│   ├── treasury/
│   ├── agents/
│   ├── invoices/
│   ├── approvals/
│   └── transactions/
├── components/
│   ├── treasury/
│   ├── agents/
│   ├── invoices/
│   └── transactions/
├── lib/
│   ├── arc/
│   ├── contracts/
│   └── api/
└── hooks/
```

---

# 21. Main Screens

## Dashboard

Display:

```text
Total Treasury
Available USDC
Today's Spending
Monthly Spending
Pending Approvals
Active Agents
```

Activity:

```text
✓ AWS             $750
✓ Supplier A      $420
⚠ Supplier B      $3,500
✕ Unknown         $1,200
```

---

## Treasury

Show:

- Treasury address
- USDC balance
- Spending limits
- Deposits
- Withdrawals
- Pause status

---

## Agents

Show:

```text
Payment Agent
ACTIVE

Authority:
$1,000 / transaction

Daily:
$5,000

Status:
ACTIVE
```

---

## Policies

Editable:

```text
Maximum autonomous payment
Daily limit
Monthly limit
Human approval threshold
Approved recipients
```

---

## Invoices

Table:

```text
Invoice
Supplier
Amount
Due
Agent decision
Status
```

---

## Approvals

Only display transactions requiring human approval.

---

## Transactions

Display:

```text
Type
Amount
Recipient
Invoice
Agent
Policy
Transaction hash
Timestamp
Status
```

---

# 22. Security Architecture

Security is a major part of the hackathon story.

## Principle 1

**Never give the AI unrestricted private-key access to treasury funds.**

---

## Principle 2

**Onchain policy is authoritative.**

The backend cannot override contract limits.

---

## Principle 3

**Least privilege.**

Agents should only have the permissions required for their task.

---

## Principle 4

**Human escalation.**

High-value transactions require explicit approval.

---

## Principle 5

**Emergency pause.**

Treasury owner can disable agent-controlled payments.

---

# 23. Agent Key Management

For a hackathon demo, the agent can use a dedicated wallet/private key stored securely as a server secret.

But:

```text
Agent wallet ≠ Treasury owner
```

The agent wallet only receives permission to call specific treasury functions.

Never expose the agent private key to the frontend.

Never put it in:

```text
NEXT_PUBLIC_*
```

Never commit it to Git.

---

# 24. Arc Integration

The application should use Arc as the primary settlement network.

Core integration points:

```text
Arc RPC
Arc chain configuration
USDC contract
Wallet interaction
Contract deployment
Transaction monitoring
Block explorer links
```

Use Arc's current official developer documentation for exact:

- chain ID
- RPC endpoint
- USDC contract address
- explorer
- faucet/testnet details
- deployment requirements
- current SDK guidance

Do not hardcode these values from old examples; Arc is newly launched and the documentation may change quickly.

---

# 25. Cross-Chain Extension

This should be a stretch goal, not the MVP.

Future flow:

```text
Base
  │
  │ USDC
  ▼
CCTP / Gateway
  │
  ▼
Arc Treasury
  │
  ▼
Supplier
```

The treasury agent could detect:

```text
Arc balance = $7,500
Required payment = $20,000
```

Then initiate a cross-chain USDC funding operation.

---

# 26. Future Product: Autonomous Treasury

After the hackathon:

```text
Payment Agent
Payroll Agent
Treasury Agent
FX Agent
Investment Agent
Compliance Agent
```

All agents operate through the same policy-controlled treasury.

---

# 27. Future Product: Machine-to-Machine Payments

A second direction is autonomous software purchasing services.

Example:

```text
AI Research Agent
      ↓
Needs API data
      ↓
Discovers API provider
      ↓
Provider charges $0.20
      ↓
Agent pays USDC
      ↓
API returns data
```

This could become:

> **An economic layer for autonomous software.**

---

# 28. Architecture Diagram

```text
                         ┌────────────────────┐
                         │      USER          │
                         │  Business Owner    │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │     WEB APP        │
                         │      Next.js       │
                         └─────────┬──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
           ┌────────────────┐            ┌────────────────┐
           │   API SERVER   │            │ WALLET / SIGN  │
           │ Node / TS      │            │ User Wallet    │
           └───────┬────────┘            └────────────────┘
                   │
                   ▼
           ┌────────────────┐
           │   DATABASE     │
           │  PostgreSQL    │
           └───────┬────────┘
                   │
                   ▼
           ┌────────────────┐
           │  PAYMENT AGENT │
           │ AI + Policy    │
           └───────┬────────┘
                   │
                   │ payment request
                   ▼
           ┌──────────────────────┐
           │  ARC TREASURY       │
           │  SMART CONTRACT      │
           │                      │
           │  - policies          │
           │  - limits            │
           │  - recipients        │
           │  - agent permissions │
           └──────────┬───────────┘
                      │
                      ▼
                 ┌──────────┐
                 │   USDC   │
                 └────┬─────┘
                      │
                      ▼
                 ┌──────────┐
                 │SUPPLIER  │
                 └──────────┘
```

---

# 29. Repository Structure

```text
vaultos/
│
├── apps/
│   ├── web/
│   ├── api/
│   └── agent/
│
├── packages/
│   ├── contracts/
│   ├── sdk/
│   ├── types/
│   ├── config/
│   └── ui/
│
├── contracts/
│   ├── Treasury.sol
│   ├── TreasuryFactory.sol
│   ├── PolicyManager.sol
│   ├── AgentRegistry.sol
│   └── interfaces/
│
├── scripts/
│   ├── deploy.ts
│   ├── seed.ts
│   └── verify.ts
│
├── test/
│   ├── Treasury.t.sol
│   ├── Policy.t.sol
│   ├── Agent.t.sol
│   └── Payment.t.sol
│
├── docs/
│   ├── architecture.md
│   ├── security.md
│   └── demo.md
│
├── .env.example
├── package.json
├── turbo.json
└── README.md
```

---

# 30. Smart Contract Tests

Before building a fancy UI, test these.

## Test 1

Owner can deposit USDC.

## Test 2

Owner can authorize agent.

## Test 3

Authorized agent can execute valid payment.

## Test 4

Unauthorized agent cannot execute payment.

## Test 5

Agent cannot exceed transaction limit.

## Test 6

Agent cannot exceed daily limit.

## Test 7

Agent cannot pay unapproved recipient.

## Test 8

Paused treasury rejects agent payment.

## Test 9

Expired policy rejects payment.

## Test 10

High-value payment requires human approval.

## Test 11

Owner can revoke agent.

## Test 12

Owner can withdraw funds.

---

# 31. Threat Model

Potential attacks:

### Compromised agent

Mitigation:

- Spending limits
- Recipient allowlist
- Agent revocation
- Emergency pause

### Prompt injection

Mitigation:

- AI does not control contract rules
- Structured outputs
- Onchain policy enforcement

### Backend compromise

Mitigation:

- Backend cannot bypass treasury contract
- Agent wallet has limited permissions

### Malicious recipient

Mitigation:

- Recipient allowlist
- Human approval for unknown/high-value recipients

### Replay / duplicate invoice

Mitigation:

- Invoice IDs
- Payment request IDs
- Contract-level replay protection

### Oracle/data manipulation

Avoid unnecessary external financial data dependencies in MVP.

---

# 32. Observability

Track:

```text
Agent decisions
Policy checks
Payment requests
Contract transactions
Failures
Rejected payments
Approval latency
```

A useful debug trail:

```text
Invoice
  ↓
Agent decision
  ↓
Policy result
  ↓
Contract request
  ↓
Contract validation
  ↓
Arc transaction
  ↓
Settlement
```

---

# 33. Demo Script

The demo should be approximately 3–5 minutes.

## Scene 1 — Create treasury

```text
Create Treasury
```

Fund it with test USDC.

---

## Scene 2 — Configure rules

Set:

```text
Autonomous limit: $1,000
Daily limit: $5,000
Approval threshold: $1,000
```

Add:

```text
AWS
Supplier A
```

---

## Scene 3 — Submit $750 invoice

Show:

```text
AWS
$750
```

Click:

```text
Analyze invoice
```

Agent returns:

```text
APPROVED
```

Execute.

Show Arc transaction.

---

## Scene 4 — Submit $3,500 invoice

Agent says:

```text
Human approval required
```

Show approval screen.

Click:

```text
Approve
```

Transaction executes.

---

## Scene 5 — Attack the system

Try:

```text
Unknown recipient
$20,000
```

Show:

```text
TRANSACTION REJECTED

Reason:
Recipient not approved
AND
Amount exceeds policy
```

This is the moment that demonstrates the architecture.

---

# 34. What Judges Should Understand

The product is not:

> "AI that sends USDC."

The product is:

> **A programmable financial control layer that allows autonomous agents to operate company treasuries safely within enforceable rules.**

Arc provides the settlement environment.

The smart contract provides financial constraints.

The agent provides automation.

The human provides governance for exceptional transactions.

---

# 35. 48-Hour Build Plan

## Hours 0–4 — Architecture + Setup

### Tasks

- Create repository
- Configure monorepo
- Configure Arc network
- Configure wallet
- Install viem
- Install contract tooling
- Set up environment variables
- Create database
- Create basic Next.js app

Deliverable:

```text
Web app boots
Contract project boots
Arc connection works
```

---

# 36. Hours 4–10 — Smart Contracts

Build:

```text
Treasury
Policy
Agent permissions
Recipients
Payment execution
Pause
```

Then immediately write tests.

Target:

```text
Valid payment → succeeds
Invalid payment → reverts
```

Do not move on until this works.

---

# 37. Hours 10–14 — Deploy

Deploy:

```text
Treasury
Factory
USDC integration
```

Record:

```text
Contract addresses
Network
Explorer URLs
ABI
```

Create deployment config.

---

# 38. Hours 14–20 — Backend

Build:

```text
Treasury API
Invoice API
Recipient API
Policy API
Transaction API
```

Database models:

```text
Treasury
Invoice
Recipient
Agent
Policy
PaymentRequest
Transaction
```

---

# 39. Hours 20–26 — Agent

Build the simplest useful agent.

Input:

```text
invoice
treasury
policy
recipient
```

Output:

```text
decision
reason
checks
```

Implement:

```text
AUTONOMOUS_APPROVAL
HUMAN_APPROVAL
REJECT
```

---

# 40. Hours 26–34 — Frontend

Build only these screens:

```text
Dashboard
Treasury
Invoices
Approvals
Transactions
Policies
```

Don't build unnecessary settings pages.

---

# 41. Hours 34–38 — End-to-End Integration

Test:

```text
Create treasury
↓
Fund treasury
↓
Add recipient
↓
Configure policy
↓
Submit invoice
↓
Agent analyzes
↓
Agent requests payment
↓
Contract validates
↓
USDC transfer
↓
Arc confirmation
↓
Dashboard updates
```

---

# 42. Hours 38–42 — Security + Failure Cases

Test:

```text
Unauthorized agent
Unknown recipient
Too-large payment
Daily limit exceeded
Paused treasury
Expired authorization
Duplicate invoice
Insufficient balance
```

---

# 43. Hours 42–46 — Demo Polish

Improve:

- Loading states
- Transaction status
- Error messages
- Policy visualization
- Agent activity feed
- Explorer links
- Empty states

Add realistic demo data.

---

# 44. Hours 46–48 — Submission

Prepare:

### README

- Problem
- Solution
- Architecture
- Why Arc
- Security model
- Demo
- Contracts
- Deployment

### Demo video

Keep it short.

### Submission

Explain:

1. Problem
2. Why agents
3. Why programmable constraints
4. Why Arc
5. Live demo
6. Security model
7. Future vision

---

# 45. If You Have More Than 48 Hours

Add features in this order:

## Priority 1

Recurring payments.

```text
Every Friday:
Pay Supplier A $500
```

## Priority 2

Cross-chain USDC funding.

## Priority 3

Multiple agents.

## Priority 4

Invoice upload / document extraction.

## Priority 5

Treasury analytics.

## Priority 6

Agent-to-agent payments.

---

# 46. What NOT to Build

Avoid:

- Generic wallet
- Generic DEX
- Generic bridge
- Token launch
- NFT marketplace
- Simple USDC transfer app
- Chatbot with a wallet
- Huge DeFi dashboard
- Complex DAO
- Full accounting platform

The hackathon project should have one clear story.

---

# 47. Technical Differentiator

The strongest technical differentiator is the separation:

```text
                INTELLIGENCE
                     │
                     ▼
               AI AGENT
                     │
             "I want to pay"
                     │
                     ▼
                AUTHORITY
                     │
                     ▼
             SMART CONTRACT
                     │
             "Are you allowed?"
                     │
              ┌──────┴──────┐
              │             │
             YES            NO
              │             │
              ▼             ▼
           EXECUTE        REVERT
              │
              ▼
             ARC
```

This is the architecture to emphasize throughout the submission.

---

# 48. Product Metrics

For a future production version:

### Financial

- Treasury volume
- Payment volume
- Average payment size
- Failed payment rate

### Automation

- Percentage of payments executed autonomously
- Human approval rate
- Average approval time

### Agent

- Decision accuracy
- Rejected invalid payments
- Agent execution success rate

### User

- Active businesses
- Active agents
- Monthly transactions
- Retention

---

# 49. Future Business Model

Potential model:

### SaaS

Monthly fee based on treasury size or number of agents.

### Transaction fee

Small fee per automated payment.

### Enterprise

Custom policy/compliance infrastructure.

### API

Other applications can deploy programmable autonomous treasuries.

---

# 50. Long-Term Architecture

Eventually:

```text
                   VAULTOS
                      |
       ┌──────────────┼───────────────┐
       │              │               │
       ▼              ▼               ▼
   Treasury        Agents          Policies
       │              │               │
       └──────────────┼───────────────┘
                      ▼
                 Settlement
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
       Arc          Other L1s      L2s
        │
       USDC
```

VaultOS becomes an abstraction layer between businesses, autonomous agents, and programmable settlement.

---

# 51. One-Sentence Pitch

> **VaultOS lets AI agents operate business treasuries autonomously while smart contracts enforce exactly what those agents are allowed to do.**

---

# 52. Short Hackathon Pitch

Businesses want automated finance, but giving an AI agent unrestricted access to a wallet is dangerous.

VaultOS solves this by separating intelligence from authority.

AI agents analyze invoices and initiate payments, while an Arc smart-contract treasury enforces spending limits, approved recipients, human approval thresholds and emergency controls.

Valid transactions settle in USDC on Arc.

The result is a programmable treasury where software can move money autonomously without becoming the ultimate authority over the money.

---

# 53. Final Engineering Principle

Build the smallest system that proves this statement:

> **An autonomous agent can perform real financial work on Arc, while the blockchain—not the AI—controls what it is allowed to do.**

Everything else is secondary.

# 54. Arc Documentation & MCP Setup

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.arc.io/llms.txt
> Use this file to discover all available pages before exploring further.

## Arc MCP server

Connect AI coding tools to Arc documentation using the Model Context Protocol (MCP) server for search and full-page retrieval.

The Arc Model Context Protocol (MCP) server gives AI tools direct access to Arc documentation so they can search for relevant content and retrieve full pages during conversations. It is hosted at `https://docs.arc.io/mcp` and requires no authentication.

The server exposes two tools:

* **Search**: finds relevant documentation snippets based on a query.
* **Get page**: retrieves the full content of a specific documentation page.

For a machine-readable index of all documentation pages, see the [`llms.txt`](https://docs.arc.io/llms.txt) file.

### Claude Code

```bash
claude mcp add --transport http arc-docs https://docs.arc.io/mcp
```

Claude Code automatically discovers the server's tools on the next conversation.

### Claude Desktop

1. Open **Settings** and navigate to **Connectors**.
2. Select **Add custom connector**.
3. Enter `Arc Docs` as the name and `https://docs.arc.io/mcp` as the URL.
4. During a chat, use the attachments button to select the Arc Docs connector.

### Cursor

Add the following to your `mcp.json` file (accessible via **Cursor Settings > MCP**):

```json
{
  "mcpServers": {
    "arc-docs": {
      "url": "https://docs.arc.io/mcp"
    }
  }
}
```

### VS Code (Copilot)

Create or update `.vscode/mcp.json` in the project root:

```json
{
  "servers": {
    "arc-docs": {
      "type": "http",
      "url": "https://docs.arc.io/mcp"
    }
  }
}
```

### Windsurf

Add the following to your Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "arc-docs": {
      "serverUrl": "https://docs.arc.io/mcp"
    }
  }
}
```

### Other MCP clients

Any MCP-compatible client can connect using the HTTP transport at `https://docs.arc.io/mcp`. Most clients require only the server URL and transport type (`http`). Refer to your client's documentation for the exact configuration format.

### Verify the connection

After adding the server, confirm the connection by asking your AI tool a question about Arc, such as:

> What smart contract standards does Arc support?

The tool should return content sourced from Arc documentation. If it does not:

* **Check the URL**: confirm it is exactly `https://docs.arc.io/mcp` with no trailing path.
* **Check network access**: the server must be reachable over HTTPS from your machine.
* **Restart the client**: some tools only detect new MCP servers after a restart or new session.

## Recommended workflow for this project

Before implementing Arc-specific functionality, use the documentation index and MCP server to verify current Arc details rather than relying on stale examples. In particular, verify the current chain configuration, RPC endpoints, USDC contract details, supported standards, transaction behavior, deployment instructions, and any current SDK guidance.

