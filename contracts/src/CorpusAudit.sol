// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./cre/ReceiverTemplate.sol";

/**
 * @title CorpusAudit
 * @notice What a Chainlink DON found when it checked the corpus Thenar serves
 *         against the root the verifier committed.
 *
 * CorpusManifest holds the verifier's commitment: one Merkle root over a
 * task's episodes. A buyer can check a downloaded file against it, but only
 * after downloading, and only if they think to. The CRE workflow in
 * cre/corpus-audit does it for everyone, on a schedule: every node of the DON
 * fetches the episodes Thenar would sell, builds the root itself, the nodes
 * agree on it, and the DON reads the committed root from CorpusManifest. The
 * verdict lands here through the KeystoneForwarder, which is the only caller
 * ReceiverTemplate accepts.
 *
 * Nothing here can move money or change a commitment. It is a record of what
 * an independent set of nodes saw, readable by the app and by anyone.
 */
contract CorpusAudit is ReceiverTemplate {
    enum Verdict {
        /// No root is committed for the task yet.
        Uncommitted,
        /// The served episodes hash to exactly the committed root.
        Matches,
        /// More episodes are served than were committed: paid since, not yet committed.
        Grown,
        /// Fewer episodes are served than were committed: some are missing.
        Short,
        /// As many episodes as were committed, but a different set.
        Altered
    }

    /// One task as the workflow reports it (the report's tuple, field for field).
    struct Finding {
        uint256 taskId;
        bytes32 servedRoot;
        bytes32 committedRoot;
        uint32 served;
        uint32 committed;
        Verdict verdict;
    }

    struct Audit {
        bytes32 servedRoot;
        bytes32 committedRoot;
        uint32 served;
        uint32 committed;
        Verdict verdict;
        /// When the DON observed it (the workflow's consensus time), unix seconds.
        uint64 observedAt;
        uint64 blockNumber;
    }

    mapping(uint256 => Audit) private s_latest;
    /// Every finding ever accepted, across all tasks.
    uint256 public findings;

    event Audited(
        uint256 indexed taskId,
        Verdict indexed verdict,
        bytes32 servedRoot,
        bytes32 committedRoot,
        uint32 served,
        uint32 committed,
        uint64 observedAt
    );
    /// A finding older than the one already held, which is discarded rather than reverted on.
    event StaleFinding(uint256 indexed taskId, uint64 observedAt, uint64 held);

    constructor(address forwarder) ReceiverTemplate(forwarder) {}

    /// @param report abi.encode(uint64 observedAt, Finding[] findings)
    function _processReport(bytes calldata report) internal override {
        (uint64 observedAt, Finding[] memory found) = abi.decode(report, (uint64, Finding[]));
        for (uint256 i = 0; i < found.length; i++) {
            Finding memory f = found[i];
            uint64 held = s_latest[f.taskId].observedAt;
            // Reports can be retried and can arrive out of order; the newest wins.
            if (held != 0 && observedAt <= held) {
                emit StaleFinding(f.taskId, observedAt, held);
                continue;
            }
            s_latest[f.taskId] = Audit({
                servedRoot: f.servedRoot,
                committedRoot: f.committedRoot,
                served: f.served,
                committed: f.committed,
                verdict: f.verdict,
                observedAt: observedAt,
                blockNumber: uint64(block.number)
            });
            findings += 1;
            emit Audited(f.taskId, f.verdict, f.servedRoot, f.committedRoot, f.served, f.committed, observedAt);
        }
    }

    /// The newest audit of a task. observedAt is zero when it has never been audited.
    function latest(uint256 taskId) external view returns (Audit memory) {
        return s_latest[taskId];
    }
}
