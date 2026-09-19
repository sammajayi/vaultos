// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Treasury} from "../contracts/Treasury.sol";
import {TreasuryFactory} from "../contracts/TreasuryFactory.sol";
import {ITreasury} from "../contracts/interfaces/ITreasury.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

abstract contract Base is Test {
    uint256 constant USDC = 1e6;

    MockUSDC usdc;
    TreasuryFactory factory;
    Treasury treasury;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address aws = makeAddr("aws");
    address supplierA = makeAddr("supplierA");
    address stranger = makeAddr("stranger");

    // PRD demo policy: $1,000 autonomous / $10,000 hard cap / $5,000 daily / $25,000 monthly
    function _policy() internal view returns (ITreasury.Policy memory) {
        return ITreasury.Policy({
            maxTransactionAmount: 10_000 * USDC,
            dailyLimit: 5_000 * USDC,
            monthlyLimit: 25_000 * USDC,
            approvalThreshold: 1_000 * USDC,
            expiresAt: block.timestamp + 365 days,
            active: true
        });
    }

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        usdc = new MockUSDC();
        factory = new TreasuryFactory(address(usdc));

        vm.prank(owner);
        treasury = Treasury(factory.createTreasury(_policy(), agent, 0));

        vm.startPrank(owner);
        treasury.addRecipient(aws, keccak256("AWS"));
        treasury.addRecipient(supplierA, keccak256("Supplier A"));
        vm.stopPrank();

        usdc.mint(owner, 25_000 * USDC);
        vm.startPrank(owner);
        usdc.approve(address(treasury), type(uint256).max);
        treasury.deposit(25_000 * USDC);
        vm.stopPrank();
    }

    function _inv(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
