// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ITreasury} from "./ITreasury.sol";

interface IPolicyEngine {
    /// @notice Outcome of the policy rules for one proposed payment. Pure policy: it knows nothing
    ///         about pause state, invoices or balances; the Treasury layers those on.
    struct Result {
        bool policyLive;          // active and not expired
        bool agentAuthorized;     // agentActive
        bool agentNotExpired;
        bool recipientApproved;   // approvedRecipients
        bool amountPositive;
        bool withinTxLimit;       // maxTransaction
        bool withinDailyLimit;    // dailyLimit (only when checkVelocity)
        bool withinMonthlyLimit;
        bool requiresApproval;    // amount > humanApprovalThreshold
    }

    function policy() external view returns (ITreasury.Policy memory);
    function agentInfo(address agent) external view returns (ITreasury.AgentInfo memory);
    function isRecipient(address recipient) external view returns (bool);
    function recipientMetadata(address recipient) external view returns (bytes32);

    function evaluate(
        address agent,
        address recipient,
        uint256 amount,
        uint256 spentToday,
        uint256 spentThisMonth,
        bool checkVelocity
    ) external view returns (Result memory);

    function setPolicy(ITreasury.Policy calldata p) external;
    function setAgent(address agent, uint64 expiresAt, bool active) external;
    function setRecipient(address recipient, bool approved, bytes32 metadataHash) external;
}
