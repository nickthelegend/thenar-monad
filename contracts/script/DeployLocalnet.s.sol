// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {LocalUSDC} from "../src/localnet/LocalUSDC.sol";

/**
 * The pieces a local chain needs beyond DeployMonad.s.sol: USDC, which Circle
 * provides on Monad and nobody provides on anvil, minted to the accounts the
 * local agent and buyers use. Run by scripts/localnet.mjs after DeployMonad.
 */
contract DeployLocalnet is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address agent = vm.envAddress("LOCAL_AGENT_ADDRESS");
        address faucet = vm.envAddress("LOCAL_FAUCET_ADDRESS");
        vm.startBroadcast(pk);
        LocalUSDC usdc = new LocalUSDC(vm.addr(pk));
        usdc.mint(agent, 1_000e6);
        usdc.mint(vm.addr(pk), 1_000e6);
        usdc.mint(faucet, 1_000_000e6);
        vm.stopBroadcast();
        console.log("LOCAL_USDC", address(usdc));
    }
}
