// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "./Base.t.sol";
import {ITreasury} from "../contracts/interfaces/ITreasury.sol";

contract PaymentTest is Base {
    event PaymentExecuted(uint256 indexed requestId, address indexed recipient, uint256 amount, bytes32 invoiceId, bool humanApproved);

    // Test 3
    function test_authorizedAgentExecutesValidPayment() public {
        vm.expectEmit(true, true, false, true);
        emit PaymentExecuted(1, aws, 750 * USDC, _inv("AWS-4921"), false);
        vm.prank(agent);
        uint256 id = treasury.executePayment(aws, 750 * USDC, _inv("AWS-4921"));

        assertEq(id, 1);
        assertEq(usdc.balanceOf(aws), 750 * USDC);
        assertEq(treasury.balance(), 24_250 * USDC);
        assertEq(treasury.spentToday(), 750 * USDC);
        assertEq(uint8(treasury.getRequest(1).status), uint8(ITreasury.RequestStatus.Executed));
    }

    // Test 5
    function test_cannotExceedTxLimit() public {
        vm.prank(agent);
        vm.expectRevert("EXCEEDS_TX_LIMIT");
        treasury.executePayment(aws, 10_001 * USDC, _inv("BIG"));
    }

    // Test 6
    function test_cannotExceedDailyLimit() public {
        for (uint256 i; i < 5; i++) {
            vm.prank(agent);
            treasury.executePayment(aws, 1_000 * USDC, keccak256(abi.encode(i)));
        }
        vm.prank(agent);
        vm.expectRevert("EXCEEDS_DAILY_LIMIT");
        treasury.executePayment(aws, 1 * USDC, _inv("ONE-MORE"));
    }

    function test_dailyWindowResetsNextDay() public {
        for (uint256 i; i < 5; i++) {
            vm.prank(agent);
            treasury.executePayment(aws, 1_000 * USDC, keccak256(abi.encode(i)));
        }
        vm.warp(block.timestamp + 1 days);
        assertEq(treasury.spentToday(), 0);
        vm.prank(agent);
        treasury.executePayment(aws, 1_000 * USDC, _inv("NEXT-DAY"));
    }

    function test_cannotExceedMonthlyLimit() public {
        // Shrink the monthly cap so the daily cap isn't the binding constraint.
        ITreasury.Policy memory p = _policy();
        p.monthlyLimit = 1_500 * USDC;
        vm.prank(owner);
        treasury.updatePolicy(p);

        vm.prank(agent);
        treasury.executePayment(aws, 1_000 * USDC, _inv("M-1"));
        vm.prank(agent);
        vm.expectRevert("EXCEEDS_MONTHLY_LIMIT");
        treasury.executePayment(aws, 600 * USDC, _inv("M-2"));
    }

    // Test 8
    function test_pausedTreasuryRejectsAgentPayment() public {
        vm.prank(owner);
        treasury.pause();
        vm.prank(agent);
        vm.expectRevert("TREASURY_PAUSED");
        treasury.executePayment(aws, 100 * USDC, _inv("P-1"));

        vm.prank(owner);
        treasury.unpause();
        vm.prank(agent);
        treasury.executePayment(aws, 100 * USDC, _inv("P-1"));
    }

    function test_duplicateInvoiceRejected() public {
        vm.prank(agent);
        treasury.executePayment(aws, 100 * USDC, _inv("DUP"));
        vm.prank(agent);
        vm.expectRevert("INVOICE_ALREADY_USED");
        treasury.executePayment(aws, 100 * USDC, _inv("DUP"));
    }

    function test_insufficientBalanceRejected() public {
        vm.prank(owner);
        treasury.withdraw(address(usdc), 24_900 * USDC, owner);
        vm.prank(agent);
        vm.expectRevert("INSUFFICIENT_BALANCE");
        treasury.executePayment(aws, 500 * USDC, _inv("BROKE"));
    }

    // Test 10
    function test_highValuePaymentRequiresHumanApproval() public {
        vm.prank(agent);
        vm.expectRevert("REQUIRES_HUMAN_APPROVAL");
        treasury.executePayment(supplierA, 4_500 * USDC, _inv("EQUIP-1"));

        vm.prank(agent);
        uint256 id = treasury.requestPayment(supplierA, 4_500 * USDC, _inv("EQUIP-1"));
        assertEq(usdc.balanceOf(supplierA), 0, "must not pay before approval");
        assertEq(uint8(treasury.getRequest(id).status), uint8(ITreasury.RequestStatus.Pending));

        vm.prank(owner);
        treasury.approvePayment(id);
        assertEq(usdc.balanceOf(supplierA), 4_500 * USDC);
        assertEq(uint8(treasury.getRequest(id).status), uint8(ITreasury.RequestStatus.Executed));
    }

    function test_agentCannotApproveItsOwnRequest() public {
        vm.prank(agent);
        uint256 id = treasury.requestPayment(supplierA, 4_500 * USDC, _inv("EQUIP-1"));
        vm.prank(agent);
        vm.expectRevert();
        treasury.approvePayment(id);
    }

    function test_ownerCanRejectAndInvoiceIsReleased() public {
        vm.prank(agent);
        uint256 id = treasury.requestPayment(supplierA, 4_500 * USDC, _inv("EQUIP-1"));
        vm.prank(owner);
        treasury.rejectPayment(id);
        assertEq(usdc.balanceOf(supplierA), 0);

        vm.prank(owner);
        vm.expectRevert("NOT_PENDING");
        treasury.approvePayment(id);

        // A corrected invoice with the same id may be resubmitted.
        vm.prank(agent);
        treasury.requestPayment(supplierA, 3_000 * USDC, _inv("EQUIP-1"));
    }

    function test_approvalRevalidatesRecipientAtApprovalTime() public {
        vm.prank(agent);
        uint256 id = treasury.requestPayment(supplierA, 4_500 * USDC, _inv("EQUIP-1"));
        vm.startPrank(owner);
        treasury.removeRecipient(supplierA);
        vm.expectRevert("RECIPIENT_NOT_APPROVED");
        treasury.approvePayment(id);
        vm.stopPrank();
    }

    function test_approvalBlockedWhilePausedOrAgentRevoked() public {
        vm.prank(agent);
        uint256 id = treasury.requestPayment(supplierA, 4_500 * USDC, _inv("EQUIP-1"));

        vm.startPrank(owner);
        treasury.pause();
        vm.expectRevert("TREASURY_PAUSED");
        treasury.approvePayment(id);
        treasury.unpause();
        treasury.revokeAgent(agent);
        vm.expectRevert("AGENT_NOT_AUTHORIZED");
        treasury.approvePayment(id);
        vm.stopPrank();
    }

    function test_hardCapAppliesEvenToHumanApproval() public {
        vm.prank(agent);
        vm.expectRevert("EXCEEDS_TX_LIMIT");
        treasury.requestPayment(supplierA, 20_000 * USDC, _inv("HUGE"));
    }

    function test_approvedPaymentCountsTowardVelocity() public {
        vm.prank(agent);
        uint256 id = treasury.requestPayment(supplierA, 4_500 * USDC, _inv("EQUIP-1"));
        vm.prank(owner);
        treasury.approvePayment(id);
        assertEq(treasury.spentToday(), 4_500 * USDC);

        vm.prank(agent);
        vm.expectRevert("EXCEEDS_DAILY_LIMIT");
        treasury.executePayment(aws, 750 * USDC, _inv("AWS-1"));
    }

    function test_zeroAmountRejected() public {
        vm.prank(agent);
        vm.expectRevert("ZERO_AMOUNT");
        treasury.executePayment(aws, 0, _inv("Z"));
    }

    /// @dev Fuzz the core promise: whatever the agent asks for, funds only ever reach an approved
    ///      recipient and never exceed the per-tx cap.
    function testFuzz_agentCanNeverPayOutsidePolicy(address to, uint256 amount, bytes32 inv) public {
        vm.assume(to != address(treasury) && to != address(0));
        uint256 before = usdc.balanceOf(to);
        vm.prank(agent);
        try treasury.executePayment(to, amount, inv) {
            assertTrue(treasury.isRecipient(to));
            assertLe(amount, 1_000 * USDC);
            assertEq(usdc.balanceOf(to), before + amount);
        } catch {
            assertEq(usdc.balanceOf(to), before);
        }
    }
}
