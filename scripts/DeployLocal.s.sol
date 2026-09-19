// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TreasuryFactory} from "../contracts/TreasuryFactory.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// Local anvil only: deploys a mock 6-decimal USDC alongside the factory. Never use on Arc.
contract DeployLocal is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        MockUSDC usdc = new MockUSDC();
        TreasuryFactory factory = new TreasuryFactory(address(usdc));
        vm.stopBroadcast();
        console.log("USDC    :", address(usdc));
        console.log("FACTORY :", address(factory));
    }
}
