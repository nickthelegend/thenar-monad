// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {TrajectoryCertificate} from "../src/TrajectoryCertificate.sol";
import {ContributionRecord} from "../src/ContributionRecord.sol";
import {CorpusAccess} from "../src/CorpusAccess.sol";
import {CorpusManifest} from "../src/CorpusManifest.sol";
import {CorpusShares} from "../src/CorpusShares.sol";
import {SalesLog} from "../src/SalesLog.sol";
import {Referrals} from "../src/Referrals.sol";
import {PrizePool} from "../src/PrizePool.sol";
import {Foundry} from "../src/Foundry.sol";
import {ConfidentialPayouts} from "../src/ConfidentialPayouts.sol";

/**
 * Thenar on Monad testnet, every contract in one broadcast.
 *
 * AxonProtocolV2 escrows and pays in the chain's native value, so on Monad a
 * bounty, a payout and a licence fee are MON, as they were at Blitz. The
 * corpus is sold to agents separately, per pull, in USDC over x402.
 *
 * Two server keys, two authorities. The verifier signs scores and commits
 * corpus roots, and lives only in the signer service. The corpus issuer
 * admits verified humans to the share whitelist, issues their shares and logs
 * every sale, so CorpusShares and SalesLog are given it and not the verifier.
 *
 * LicenceReceipt, PolicyAnnouncer and PolicyRegistry are not here: they
 * attest through Avalanche's Warp and Teleporter, which Monad does not have.
 *
 * Monad charges gas on the limit a transaction sets, not on what it uses, so
 * run this with `--gas-estimate-multiplier 110` rather than forge's default 130.
 * Amounts are small on purpose and can be raised with REWARD_WEI.
 */
contract DeployMonad is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address issuer = vm.envAddress("CORPUS_ISSUER_ADDRESS");
        address deployer = vm.addr(pk);
        uint128 r = uint128(vm.envOr("REWARD_WEI", uint256(0.002 ether)));

        vm.startBroadcast(pk);

        PasskeyRegistry passkeys = new PasskeyRegistry();
        AxonProtocolV2 axon = new AxonProtocolV2(verifier, deployer, address(passkeys));
        TrajectoryCertificate certificate = new TrajectoryCertificate(address(axon));
        ContributionRecord record = new ContributionRecord(address(axon));
        CorpusAccess access = new CorpusAccess(deployer, 0.001 ether);
        CorpusManifest manifest = new CorpusManifest(verifier);
        CorpusShares shares = new CorpusShares("Thenar Robot Corpus", "THNRC", issuer);
        SalesLog sales = new SalesLog(issuer);

        _task(axon, "Put the toothpaste into the upper drawer", 6, r, 3, 3, 0);
        _task(axon, "Put the spoon and the mug into the crate", 6, r, 4, 3, 0);
        _task(axon, "Practise a smooth transfer across the bench", 6, r, 0, 2, 0);
        _task(axon, "Steady the crate with both arms and place the battery inside", 6, r, 4, 4, 0);
        // A deadline a week out, so closeTask has something real to close.
        _task(axon, "Put the pen on the closed laptop", 6, r, 2, 2, uint64(block.timestamp + 7 days));

        Referrals referrals = new Referrals{value: 5 * r}(address(axon), r);
        Foundry foundry = new Foundry{value: 10 * r}(address(axon));
        PrizePool prize = new PrizePool{value: 5 * r}(address(axon), 1, uint64(block.timestamp + 3 days));
        ConfidentialPayouts confidential = new ConfidentialPayouts(deployer);

        vm.stopBroadcast();

        console.log("NEXT_PUBLIC_PASSKEY_REGISTRY", address(passkeys));
        console.log("NEXT_PUBLIC_AXON_ADDRESS", address(axon));
        console.log("NEXT_PUBLIC_TRAJECTORY_CERTIFICATE", address(certificate));
        console.log("NEXT_PUBLIC_CONTRIBUTION_RECORD", address(record));
        console.log("NEXT_PUBLIC_CORPUS_ACCESS", address(access));
        console.log("NEXT_PUBLIC_CORPUS_MANIFEST", address(manifest));
        console.log("NEXT_PUBLIC_CORPUS_SHARES", address(shares));
        console.log("NEXT_PUBLIC_SALES_LOG", address(sales));
        console.log("NEXT_PUBLIC_REFERRALS", address(referrals));
        console.log("NEXT_PUBLIC_FOUNDRY", address(foundry));
        console.log("NEXT_PUBLIC_PRIZE_POOL", address(prize));
        console.log("NEXT_PUBLIC_CONFIDENTIAL_PAYOUTS", address(confidential));
        console.log("AXON_DEPLOY_BLOCK", block.number);
    }

    function _task(
        AxonProtocolV2 axon, string memory name, uint32 slots,
        uint128 reward, uint8 scenario, uint8 difficulty, uint64 expiresAt
    ) internal {
        uint256 id = axon.createTaskUntil{value: uint256(reward) * slots}(
            name, slots, reward, scenario, difficulty, expiresAt
        );
        console.log("task", id, name);
    }
}
