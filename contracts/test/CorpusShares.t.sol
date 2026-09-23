// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CorpusShares} from "../src/CorpusShares.sol";
import {SalesLog} from "../src/SalesLog.sol";

contract CorpusSharesTest is Test {
    CorpusShares shares;
    address issuer = address(0x1551);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address mallory = address(0xBAD);

    function setUp() public {
        vm.warp(1_000_000);
        shares = new CorpusShares("Thenar Robot Corpus", "THNRC", issuer);
        vm.startPrank(issuer);
        shares.addToControlList(alice);
        shares.addToControlList(bob);
        vm.stopPrank();
        vm.deal(issuer, 100 ether);
    }

    function test_onlyTheIssuerAdmitsAndIssues() public {
        vm.expectRevert(CorpusShares.NotIssuer.selector);
        vm.prank(mallory);
        shares.addToControlList(mallory);

        vm.expectRevert(CorpusShares.NotIssuer.selector);
        vm.prank(mallory);
        shares.issue(mallory, 1, bytes32(0));
    }

    function test_admittingTwiceListsOnce() public {
        vm.prank(issuer);
        shares.addToControlList(alice);
        assertEq(shares.getControlListCount(), 2);
        address[] memory m = shares.getControlListMembers(0, 10);
        assertEq(m.length, 2);
        assertEq(m[0], alice);
        assertEq(shares.getControlListMembers(5, 10).length, 0);
    }

    function test_anUnlistedAddressCannotHold() public {
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.AccountIsNotInControlList.selector, mallory));
        vm.prank(issuer);
        shares.issue(mallory, 100, keccak256("run"));
    }

    function test_sharesMoveOnlyBetweenListedHumans() public {
        vm.prank(issuer);
        shares.issue(alice, 100, keccak256("run"));

        vm.prank(alice);
        shares.transfer(bob, 40);
        assertEq(shares.balanceOf(alice), 60);
        assertEq(shares.balanceOf(bob), 40);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.AccountIsNotInControlList.selector, mallory));
        vm.prank(alice);
        shares.transfer(mallory, 1);

        vm.prank(alice);
        shares.approve(mallory, 10);
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.AccountIsNotInControlList.selector, mallory));
        vm.prank(mallory);
        shares.transferFrom(alice, mallory, 10);
    }

    function test_theRecordDateMustBeAhead() public {
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.RecordDateNotInFuture.selector, uint64(block.timestamp)));
        vm.prank(issuer);
        shares.setDividend{value: 1 ether}(uint64(block.timestamp), uint64(block.timestamp + 10));
    }

    function test_aDividendPaysWhoHeldAtTheRecordDate() public {
        vm.startPrank(issuer);
        shares.issue(alice, 75, keccak256("a"));
        shares.issue(bob, 25, keccak256("b"));
        uint256 id = shares.setDividend{value: 1 ether}(uint64(block.timestamp + 60), uint64(block.timestamp + 120));
        vm.stopPrank();
        assertEq(id, 1);

        // Before the record date nothing is owed yet.
        (, uint256 owed,,, bool reached,) = shares.getDividendFor(id, alice);
        assertFalse(reached);
        assertEq(owed, 0);

        // After the snapshot alice sells everything to bob: it must not move the dividend.
        vm.warp(block.timestamp + 61);
        vm.prank(alice);
        shares.transfer(bob, 75);

        (uint256 bal, uint256 a,,, bool r2,) = shares.getDividendFor(id, alice);
        assertTrue(r2);
        assertEq(bal, 75);
        assertEq(a, 0.75 ether);
        (, uint256 b,,,,) = shares.getDividendFor(id, bob);
        assertEq(b, 0.25 ether);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.DividendNotPayable.selector, id, uint64(1_000_120)));
        vm.prank(alice);
        shares.claimDividend(id);

        vm.warp(block.timestamp + 60);
        uint256 before = alice.balance;
        vm.prank(alice);
        shares.claimDividend(id);
        assertEq(alice.balance - before, 0.75 ether);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.AlreadyClaimed.selector, id, alice));
        vm.prank(alice);
        shares.claimDividend(id);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NothingOwed.selector, id, mallory));
        vm.prank(mallory);
        shares.claimDividend(id);
    }

    function test_sharesBoughtAfterTheSnapshotEarnNothing() public {
        vm.startPrank(issuer);
        shares.issue(alice, 10, keccak256("a"));
        uint256 id = shares.setDividend{value: 1 ether}(uint64(block.timestamp + 60), uint64(block.timestamp + 60));
        vm.warp(block.timestamp + 61);
        shares.issue(bob, 90, keccak256("b"));
        vm.stopPrank();

        (, uint256 a,,,,) = shares.getDividendFor(id, alice);
        (, uint256 b,,,,) = shares.getDividendFor(id, bob);
        assertEq(a, 1 ether);
        assertEq(b, 0);
    }
}

