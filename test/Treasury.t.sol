// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "./Base.t.sol";
import {ITreasury} from "../contracts/interfaces/ITreasury.sol";

contract TreasuryTest is Base {
    // Test 1
    function test_ownerCanDeposit() public {
        assertEq(treasury.balance(), 25_000 * USDC);
        usdc.mint(owner, 100 * USDC);
        vm.prank(owner);
        treasury.deposit(100 * USDC);
        assertEq(treasury.balance(), 25_100 * USDC);
    }

    // Test 12
    function test_ownerCanWithdraw() public {
        vm.prank(owner);
        treasury.withdraw(address(usdc), 1_000 * USDC, owner);
        assertEq(usdc.balanceOf(owner), 1_000 * USDC);
        assertEq(treasury.balance(), 24_000 * USDC);
    }

    function test_nonOwnerCannotWithdraw() public {
        vm.prank(agent);
        vm.expectRevert();
        treasury.withdraw(address(usdc), 1 * USDC, agent);
    }

    function test_ownerCanWithdrawWhilePaused() public {
        vm.startPrank(owner);
        treasury.pause();
        treasury.withdraw(address(usdc), 25_000 * USDC, owner);
        vm.stopPrank();
        assertEq(treasury.balance(), 0);
    }

    function test_factoryTracksTreasuries() public view {
        assertTrue(factory.isTreasury(address(treasury)));
        assertEq(factory.treasuriesOf(owner)[0], address(treasury));
        assertEq(treasury.owner(), owner);
    }

    function test_factoryCannotMakeOwnerTheAgent() public {
        vm.prank(owner);
        vm.expectRevert("AGENT_CANNOT_BE_OWNER");
        factory.createTreasury(_policy(), owner, 0);
    }
}
