// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SalesLog
 * @notice Every corpus sale, stated on Monad by the seller.
 *
 * The server's sales table is the server's word, and a server can edit its own
 * table. A line here is the same statement with a block and a sequence number
 * nobody can change afterwards. It carries the sha256 of the exact bytes
 * served, so a buyer can hash the file they received and find it in the log,
 * and anyone can count what was sold without asking us.
 *
 * Kept in storage as well as emitted. Monad's public endpoints answer a log
 * query only a hundred blocks wide — under a minute of chain — so a log that
 * lived only in events would be a log nobody could read back. `saleCount` and
 * `getSale` read it in one call.
 */
contract SalesLog {
    error NotSeller();
    error AlreadyLogged(bytes32 saleId);
    error NoSuchSale(uint256 seq);

    /// How a pull was granted.
    enum Terms {
        X402,     // paid: an x402 payment settled on chain
        AgentKit  // free: a verified human's agent, under World AgentBook
    }

    struct Sale {
        bytes32 saleId;   // the settlement tx hash, or keccak256("agentkit:<nonce>")
        uint256 taskId;
        Terms terms;
        address buyer;
        address asset;    // the token paid in; zero for a free pull
        uint256 amount;   // atomic units of `asset`; zero for a free pull
        bytes32 sha256;   // of the bytes served
        uint64 at;
    }

    event CorpusSold(
        uint256 indexed seq, bytes32 indexed saleId, uint256 indexed taskId,
        Terms terms, address buyer, address asset, uint256 amount, bytes32 sha256
    );

    address public immutable seller;
    Sale[] private _sales;
    /// saleId => seq + 1, so a sale cannot be logged twice.
    mapping(bytes32 => uint256) public seqOf;
    /// sha256 => how many sales served exactly those bytes.
    mapping(bytes32 => uint256) public servedCount;

    constructor(address seller_) {
        seller = seller_;
    }

    function logSale(
        bytes32 saleId, uint256 taskId, Terms terms, address buyer, address asset, uint256 amount, bytes32 digest
    ) external returns (uint256 seq) {
        if (msg.sender != seller) revert NotSeller();
        if (seqOf[saleId] != 0) revert AlreadyLogged(saleId);
        _sales.push(Sale({
            saleId: saleId, taskId: taskId, terms: terms, buyer: buyer,
            asset: asset, amount: amount, sha256: digest, at: uint64(block.timestamp)
        }));
        seq = _sales.length;
        seqOf[saleId] = seq;
        servedCount[digest] += 1;
        emit CorpusSold(seq, saleId, taskId, terms, buyer, asset, amount, digest);
    }

    function saleCount() external view returns (uint256) {
        return _sales.length;
    }

    /// @notice Sales are numbered from 1.
    function getSale(uint256 seq) external view returns (Sale memory) {
        if (seq == 0 || seq > _sales.length) revert NoSuchSale(seq);
        return _sales[seq - 1];
    }
}
