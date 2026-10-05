// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SponsoredAccount} from "../src/localnet/SponsoredAccount.sol";

/// What the operator calls through its delegated account: it records who called.
contract Target {
    address public lastCaller;
    uint256 public lastValue;

    function poke() external payable {
        lastCaller = msg.sender;
        lastValue = msg.value;
    }

    function pay(address to) external {
        (bool ok,) = to.call{value: 1 ether}("");
        require(ok, "push failed");
    }

    receive() external payable {}
}

contract SponsoredAccountTest is Test {
    SponsoredAccount impl;
    Target target;
    uint256 operatorKey = 0xA11CE;
    address operator;
    address sponsor = address(0x5905);

    function setUp() public {
        impl = new SponsoredAccount();
        target = new Target();
        operator = vm.addr(operatorKey);
        vm.signAndAttachDelegation(address(impl), operatorKey);
    }

    function signed(uint256 key, uint256 n, address to, uint256 value, bytes memory data) internal view returns (bytes memory) {
        bytes32 d = SponsoredAccount(payable(operator)).digest(n, to, value, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", d)));
        return abi.encodePacked(r, s, v);
    }

    function test_theSponsorPaysAndTheProtocolSeesTheOperator() public {
        bytes memory data = abi.encodeCall(Target.poke, ());
        bytes memory sig = signed(operatorKey, 0, address(target), 0, data);
        uint256 before = operator.balance;
        vm.prank(sponsor);
        SponsoredAccount(payable(operator)).execute(address(target), 0, data, sig);
        assertEq(target.lastCaller(), operator, "msg.sender is the operator's own address");
        assertEq(operator.balance, before, "the operator paid nothing");
        assertEq(SponsoredAccount(payable(operator)).nonce(), 1);
    }

    function test_aReplayIsRefused() public {
        bytes memory data = abi.encodeCall(Target.poke, ());
        bytes memory sig = signed(operatorKey, 0, address(target), 0, data);
        vm.prank(sponsor);
        SponsoredAccount(payable(operator)).execute(address(target), 0, data, sig);
        vm.prank(sponsor);
        vm.expectRevert(SponsoredAccount.BadSignature.selector);
        SponsoredAccount(payable(operator)).execute(address(target), 0, data, sig);
    }

    function test_theSponsorCannotChangeTheCall() public {
        bytes memory data = abi.encodeCall(Target.poke, ());
        bytes memory sig = signed(operatorKey, 0, address(target), 0, data);
        vm.deal(operator, 1 ether);
        vm.prank(sponsor);
        vm.expectRevert(SponsoredAccount.BadSignature.selector);
        SponsoredAccount(payable(operator)).execute(address(target), 1 ether, data, sig);
    }

    function test_nobodyElseCanSignForTheOperator() public {
        bytes memory data = abi.encodeCall(Target.poke, ());
        bytes memory sig = signed(0xB0B, 0, address(target), 0, data);
        vm.prank(sponsor);
        vm.expectRevert(SponsoredAccount.BadSignature.selector);
        SponsoredAccount(payable(operator)).execute(address(target), 0, data, sig);
    }

    function test_payoutsReachTheDelegatedAddress() public {
        vm.deal(address(target), 1 ether);
        target.pay(operator);
        assertEq(operator.balance, 1 ether, "a protocol pushing MON to the operator is not refused by its code");
    }

    function test_itVouchesForItsOwnKeyUnderEIP1271() public view {
        bytes32 h = keccak256("an EIP-712 digest, such as a USDC transfer authorisation");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, h);
        assertEq(SponsoredAccount(payable(operator)).isValidSignature(h, abi.encodePacked(r, s, v)), bytes4(0x1626ba7e));
        (v, r, s) = vm.sign(0xB0B, h);
        assertEq(SponsoredAccount(payable(operator)).isValidSignature(h, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
    }

    function test_aFailedCallSurfacesItsReason() public {
        bytes memory data = abi.encodeCall(Target.pay, (address(0xdead)));
        bytes memory sig = signed(operatorKey, 0, address(target), 0, data);
        vm.prank(sponsor);
        vm.expectRevert();
        SponsoredAccount(payable(operator)).execute(address(target), 0, data, sig);
        assertEq(SponsoredAccount(payable(operator)).nonce(), 0, "a reverted call leaves the nonce alone");
    }
}
