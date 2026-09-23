// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CorpusShares} from "../src/CorpusShares.sol";

/**
 * Replace CorpusShares alone, without redeploying the protocol.
 *
 * The first CorpusShares on Monad could not give back a dividend declared
 * while no share existed: every holder's entitlement was zero, so the MON
 * escrowed for it had no way out. This deploys the version with
 * reclaimDividend. It holds no state the old one needs to hand over — no
 * share had been issued and nobody was on its list.
 *
 * scripts/apply-deploy.mjs reads this script's confirmed broadcast after
 * DeployMonad's and takes corpusShares from it.
 */
contract DeployShares is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address issuer = vm.envAddress("CORPUS_ISSUER_ADDRESS");
        vm.startBroadcast(pk);
        CorpusShares shares = new CorpusShares("Thenar Robot Corpus", "THNRC", issuer);
        vm.stopBroadcast();
        console.log("NEXT_PUBLIC_CORPUS_SHARES", address(shares));
    }
}
