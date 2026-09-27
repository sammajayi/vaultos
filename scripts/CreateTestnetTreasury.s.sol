// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TreasuryFactory} from "../contracts/TreasuryFactory.sol";
import {Treasury} from "../contracts/Treasury.sol";
import {ITreasury} from "../contracts/interfaces/ITreasury.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// One-off testnet smoke test: creates a treasury, authorizes the agent, and deposits USDC.
/// forge script scripts/CreateTestnetTreasury.s.sol --rpc-url $ARC_RPC_URL --broadcast
contract CreateTestnetTreasury is Script {
    function run() external returns (address treasury) {
        address usdc = vm.envAddress("ARC_USDC_ADDRESS");
        address factoryAddr = vm.envAddress("TREASURY_FACTORY_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 depositAmount = vm.envUint("DEPOSIT_AMOUNT"); // 6 decimals

        ITreasury.Policy memory policy = ITreasury.Policy({
            maxTransactionAmount: 2_000_000,   // $2
            dailyLimit: 5_000_000,             // $5
            monthlyLimit: 10_000_000,          // $10
            approvalThreshold: 1_000_000,      // $1
            expiresAt: block.timestamp + 365 days,
            active: true
        });

        vm.startBroadcast(pk);
        treasury = TreasuryFactory(factoryAddr).createTreasury(policy, agent, 0);
        IERC20(usdc).approve(treasury, depositAmount);
        Treasury(treasury).deposit(depositAmount);
        vm.stopBroadcast();

        console.log("treasury:", treasury);
        console.log("deposited (6dp):", depositAmount);
    }
}
