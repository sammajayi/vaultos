// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "./Base.t.sol";
import {ITreasury} from "../contracts/interfaces/ITreasury.sol";

contract PolicyTest is Base {
    function test_ownerCanUpdatePolicy() public {
        ITreasury.Policy memory p = _policy();
        p.approvalThreshold = 500 * USDC;
        vm.prank(owner);
        treasury.updatePolicy(p);
        (, , , uint256 threshold, , ) = treasury.policy();
        assertEq(threshold, 500 * USDC);
    }

    function test_thresholdCannotExceedTxLimit() public {
        ITreasury.Policy memory p = _policy();
        p.approvalThreshold = p.maxTransactionAmount + 1;
        vm.prank(owner);
        vm.expectRevert("THRESHOLD_ABOVE_TX_LIMIT");
        treasury.updatePolicy(p);
    }

    // Test 9
    function test_expiredPolicyRejectsPayment() public {
        vm.warp(block.timestamp + 366 days);
        vm.prank(agent);
        vm.expectRevert("POLICY_INACTIVE_OR_EXPIRED");
        treasury.executePayment(aws, 100 * USDC, _inv("X-1"));
    }

    function test_inactivePolicyRejectsPayment() public {
        ITreasury.Policy memory p = _policy();
        p.active = false;
        vm.prank(owner);
        treasury.updatePolicy(p);

        vm.prank(agent);
        vm.expectRevert("POLICY_INACTIVE_OR_EXPIRED");
        treasury.executePayment(aws, 100 * USDC, _inv("X-1"));
    }

    // Test 7
    function test_cannotPayUnapprovedRecipient() public {
        vm.prank(agent);
        vm.expectRevert("RECIPIENT_NOT_APPROVED");
        treasury.executePayment(stranger, 100 * USDC, _inv("X-1"));
    }

    function test_removedRecipientCannotBePaid() public {
        vm.prank(owner);
        treasury.removeRecipient(aws);
        vm.prank(agent);
        vm.expectRevert("RECIPIENT_NOT_APPROVED");
        treasury.executePayment(aws, 100 * USDC, _inv("X-1"));
    }

    function test_preflightReportsAllFailures() public view {
        // The demo's "attack": unknown recipient AND far over the cap.
        ITreasury.Checks memory c = treasury.preflight(agent, stranger, 20_000 * USDC, _inv("ATTACK"));
        assertFalse(c.recipientApproved);
        assertFalse(c.withinTxLimit);
        assertFalse(c.withinDailyLimit);
        assertTrue(c.notPaused);
        assertTrue(c.agentAuthorized);
    }
}
