// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CorpusAudit} from "../src/CorpusAudit.sol";

/**
 * Deploy the receiver the corpus-audit CRE workflow writes to.
 *
 *   forge script script/DeployCorpusAudit.s.sol --rpc-url monad --broadcast --private-key <a key with MON>
 *
 * By default it trusts Monad testnet's MockKeystoneForwarder, which is what
 * `cre workflow simulate --broadcast` delivers through. A deployed workflow
 * delivers through the production KeystoneForwarder instead: deploy with
 * CRE_FORWARDER=0xF8344CFd5c43616a4366C34E3EEE75af79a74482, or move an existing
 * receiver with setForwarderAddress. Both addresses have code on Monad testnet.
 */
contract DeployCorpusAudit is Script {
    address constant MONAD_TESTNET_MOCK_FORWARDER = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;

    function run() external returns (CorpusAudit audit) {
        address forwarder = vm.envOr("CRE_FORWARDER", MONAD_TESTNET_MOCK_FORWARDER);
        vm.startBroadcast();
        audit = new CorpusAudit(forwarder);
        vm.stopBroadcast();
        console2.log("CorpusAudit", address(audit));
        console2.log("forwarder  ", forwarder);
    }
}
