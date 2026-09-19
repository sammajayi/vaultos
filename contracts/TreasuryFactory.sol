// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Treasury} from "./Treasury.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";

/// @title VaultOS Treasury Factory
/// @notice Deploys one Treasury per business. The caller becomes the owner.
contract TreasuryFactory {
    address public immutable usdc;

    address[] public allTreasuries;
    mapping(address => address[]) private _byOwner;
    mapping(address => bool) public isTreasury;

    event TreasuryCreated(address indexed treasury, address indexed owner);

    constructor(address usdc_) {
        require(usdc_ != address(0), "ZERO_ADDRESS");
        usdc = usdc_;
    }

    /// @param agent Optional initial agent (address(0) for none). Must differ from the caller.
    function createTreasury(ITreasury.Policy calldata policy, address agent, uint64 agentExpiresAt)
        external
        returns (address treasury)
    {
        treasury = address(new Treasury(msg.sender, usdc, policy, agent, agentExpiresAt));
        allTreasuries.push(treasury);
        _byOwner[msg.sender].push(treasury);
        isTreasury[treasury] = true;
        emit TreasuryCreated(treasury, msg.sender);
    }

    function treasuriesOf(address owner) external view returns (address[] memory) {
        return _byOwner[owner];
    }

    function treasuryCount() external view returns (uint256) {
        return allTreasuries.length;
    }
}
