// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "./Base.t.sol";

contract AgentTest is Base {
    // Test 2
    function test_ownerCanAuthorizeAgent() public {
        address other = makeAddr("other");
        vm.prank(owner);
        treasury.authorizeAgent(other, 0);
        (bool active,) = treasury.agents(other);
        assertTrue(active);
    }

    function test_nonOwnerCannotAuthorizeAgent() public {
        vm.prank(stranger);
        vm.expectRevert();
        treasury.authorizeAgent(stranger, 0);
    }

    // Test 4
    function test_unauthorizedAgentCannotExecute() public {
        vm.prank(stranger);
        vm.expectRevert("AGENT_NOT_AUTHORIZED");
        treasury.executePayment(aws, 100 * USDC, _inv("X-1"));
    }

    // Test 11
    function test_ownerCanRevokeAgent() public {
        vm.prank(owner);
        treasury.revokeAgent(agent);

        vm.prank(agent);
        vm.expectRevert("AGENT_NOT_AUTHORIZED");
        treasury.executePayment(aws, 100 * USDC, _inv("X-1"));
    }

    function test_expiredAgentCannotExecute() public {
        address temp = makeAddr("temp");
        vm.prank(owner);
        treasury.authorizeAgent(temp, uint64(block.timestamp + 1 days));

        vm.warp(block.timestamp + 2 days);
        vm.prank(temp);
        vm.expectRevert("AGENT_EXPIRED");
        treasury.executePayment(aws, 100 * USDC, _inv("X-1"));
    }

    function test_agentCannotChangeConfiguration() public {
        vm.startPrank(agent);
        vm.expectRevert();
        treasury.addRecipient(agent, bytes32(0));
        vm.expectRevert();
        treasury.updatePolicy(_policy());
        vm.expectRevert();
        treasury.pause();
        vm.expectRevert();
        treasury.authorizeAgent(agent, 0);
        vm.stopPrank();
    }
}