contract CorpusSharesReclaimTest is Test {
    CorpusShares shares;
    address issuer = address(0x1551);
    address alice = address(0xA11CE);

    function setUp() public {
        vm.warp(1_000_000);
        shares = new CorpusShares("Thenar Robot Corpus", "THNRC", issuer);
        vm.deal(issuer, 10 ether);
    }

    function test_aDividendWithNoHoldersComesBack() public {
        vm.prank(issuer);
        uint256 id = shares.setDividend{value: 1 ether}(uint64(block.timestamp + 60), uint64(block.timestamp + 120));

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NothingToReclaim.selector, id));
        vm.prank(issuer);
        shares.reclaimDividend(id);

        vm.warp(block.timestamp + 61);
        uint256 before = issuer.balance;
        vm.prank(issuer);
        shares.reclaimDividend(id);
        assertEq(issuer.balance - before, 1 ether);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NothingToReclaim.selector, id));
        vm.prank(issuer);
        shares.reclaimDividend(id);
    }

    function test_aDividendWithHoldersCannotBeTakenBack() public {
        vm.startPrank(issuer);
        shares.addToControlList(alice);
        shares.issue(alice, 10, keccak256("a"));
        uint256 id = shares.setDividend{value: 1 ether}(uint64(block.timestamp + 60), uint64(block.timestamp + 60));
        vm.warp(block.timestamp + 61);
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NothingToReclaim.selector, id));
        shares.reclaimDividend(id);
        vm.stopPrank();
    }

    function test_onlyTheIssuerReclaims() public {
        vm.prank(issuer);
        uint256 id = shares.setDividend{value: 1 ether}(uint64(block.timestamp + 60), uint64(block.timestamp + 60));
        vm.warp(block.timestamp + 61);
        vm.expectRevert(CorpusShares.NotIssuer.selector);
        vm.prank(alice);
        shares.reclaimDividend(id);
    }
}

contract SalesLogTest is Test {
    SalesLog sales;
    address seller = address(0x5E11);

    function setUp() public {
        sales = new SalesLog(seller);
    }

    function test_onlyTheSellerLogs() public {
        vm.expectRevert(SalesLog.NotSeller.selector);
        sales.logSale(bytes32("x"), 1, SalesLog.Terms.X402, address(1), address(2), 10_000, bytes32("h"));
    }

    function test_aSaleIsReadableBackAndCannotBeLoggedTwice() public {
        vm.startPrank(seller);
        uint256 seq = sales.logSale(bytes32("tx"), 3, SalesLog.Terms.X402, address(1), address(2), 10_000, bytes32("h"));
        assertEq(seq, 1);
        vm.expectRevert(abi.encodeWithSelector(SalesLog.AlreadyLogged.selector, bytes32("tx")));
        sales.logSale(bytes32("tx"), 3, SalesLog.Terms.X402, address(1), address(2), 10_000, bytes32("h"));
        sales.logSale(bytes32("free"), 3, SalesLog.Terms.AgentKit, address(1), address(0), 0, bytes32("h"));
        vm.stopPrank();

        assertEq(sales.saleCount(), 2);
        SalesLog.Sale memory s = sales.getSale(1);
        assertEq(s.taskId, 3);
        assertEq(s.amount, 10_000);
        assertEq(sales.seqOf(bytes32("free")), 2);
        assertEq(sales.servedCount(bytes32("h")), 2);

        vm.expectRevert(abi.encodeWithSelector(SalesLog.NoSuchSale.selector, 3));
        sales.getSale(3);
    }
}
