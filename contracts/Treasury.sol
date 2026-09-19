// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IPolicyEngine} from "./interfaces/IPolicyEngine.sol";
import {PolicyEngine} from "./PolicyEngine.sol";

/// @title VaultOS Treasury
/// @notice Holds USDC and is the ONLY authority over it. An AI agent may *ask* for a payment;
///         this contract decides. There is deliberately no function that lets an agent transfer
///         to an arbitrary address or amount.
/// @dev Funds, spend counters, payment requests and pause live here. Policy, the agent registry and
///      the recipient allowlist live in a dedicated PolicyEngine deployed alongside (one per
///      treasury). Every payment is evaluated by the engine, then executed by the treasury.
///
///      Semantics worth knowing:
///        * maxTransactionAmount  — hard cap on any single payment, even with owner approval.
///        * approvalThreshold     — largest amount an agent may pay on its own.
///        * daily/monthly limits  — gate *autonomous* payments. Owner-approved payments still
///          count toward the counters (so they tighten autonomy afterwards) but are not blocked
///          by them: the owner is the governing authority for exceptional payments.
///        * Amounts use the 6-decimal ERC-20 interface of Arc's native USDC.
contract Treasury is ITreasury, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant DAY = 1 days;
    uint256 public constant MONTH = 30 days;

    IERC20 public immutable usdc;

    IPolicyEngine public immutable engine;
    bool public paused;

    mapping(bytes32 => bool) public invoiceClaimed; // replay / duplicate-invoice protection
    mapping(uint256 => PaymentRequest) internal _requests;
    uint256 public nextRequestId = 1;

    uint256 private _dailySpent;
    uint256 private _dailyWindow;
    uint256 private _monthlySpent;
    uint256 private _monthlyWindow;

    modifier onlyAgent() {
        AgentInfo memory a = engine.agentInfo(msg.sender);
        require(a.active, "AGENT_NOT_AUTHORIZED");
        require(a.expiresAt == 0 || block.timestamp <= a.expiresAt, "AGENT_EXPIRED");
        _;
    }

    constructor(address owner_, address usdc_, Policy memory policy_, address agent_, uint64 agentExpiresAt)
        Ownable(owner_)
    {
        require(usdc_ != address(0), "ZERO_ADDRESS");
        usdc = IERC20(usdc_);
        engine = IPolicyEngine(address(new PolicyEngine(address(this))));
        _setPolicy(policy_);
        if (agent_ != address(0)) _authorizeAgent(agent_, agentExpiresAt);
    }

    // ───────────────────────────── funds ─────────────────────────────

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "ZERO_AMOUNT");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @dev Intentionally NOT blocked by pause: the owner must always be able to pull funds out.
    function withdraw(address token, uint256 amount, address recipient) external onlyOwner nonReentrant {
        require(recipient != address(0), "ZERO_ADDRESS");
        require(amount > 0, "ZERO_AMOUNT");
        IERC20(token).safeTransfer(recipient, amount);
        emit Withdrawn(token, recipient, amount);
    }

    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    // ─────────────────────── owner configuration ───────────────────────

    function authorizeAgent(address agent, uint64 expiresAt) external onlyOwner {
        _authorizeAgent(agent, expiresAt);
    }

    function revokeAgent(address agent) external onlyOwner {
        engine.setAgent(agent, engine.agentInfo(agent).expiresAt, false);
        emit AgentRevoked(address(this), agent);
    }

    function addRecipient(address recipient, bytes32 metadataHash) external onlyOwner {
        require(recipient != address(0), "ZERO_ADDRESS");
        engine.setRecipient(recipient, true, metadataHash);
        emit RecipientAdded(recipient, metadataHash);
    }

    function removeRecipient(address recipient) external onlyOwner {
        engine.setRecipient(recipient, false, bytes32(0));
        emit RecipientRemoved(recipient);
    }

    function updatePolicy(Policy calldata newPolicy) external onlyOwner {
        _setPolicy(newPolicy);
    }

    function pause() external onlyOwner {
        paused = true;
        emit TreasuryPaused(address(this));
    }

    function unpause() external onlyOwner {
        paused = false;
        emit TreasuryUnpaused(address(this));
    }

    // ───────────────────────────── payments ─────────────────────────────

    /// @notice Autonomous path. Pays immediately iff every rule passes AND the amount is within
    ///         the autonomous threshold. Anything else reverts — regardless of what the AI says.
    function executePayment(address recipient, uint256 amount, bytes32 invoiceId)
        external
        onlyAgent
        nonReentrant
        returns (uint256 requestId)
    {
        Checks memory c = _checks(msg.sender, recipient, amount, invoiceId, true, true);
        _revertIfFailed(c);
        require(amount <= engine.policy().approvalThreshold, "REQUIRES_HUMAN_APPROVAL");

        invoiceClaimed[invoiceId] = true;
        requestId = nextRequestId++;
        _requests[requestId] = PaymentRequest(msg.sender, recipient, amount, invoiceId, uint64(block.timestamp), RequestStatus.Pending);
        emit PaymentRequested(requestId, recipient, amount, invoiceId, msg.sender);
        _settle(requestId, false);
    }

    /// @notice Escalation path. Queues a payment for the owner. Hard rules (recipient, tx cap,
    ///         pause, policy, agent, duplicate invoice) are enforced now and again on approval;
    ///         velocity limits are not, see contract docs.
    function requestPayment(address recipient, uint256 amount, bytes32 invoiceId)
        external
        onlyAgent
        returns (uint256 requestId)
    {
        Checks memory c = _checks(msg.sender, recipient, amount, invoiceId, true, false);
        _revertIfFailed(c);

        invoiceClaimed[invoiceId] = true;
        requestId = nextRequestId++;
        _requests[requestId] = PaymentRequest(msg.sender, recipient, amount, invoiceId, uint64(block.timestamp), RequestStatus.Pending);
        emit PaymentRequested(requestId, recipient, amount, invoiceId, msg.sender);
    }

    function approvePayment(uint256 requestId) external onlyOwner nonReentrant {
        PaymentRequest storage r = _requests[requestId];
        require(r.status == RequestStatus.Pending, "NOT_PENDING");
        // Re-validate at approval time: state may have changed since the request was queued.
        Checks memory c = _checks(r.agent, r.recipient, r.amount, r.invoiceId, false, false);
        _revertIfFailed(c);
        _settle(requestId, true);
    }

    function rejectPayment(uint256 requestId) external onlyOwner {
        PaymentRequest storage r = _requests[requestId];
        require(r.status == RequestStatus.Pending, "NOT_PENDING");
        r.status = RequestStatus.Rejected;
        invoiceClaimed[r.invoiceId] = false; // allow a corrected invoice to be re-submitted
        emit PaymentRejected(requestId);
    }

    function getRequest(uint256 requestId) external view returns (PaymentRequest memory) {
        return _requests[requestId];
    }

    // ───────────────────────────── views ─────────────────────────────

    // Read-through views keep the treasury ABI stable for the API and UI.
    function policy()
        external
        view
        returns (uint256 maxTransactionAmount, uint256 dailyLimit, uint256 monthlyLimit, uint256 approvalThreshold, uint256 expiresAt, bool active)
    {
        Policy memory p = engine.policy();
        return (p.maxTransactionAmount, p.dailyLimit, p.monthlyLimit, p.approvalThreshold, p.expiresAt, p.active);
    }

    function agents(address agent) external view returns (bool active, uint64 expiresAt) {
        AgentInfo memory a = engine.agentInfo(agent);
        return (a.active, a.expiresAt);
    }

    function isRecipient(address recipient) external view returns (bool) {
        return engine.isRecipient(recipient);
    }

    function recipientMetadata(address recipient) external view returns (bytes32) {
        return engine.recipientMetadata(recipient);
    }

    function spentToday() public view returns (uint256) {
        return _dailyWindow == block.timestamp / DAY ? _dailySpent : 0;
    }

    function spentThisMonth() public view returns (uint256) {
        return _monthlyWindow == block.timestamp / MONTH ? _monthlySpent : 0;
    }

    /// @notice Evaluates every rule for a hypothetical autonomous payment without reverting.
    ///         The agent and the UI use this to show *all* reasons a payment would be refused.
    function preflight(address agent, address recipient, uint256 amount, bytes32 invoiceId)
        external
        view
        returns (Checks memory)
    {
        return _checks(agent, recipient, amount, invoiceId, true, true);
    }

    // ───────────────────────────── internals ─────────────────────────────

    function _checks(
        address agent,
        address recipient,
        uint256 amount,
        bytes32 invoiceId,
        bool checkInvoice,
        bool checkVelocity
    ) internal view returns (Checks memory c) {
        IPolicyEngine.Result memory r = engine.evaluate(agent, recipient, amount, spentToday(), spentThisMonth(), checkVelocity);
        c.notPaused = !paused;
        c.policyLive = r.policyLive;
        c.agentAuthorized = r.agentAuthorized;
        c.agentNotExpired = r.agentNotExpired;
        c.recipientApproved = r.recipientApproved;
        c.amountPositive = r.amountPositive;
        c.withinTxLimit = r.withinTxLimit;
        c.invoiceFresh = !checkInvoice || (invoiceId != bytes32(0) && !invoiceClaimed[invoiceId]);
        c.withinDailyLimit = r.withinDailyLimit;
        c.withinMonthlyLimit = r.withinMonthlyLimit;
        c.treasuryFunded = usdc.balanceOf(address(this)) >= amount;
    }

    function _revertIfFailed(Checks memory c) internal pure {
        require(c.notPaused, "TREASURY_PAUSED");
        require(c.policyLive, "POLICY_INACTIVE_OR_EXPIRED");
        require(c.agentAuthorized, "AGENT_NOT_AUTHORIZED");
        require(c.agentNotExpired, "AGENT_EXPIRED");
        require(c.recipientApproved, "RECIPIENT_NOT_APPROVED");
        require(c.amountPositive, "ZERO_AMOUNT");
        require(c.withinTxLimit, "EXCEEDS_TX_LIMIT");
        require(c.invoiceFresh, "INVOICE_ALREADY_USED");
        require(c.withinDailyLimit, "EXCEEDS_DAILY_LIMIT");
        require(c.withinMonthlyLimit, "EXCEEDS_MONTHLY_LIMIT");
        require(c.treasuryFunded, "INSUFFICIENT_BALANCE");
    }

    function _settle(uint256 requestId, bool humanApproved) internal {
        PaymentRequest storage r = _requests[requestId];
        r.status = RequestStatus.Executed; // effects before interaction

        uint256 day = block.timestamp / DAY;
        uint256 month = block.timestamp / MONTH;
        if (_dailyWindow != day) {
            _dailyWindow = day;
            _dailySpent = 0;
        }
        if (_monthlyWindow != month) {
            _monthlyWindow = month;
            _monthlySpent = 0;
        }
        _dailySpent += r.amount;
        _monthlySpent += r.amount;

        usdc.safeTransfer(r.recipient, r.amount);
        emit PaymentExecuted(requestId, r.recipient, r.amount, r.invoiceId, humanApproved);
    }

    function _authorizeAgent(address agent, uint64 expiresAt) internal {
        require(agent != address(0), "ZERO_ADDRESS");
        require(agent != owner(), "AGENT_CANNOT_BE_OWNER"); // agent wallet != treasury owner
        engine.setAgent(agent, expiresAt, true);
        emit AgentAuthorized(address(this), agent, expiresAt);
    }

    function _setPolicy(Policy memory p) internal {
        engine.setPolicy(p); // engine validates threshold <= cap
        emit PolicyUpdated(p);
    }
}
