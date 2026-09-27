// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

/// One-off testnet helper: sends native gas currency from the deployer to the agent wallet.
/// forge script scripts/FundAgent.s.sol --rpc-url $ARC_RPC_URL --broadcast
contract FundAgent is Script {
    function run() external {
        address payable agent = payable(vm.envAddress("FUND_TARGET"));
        uint256 amount = vm.envUint("FUND_AMOUNT_WEI");
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(pk);
        (bool ok,) = agent.call{value: amount}("");
        require(ok, "transfer failed");
        vm.stopBroadcast();

        console.log("funded agent:", agent);
        console.log("amount wei  :", amount);
    }
}
