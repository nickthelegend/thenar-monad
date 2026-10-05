// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CorpusAudit} from "../src/CorpusAudit.sol";
import {ReceiverTemplate} from "../src/cre/ReceiverTemplate.sol";
import {IReceiver} from "../src/cre/IReceiver.sol";
import {IERC165} from "../src/cre/IERC165.sol";

contract CorpusAuditTest is Test {
    CorpusAudit audit;
    address forwarder = address(0xF0);

    event Audited(
        uint256 indexed taskId,
        CorpusAudit.Verdict indexed verdict,
        bytes32 servedRoot,
        bytes32 committedRoot,
        uint32 served,
        uint32 committed,
        uint64 observedAt
    );

    function setUp() public {
        audit = new CorpusAudit(forwarder);
    }

    function finding(uint256 taskId, CorpusAudit.Verdict v, uint32 served, uint32 committed)
        internal
        pure
        returns (CorpusAudit.Finding memory)
    {
        return CorpusAudit.Finding({
            taskId: taskId,
            servedRoot: keccak256(abi.encode("served", taskId, served)),
            committedRoot: committed == 0 ? bytes32(0) : keccak256(abi.encode("committed", taskId, committed)),
            served: served,
            committed: committed,
            verdict: v
        });
    }

    function report(uint64 observedAt, CorpusAudit.Finding[] memory f) internal pure returns (bytes memory) {
        return abi.encode(observedAt, f);
    }

    function test_storesEveryFindingFromTheForwarder() public {
        CorpusAudit.Finding[] memory f = new CorpusAudit.Finding[](2);
        f[0] = finding(0, CorpusAudit.Verdict.Matches, 3, 3);
        f[1] = finding(4, CorpusAudit.Verdict.Uncommitted, 2, 0);

        vm.expectEmit(true, true, false, true, address(audit));
        emit Audited(0, CorpusAudit.Verdict.Matches, f[0].servedRoot, f[0].committedRoot, 3, 3, 1_000);
        vm.prank(forwarder);
        audit.onReport(new bytes(64), report(1_000, f));

        CorpusAudit.Audit memory a = audit.latest(0);
        assertEq(uint8(a.verdict), uint8(CorpusAudit.Verdict.Matches));
        assertEq(a.servedRoot, f[0].servedRoot);
        assertEq(a.committedRoot, f[0].committedRoot);
        assertEq(a.served, 3);
        assertEq(a.observedAt, 1_000);
        assertEq(a.blockNumber, block.number);
        assertEq(uint8(audit.latest(4).verdict), uint8(CorpusAudit.Verdict.Uncommitted));
        assertEq(audit.findings(), 2);
    }

    function test_refusesAnyoneButTheForwarder() public {
        CorpusAudit.Finding[] memory f = new CorpusAudit.Finding[](1);
        f[0] = finding(0, CorpusAudit.Verdict.Altered, 3, 3);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), forwarder));
        audit.onReport(new bytes(64), report(1_000, f));
        assertEq(audit.latest(0).observedAt, 0);
    }

    function test_newestFindingWinsAndOlderOnesAreDiscarded() public {
        CorpusAudit.Finding[] memory f = new CorpusAudit.Finding[](1);
        f[0] = finding(7, CorpusAudit.Verdict.Grown, 5, 4);
        vm.prank(forwarder);
        audit.onReport(new bytes(64), report(2_000, f));

        // A retried, older report must not roll the verdict back.
        f[0] = finding(7, CorpusAudit.Verdict.Matches, 4, 4);
        vm.prank(forwarder);
        audit.onReport(new bytes(64), report(1_500, f));
        assertEq(uint8(audit.latest(7).verdict), uint8(CorpusAudit.Verdict.Grown));
        assertEq(audit.findings(), 1);

        f[0] = finding(7, CorpusAudit.Verdict.Matches, 5, 5);
        vm.prank(forwarder);
        audit.onReport(new bytes(64), report(3_000, f));
        assertEq(uint8(audit.latest(7).verdict), uint8(CorpusAudit.Verdict.Matches));
        assertEq(audit.latest(7).observedAt, 3_000);
        assertEq(audit.findings(), 2);
    }

    function test_onlyTheOwnerMovesTheForwarder() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        audit.setForwarderAddress(address(0xBAD));
        audit.setForwarderAddress(address(0xF1));
        assertEq(audit.getForwarderAddress(), address(0xF1));
    }

    function test_advertisesIReceiver() public view {
        assertTrue(audit.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(audit.supportsInterface(type(IERC165).interfaceId));
        assertFalse(audit.supportsInterface(0xdeadbeef));
    }

    function test_refusesAZeroForwarder() public {
        vm.expectRevert(ReceiverTemplate.InvalidForwarderAddress.selector);
        new CorpusAudit(address(0));
    }
}
