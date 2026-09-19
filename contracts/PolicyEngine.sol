// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ITreasury} from "./interfaces/ITreasury.sol";
import {IPolicyEngine} from "./interfaces/IPolicyEngine.sol";

/// @title VaultOS Policy Engine
/// @notice The rulebook between the agent/owner and the Treasury: maxTransaction, dailyLimit,
///         monthlyLimit, approvedRecipients, agentActive and humanApprovalThreshold, plus expiry.
///         It only *evaluates* rules; it never holds funds. Only its Treasury can change it, and the
///         Treasury only lets its owner do so.
contract PolicyEngine is IPolicyEngine {
    address public immutable treasury;

    ITreasury.Policy internal _policy;
    mapping(address => ITreasury.AgentInfo) internal _agents;
    mapping(address => bool) public isRecipient;
    mapping(address => bytes32) public recipientMetadata;

    modifier onlyTreasury() {
        require(msg.sender == treasury, "ONLY_TREASURY");
        _;
    }

    constructor(address treasury_) {
        treasury = treasury_;
    }

    function policy() external view returns (ITreasury.Policy memory) {
        return _policy;
    }

    function agentInfo(address agent) external view returns (ITreasury.AgentInfo memory) {
        return _agents[agent];
    }

    function evaluate(
        address agent,
        address recipient,
        uint256 amount,
        uint256 spentToday,
        uint256 spentThisMonth,
        bool checkVelocity
    ) external view returns (Result memory r) {
        ITreasury.Policy memory p = _policy;
        ITreasury.AgentInfo memory a = _agents[agent];
        r.policyLive = p.active && (p.expiresAt == 0 || block.timestamp <= p.expiresAt);
        r.agentAuthorized = a.active;
        r.agentNotExpired = a.expiresAt == 0 || block.timestamp <= a.expiresAt;
        r.recipientApproved = isRecipient[recipient];
        r.amountPositive = amount > 0;
        r.withinTxLimit = amount <= p.maxTransactionAmount;
        r.withinDailyLimit = !checkVelocity || spentToday + amount <= p.dailyLimit;
        r.withinMonthlyLimit = !checkVelocity || spentThisMonth + amount <= p.monthlyLimit;
        r.requiresApproval = amount > p.approvalThreshold;
    }

    function setPolicy(ITreasury.Policy calldata p) external onlyTreasury {
        require(p.approvalThreshold <= p.maxTransactionAmount, "THRESHOLD_ABOVE_TX_LIMIT");
        _policy = p;
    }

    function setAgent(address agent, uint64 expiresAt, bool active) external onlyTreasury {
        _agents[agent] = ITreasury.AgentInfo(active, expiresAt);
    }

    function setRecipient(address recipient, bool approved, bytes32 metadataHash) external onlyTreasury {
        isRecipient[recipient] = approved;
        if (approved) recipientMetadata[recipient] = metadataHash;
    }
}
