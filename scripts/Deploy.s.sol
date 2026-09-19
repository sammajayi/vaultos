// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TreasuryFactory} from "../contracts/TreasuryFactory.sol";

/// forge script scripts/Deploy.s.sol --rpc-url $ARC_RPC_URL --broadcast
///
/// Env: DEPLOYER_PRIVATE_KEY, ARC_USDC_ADDRESS (ERC-20 interface of native USDC, 6 decimals).
/// Gas is paid in USDC on Arc; fund the deployer at https://faucet.circle.com first.
/// Arc's mempool enforces a 20 gwei maxFeePerGas floor — see docs.arc.io/arc/references/gas-and-fees.
contract Deploy is Script {
    function run() external returns (TreasuryFactory factory) {
        address usdc = vm.envAddress("ARC_USDC_ADDRESS");
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(pk);
        factory = new TreasuryFactory(usdc);
        vm.stopBroadcast();

        console.log("chainId          :", block.chainid);
        console.log("USDC             :", usdc);
        console.log("TreasuryFactory  :", address(factory));
    }
}
