// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "./Base.t.sol";
import {IPolicyEngine} from "../contracts/interfaces/IPolicyEngine.sol";
import {ITreasury} from "../contracts/interfaces/ITreasury.sol";

contract PolicyEngineTest is Base {
    IPolicyEngine engine;

    function setUp() public override {
        super.setUp();
        engine = treasury.engine();
    }

    function test_onlyTreasuryCanChangeRules() public {
        vm.startPrank(owner); // even the owner must go through the Treasury
        vm.expectRevert("ONLY_TREASURY");
        engine.setPolicy(_policy());
        vm.expectRevert("ONLY_TREASURY");
        engine.setRecipient(stranger, true, bytes32(0));
        vm.expectRevert("ONLY_TREASURY");
        engine.setAgent(stranger, 0, true);
        vm.stopPrank();
    }

    function test_evaluateAutonomousPayment() public view {
        IPolicyEngine.Result memory r = engine.evaluate(agent, aws, 750 * USDC, 0, 0, true);
        assertTrue(r.policyLive && r.agentAuthorized && r.recipientApproved && r.withinTxLimit);
        assertTrue(r.withinDailyLimit && r.withinMonthlyLimit);
        assertFalse(r.requiresApproval);
    }

    function test_evaluateFlagsApprovalAndVelocity() public view {
        assertTrue(engine.evaluate(agent, aws, 3_500 * USDC, 0, 0, true).requiresApproval);
        assertFalse(engine.evaluate(agent, aws, 500 * USDC, 4_800 * USDC, 0, true).withinDailyLimit);
        // velocity ignored on the human-approval path
        assertTrue(engine.evaluate(agent, aws, 500 * USDC, 4_800 * USDC, 0, false).withinDailyLimit);
    }

    function test_evaluateFlagsUnknownRecipientAndInactiveAgent() public view {
        IPolicyEngine.Result memory r = engine.evaluate(stranger, stranger, 20_000 * USDC, 0, 0, true);
        assertFalse(r.recipientApproved);
        assertFalse(r.agentAuthorized);
        assertFalse(r.withinTxLimit);
    }

    function test_treasuryConfigFlowsThroughToEngine() public {
        vm.prank(owner);
        treasury.removeRecipient(aws);
        assertFalse(engine.isRecipient(aws));
        assertFalse(treasury.isRecipient(aws));
        ITreasury.Policy memory p = engine.policy();
        assertEq(p.approvalThreshold, 1_000 * USDC);
    }
}
