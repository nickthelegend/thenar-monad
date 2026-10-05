// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  SponsoredAccount
 * @notice The code an operator's own address runs under EIP-7702 on the local
 *         chain, so someone else can pay the gas for what the operator signs.
 *
 * On Monad, Privy's gas sponsorship works this way: the embedded wallet
 * delegates its address to a smart-account implementation with a 7702
 * authorisation, and a sponsor sends the transaction and pays for it. The
 * protocol still sees the operator's own address as msg.sender, and pays it.
 * Privy is a hosted service with no local chain, so this contract plus
 * /api/localnet/sponsor stand in for it on anvil, with the same on-chain shape.
 * Deployed only by scripts/localnet.mjs, never to Monad.
 *
 * The account accepts a call only with the address's own signature over
 * (chain, account, nonce, target, value, data). The sponsor can deliver the
 * call or not, but cannot change it or replay it.
 *
 * It also answers EIP-1271. Once an address carries delegated code, anything
 * that checks its signatures treats it as a contract and asks it:
 * - x402 facilitators verifying a USDC authorisation;
 * - Circle's USDC itself (FiatToken v2.2).
 * A delegate without isValidSignature makes every x402 payment from a
 * sponsored wallet fail. The smart accounts Privy delegates to answer it; so
 * does this one.
 */
contract SponsoredAccount {
    /// keccak256("thenar.sponsored-account.nonce"): the EOA's storage is shared with
    /// any code it delegates to, so the nonce lives at a slot nothing else uses.
    bytes32 private constant NONCE_SLOT = 0xf15bd8e86a237cb380b9c884fe58284863927db269bfbb2325f5dff5ed0ed51f;
    /// secp256k1n / 2: a signature with a higher s is the malleable twin of another.
    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    event Executed(uint256 indexed nonce, address indexed target, uint256 value, bytes4 selector);

    error BadSignature();
    error CallFailed(bytes reason);

    function nonce() public view returns (uint256 n) {
        bytes32 slot = NONCE_SLOT;
        assembly { n := sload(slot) }
    }

    /// The digest the account's key signs (as an EIP-191 personal message) for its next call.
    function digest(uint256 n, address target, uint256 value, bytes calldata data) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), n, target, value, keccak256(data)));
    }

    function execute(address target, uint256 value, bytes calldata data, bytes calldata signature)
        external
        payable
        returns (bytes memory)
    {
        uint256 n = nonce();
        bytes32 h = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest(n, target, value, data)));
        if (_recover(h, signature) != address(this)) revert BadSignature();
        bytes32 slot = NONCE_SLOT;
        assembly { sstore(slot, add(n, 1)) }
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) revert CallFailed(ret);
        emit Executed(n, target, value, bytes4(data.length >= 4 ? data[:4] : bytes("")));
        return ret;
    }

    /// EIP-1271: a signature is valid when the address's own key made it, over exactly this hash.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return _recover(hash, signature) == address(this) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    /// Payouts land here as they would on the operator's plain address.
    receive() external payable {}

    function _recover(bytes32 h, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_N || (v != 27 && v != 28)) return address(0);
        return ecrecover(h, v, r, s);
    }
}
