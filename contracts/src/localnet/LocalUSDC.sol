// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  LocalUSDC
 * @notice USDC's interface for the local chain: an ERC-20 with six decimals
 *         and EIP-3009 transfer authorisations under Circle's EIP-712 domain
 *         (name "USDC", version "2"). Monad testnet has Circle's own USDC; a
 *         local anvil chain has nothing, and x402's exact scheme needs exactly
 *         these calls. Deployed only by scripts/localnet.mjs, never to Monad.
 */
contract LocalUSDC {
    string public constant name = "USDC";
    string public constant symbol = "USDC";
    string public constant version = "2";
    uint8 public constant decimals = 6;

    address public immutable minter;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    /// @notice EIP-3009: whether an authorisation nonce has been used.
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    error NotMinter();
    error Insufficient();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationUsedAlready();
    error BadSignature();
    error CallerMustBePayee();

    constructor(address minter_) {
        minter = minter_;
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this)
        ));
    }

    function mint(address to, uint256 value) external {
        if (msg.sender != minter) revert NotMinter();
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a < value) revert Insufficient();
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        _move(from, to, value);
        return true;
    }

    function transferWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        _authorize(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
        _move(from, to, value);
    }

    function transferWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        bytes memory signature
    ) external {
        _authorize(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, signature);
        _move(from, to, value);
    }

    function receiveWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        if (to != msg.sender) revert CallerMustBePayee();
        _authorize(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
        _move(from, to, value);
    }

    function _authorize(
        bytes32 typehash, address from, address to, uint256 value, uint256 validAfter, uint256 validBefore,
        bytes32 nonce, bytes memory signature
    ) internal {
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationUsedAlready();
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR(),
            keccak256(abi.encode(typehash, from, to, value, validAfter, validBefore, nonce))
        ));
        if (_recover(digest, signature) != from || from == address(0)) revert BadSignature();
        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        // Reject malleable signatures, as ECDSA libraries do.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }

    function _move(address from, address to, uint256 value) internal {
        if (balanceOf[from] < value) revert Insufficient();
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
