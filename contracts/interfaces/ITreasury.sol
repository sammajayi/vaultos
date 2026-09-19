// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Public surface of a VaultOS treasury.
interface ITreasury {
    struct Policy {
        uint256 maxTransactionAmount; // hard cap for ANY single payment, human-approved or not
        uint256 dailyLimit;           // autonomous spend per UTC day
        uint256 monthlyLimit;         // autonomous spend per 30-day window
        uint256 approvalThreshold;    // above this, the owner must approve
        uint256 expiresAt;            // 0 = never expires
        bool active;
    }

    struct AgentInfo {
        bool active;
        uint64 expiresAt; // 0 = never expires
    }

    enum RequestStatus { None, Pending, Executed, Rejected }

    struct PaymentRequest {
        address agent;
        address recipient;
        uint256 amount;
        bytes32 invoiceId;
        uint64 createdAt;
        RequestStatus status;
    }

    /// @notice Every rule the treasury enforces, evaluated without reverting.
    struct Checks {
        bool notPaused;
        bool policyLive;        // active and not expired
        bool agentAuthorized;
        bool agentNotExpired;
        bool recipientApproved;
        bool amountPositive;
        bool withinTxLimit;
        bool invoiceFresh;
        bool withinDailyLimit;
        bool withinMonthlyLimit;
        bool treasuryFunded;
    }

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event AgentAuthorized(address indexed treasury, address indexed agent, uint64 expiresAt);
    event AgentRevoked(address indexed treasury, address indexed agent);
    event RecipientAdded(address indexed recipient, bytes32 metadataHash);
    event RecipientRemoved(address indexed recipient);
    event PolicyUpdated(Policy policy);
    event PaymentRequested(
        uint256 indexed requestId,
        address indexed recipient,
        uint256 amount,
        bytes32 indexed invoiceId,
        address agent
    );
    event PaymentExecuted(
        uint256 indexed requestId,
        address indexed recipient,
        uint256 amount,
        bytes32 invoiceId,
        bool humanApproved
    );
    event PaymentRejected(uint256 indexed requestId);
    event TreasuryPaused(address indexed treasury);
    event TreasuryUnpaused(address indexed treasury);

    function deposit(uint256 amount) external;
    function withdraw(address token, uint256 amount, address recipient) external;
    function authorizeAgent(address agent, uint64 expiresAt) external;
    function revokeAgent(address agent) external;
    function addRecipient(address recipient, bytes32 metadataHash) external;
    function removeRecipient(address recipient) external;
    function updatePolicy(Policy calldata policy) external;
    function executePayment(address recipient, uint256 amount, bytes32 invoiceId) external returns (uint256 requestId);
    function requestPayment(address recipient, uint256 amount, bytes32 invoiceId) external returns (uint256 requestId);
    function approvePayment(uint256 requestId) external;
    function rejectPayment(uint256 requestId) external;
    function pause() external;
    function unpause() external;
    function preflight(address agent, address recipient, uint256 amount, bytes32 invoiceId)
        external
        view
        returns (Checks memory);
}
