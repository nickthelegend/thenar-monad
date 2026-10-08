import { describe, it } from "vitest";
import { createTestIndexer } from "envio";

/**
 * Handler tests on simulated events. No network, database or Docker: the test
 * indexer runs the real handlers over the events below and keeps rows in memory.
 */

const MONAD = 10143;
const LOCAL = 31337;
const MONAD_START = 64_987_386; // pinned in vitest.config.ts

// Local deployment (lib/deployment-local.ts), the config.yaml defaults.
const LOCAL_AXON = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const LOCAL_SHARES = "0x0165878A594ca255338adfa4d48449f69242Eb8F";
const MONAD_AXON = "0x17731731c6652770CE630e29b62791DC2CED5f38";

// The two operators and the buyer from the local chain.
const ALICE = "0xB9CAf1112Af919fbee8B9dd41f928438F1Ea13fd" as const;
const BOB = "0x9E0dd5e99Ec2B5afE62079C9eF6Facd82A2983f5" as const;
const CAROL = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as const;
const FUNDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const BUYER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as const;
const USDC = "0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

const REWARD = 2_000_000_000_000_000n; // 0.002 MON at a perfect score
const payout = (score: number) => (REWARD * BigInt(score)) / 10_000n;

// 2025-09-29 00:00:00 UTC; blocks are one second apart.
const DAY = 1_759_104_000;
const ts = (block: number) => DAY + block;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const b32 = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const at = (block: number, timestamp = ts(block)) => ({
  block: { number: block, timestamp },
  transaction: { hash: tx(block) },
});

const taskCreated = (taskId: bigint, block: number, name = "Put the toothpaste into the upper drawer") => ({
  contract: "AxonProtocolV2" as const,
  event: "TaskCreated" as const,
  ...at(block),
  params: { taskId, funder: FUNDER, name, slots: 6n, rewardPerTrajectory: REWARD, scenario: 3n, difficulty: 3n },
});

const accepted = (trajectoryId: bigint, taskId: bigint, who: `0x${string}`, score: number, block: number, timestamp?: number) => ({
  contract: "AxonProtocolV2" as const,
  event: "TrajectoryAccepted" as const,
  ...at(block, timestamp),
  params: {
    trajectoryId,
    taskId,
    contributor: who,
    trajHash: b32(1000 + Number(trajectoryId)),
    cid: `axon:${1000 + Number(trajectoryId)}`,
    score: BigInt(score),
    paid: payout(score),
  },
});

const shareTransfer = (from: `0x${string}`, to: `0x${string}`, value: bigint, block: number) => ({
  contract: "CorpusShares" as const,
  event: "Transfer" as const,
  ...at(block),
  params: { from, to, value },
});

const issued = (holder: `0x${string}`, value: bigint, trajHash: string, block: number) => ({
  contract: "CorpusShares" as const,
  event: "Issued" as const,
  ...at(block),
  params: { holder, value, trajHash },
});

const sold = (seq: bigint, taskId: bigint, terms: bigint, amount: bigint, block: number) => ({
  contract: "SalesLog" as const,
  event: "CorpusSold" as const,
  ...at(block),
  params: {
    seq,
    saleId: b32(5000 + Number(seq)),
    taskId,
    terms,
    buyer: BUYER,
    asset: terms === 0n ? USDC : ZERO,
    amount,
    sha256: b32(9000 + Number(seq)),
  },
});

describe("config", () => {
  it("has both chains (Monad is skipped by default outside tests), with the deployed addresses", (t) => {
    const indexer = createTestIndexer();
    t.expect([...indexer.chainIds].sort()).toEqual([MONAD, LOCAL]);
    t.expect(indexer.chains[LOCAL].AxonProtocolV2.addresses).toEqual([LOCAL_AXON]);
    t.expect(indexer.chains[LOCAL].CorpusShares.addresses).toEqual([LOCAL_SHARES]);
    t.expect(indexer.chains[MONAD].AxonProtocolV2.addresses).toEqual([MONAD_AXON]);
    t.expect(indexer.chains[MONAD].startBlock).toBe(MONAD_START);
  });
});

describe("the local chain's demo, replayed", () => {
  it("builds tasks, runs, operators, shares, passkeys, sales and the chain totals", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [LOCAL]: {
          simulate: [
            taskCreated(0n, 9),
            taskCreated(1n, 10, "Put the spoon and the mug into the crate"),
            // Both operators bind a passkey; Alice re-registers hers later.
            { contract: "PasskeyRegistry", event: "PasskeyRegistered", ...at(686), params: { owner: ALICE, x: b32(1), y: b32(2) } },
            { contract: "CorpusShares", event: "Admitted", ...at(687), params: { account: ALICE } },
            { contract: "PasskeyRegistry", event: "PasskeyRegistered", ...at(763), params: { owner: BOB, x: b32(3), y: b32(4) } },
            { contract: "CorpusShares", event: "Admitted", ...at(764), params: { account: BOB } },
            // Alice's run, signed with her passkey, then her shares.
            accepted(0n, 0n, ALICE, 8802, 776),
            { contract: "AxonProtocolV2", event: "PasskeyRun", ...at(776), params: { trajectoryId: 0n, contributor: ALICE } },
            shareTransfer(ZERO, ALICE, 88n, 777),
            issued(ALICE, 88n, b32(1000), 777),
            { contract: "PasskeyRegistry", event: "PasskeyRegistered", ...at(836), params: { owner: ALICE, x: b32(5), y: b32(6) } },
            // Bob's run, then his shares.
            accepted(1n, 0n, BOB, 8270, 848),
            shareTransfer(ZERO, BOB, 83n, 849),
            issued(BOB, 83n, b32(1001), 849),
            // Two sales of task 0: one paid in USDC, one free AgentKit pull.
            sold(1n, 0n, 0n, 10_000n, 934),
            sold(2n, 0n, 1n, 0n, 1447),
          ],
        },
      },
    });

    const task = await indexer.Task.getOrThrow("0");
    t.expect({
      name: task.name,
      funder: task.funder,
      slots: task.slots,
      rewardPerTrajectory: task.rewardPerTrajectory,
      scenario: task.scenario,
      difficulty: task.difficulty,
      runCount: task.runCount,
      contributorCount: task.contributorCount,
      paidTotal: task.paidTotal,
      scoreTotal: task.scoreTotal,
      bestScore: task.bestScore,
      bestRun_id: task.bestRun_id,
      lastRunAt: task.lastRunAt,
      filled: task.filled,
      expired: task.expired,
      saleCount: task.saleCount,
      salesVolume: task.salesVolume,
      createdBlock: task.createdBlock,
      createdAt: task.createdAt,
      createdTx: task.createdTx,
    }).toEqual({
      name: "Put the toothpaste into the upper drawer",
      funder: FUNDER,
      slots: 6,
      rewardPerTrajectory: REWARD,
      scenario: 3,
      difficulty: 3,
      runCount: 2,
      contributorCount: 2,
      paidTotal: payout(8802) + payout(8270),
      scoreTotal: 8802n + 8270n,
      bestScore: 8802,
      bestRun_id: "0",
      lastRunAt: BigInt(ts(848)),
      filled: false,
      expired: false,
      saleCount: 2,
      salesVolume: 10_000n,
      createdBlock: 9n,
      createdAt: BigInt(ts(9)),
      createdTx: tx(9),
    });

    const run0 = await indexer.Run.getOrThrow("0");
    t.expect({
      task_id: run0.task_id,
      contributor_id: run0.contributor_id,
      trajHash: run0.trajHash,
      cid: run0.cid,
      score: run0.score,
      paid: run0.paid,
      viaPasskey: run0.viaPasskey,
      sharesIssued: run0.sharesIssued,
      blockNumber: run0.blockNumber,
      txHash: run0.txHash,
    }).toEqual({
      task_id: "0",
      contributor_id: ALICE,
      trajHash: b32(1000),
      cid: "axon:1000",
      score: 8802,
      paid: 1_760_400_000_000_000n,
      viaPasskey: true,
      sharesIssued: 88n,
      blockNumber: 776n,
      txHash: tx(776),
    });
    const run1 = await indexer.Run.getOrThrow("1");
    t.expect([run1.score, run1.paid, run1.viaPasskey, run1.sharesIssued]).toEqual([8270, 1_654_000_000_000_000n, false, 83n]);

    const alice = await indexer.Operator.getOrThrow(ALICE);
    t.expect({
      runCount: alice.runCount,
      passkeyRunCount: alice.passkeyRunCount,
      tasksContributed: alice.tasksContributed,
      paidTotal: alice.paidTotal,
      bestScore: alice.bestScore,
      firstRunAt: alice.firstRunAt,
      lastRunAt: alice.lastRunAt,
      hasPasskey: alice.hasPasskey,
      passkey_id: alice.passkey_id,
      admitted: alice.admitted,
      admittedTx: alice.admittedTx,
      shareBalance: alice.shareBalance,
      sharesIssued: alice.sharesIssued,
    }).toEqual({
      runCount: 1,
      passkeyRunCount: 1,
      tasksContributed: 1,
      paidTotal: 1_760_400_000_000_000n,
      bestScore: 8802,
      firstRunAt: BigInt(ts(776)),
      lastRunAt: BigInt(ts(776)),
      hasPasskey: true,
      passkey_id: ALICE,
      admitted: true,
      admittedTx: tx(687),
      shareBalance: 88n,
      sharesIssued: 88n,
    });
    const bob = await indexer.Operator.getOrThrow(BOB);
    t.expect([bob.runCount, bob.bestScore, bob.shareBalance, bob.hasPasskey, bob.admitted]).toEqual([1, 8270, 83n, true, true]);

    // The re-registration replaced the key and counted, but is still one passkey.
    const passkey = await indexer.Passkey.getOrThrow(ALICE);
    t.expect([passkey.x, passkey.y, passkey.active, passkey.registrations, passkey.registeredTx]).toEqual([
      b32(5),
      b32(6),
      true,
      2,
      tx(836),
    ]);

    const contrib = await indexer.TaskContributor.getOrThrow(`0-${BOB}`);
    t.expect([contrib.runCount, contrib.scoreTotal, contrib.paidTotal, contrib.bestScore]).toEqual([1, 8270n, payout(8270), 8270]);

    const issue = (await indexer.ShareIssue.getAll()).find((row) => row.holder_id === BOB);
    t.expect([issue?.value, issue?.trajHash, issue?.run_id, issue?.txHash]).toEqual([83n, b32(1001), "1", tx(849)]);

    const paidSale = await indexer.Sale.getOrThrow("1");
    t.expect({
      terms: paidSale.terms,
      task_id: paidSale.task_id,
      buyer: paidSale.buyer,
      asset: paidSale.asset,
      amount: paidSale.amount,
      saleId: paidSale.saleId,
      sha256: paidSale.sha256,
      txHash: paidSale.txHash,
    }).toEqual({
      terms: "X402",
      task_id: "0",
      buyer: BUYER,
      asset: USDC,
      amount: 10_000n,
      saleId: b32(5001),
      sha256: b32(9001),
      txHash: tx(934),
    });
    t.expect((await indexer.Sale.getOrThrow("2")).terms).toBe("AgentKit");
    t.expect((await indexer.SaleAsset.getOrThrow(USDC)).volume).toBe(10_000n);

    const stats = await indexer.Stats.getOrThrow(String(LOCAL));
    t.expect({
      tasks: stats.tasks,
      runs: stats.runs,
      passkeyRuns: stats.passkeyRuns,
      operators: stats.operators,
      paidTotal: stats.paidTotal,
      sales: stats.sales,
      paidSales: stats.paidSales,
      freeSales: stats.freeSales,
      salesVolume: stats.salesVolume,
      shareSupply: stats.shareSupply,
      shareHolders: stats.shareHolders,
      admitted: stats.admitted,
      passkeys: stats.passkeys,
      passkeyRegistrations: stats.passkeyRegistrations,
      lastBlock: stats.lastBlock,
    }).toEqual({
      tasks: 2,
      runs: 2,
      passkeyRuns: 1,
      operators: 2,
      paidTotal: payout(8802) + payout(8270),
      sales: 2,
      paidSales: 1,
      freeSales: 1,
      salesVolume: 10_000n,
      shareSupply: 171n,
      shareHolders: 2,
      admitted: 2,
      passkeys: 2,
      passkeyRegistrations: 3,
      lastBlock: 1447n,
    });

    const day = await indexer.DailyStat.getOrThrow("2025-09-29");
    t.expect([day.dayStart, day.runs, day.paid, day.bestScore, day.activeOperators, day.newOperators, day.tasksCreated, day.sales]).toEqual([
      BigInt(DAY),
      2,
      payout(8802) + payout(8270),
      8802,
      2,
      2,
      2,
      2,
    ]);
  });
});

describe("task lifecycle and deferred payments", () => {
  it("tracks top-ups, filling, expiry, refunds, and what claim() owes", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [LOCAL]: {
          simulate: [
            taskCreated(0n, 10),
            { contract: "AxonProtocolV2", event: "TaskFunded", ...at(11), params: { taskId: 0n, from: BUYER, amount: 5n * REWARD } },
            accepted(0n, 0n, ALICE, 9000, 12),
            // The push to Alice failed, so the contract parked it.
            { contract: "AxonProtocolV2", event: "PaymentDeferred", ...at(12), params: { to: ALICE, amount: payout(9000) } },
            { contract: "AxonProtocolV2", event: "TaskFilled", ...at(12), params: { taskId: 0n } },
            { contract: "AxonProtocolV2", event: "Claimed", ...at(20), params: { to: ALICE, amount: payout(9000) } },
            taskCreated(1n, 30),
            { contract: "AxonProtocolV2", event: "TaskExpired", ...at(40), params: { taskId: 1n, funder: FUNDER, refunded: 3n * REWARD } },
          ],
        },
      },
    });

    const filled = await indexer.Task.getOrThrow("0");
    t.expect([filled.toppedUp, filled.fundings, filled.filled, filled.filledAt, filled.filledTx]).toEqual([
      5n * REWARD,
      1,
      true,
      BigInt(ts(12)),
      tx(12),
    ]);
    const expired = await indexer.Task.getOrThrow("1");
    t.expect([expired.expired, expired.refunded, expired.expiredTx]).toEqual([true, 3n * REWARD, tx(40)]);

    const alice = await indexer.Operator.getOrThrow(ALICE);
    t.expect([alice.deferredTotal, alice.claimedTotal, alice.owed]).toEqual([payout(9000), payout(9000), 0n]);

    const stats = await indexer.Stats.getOrThrow(String(LOCAL));
    t.expect([stats.tasksFilled, stats.tasksExpired, stats.fundedTotal, stats.refundedTotal, stats.deferredTotal, stats.claimedTotal]).toEqual([
      1,
      1,
      5n * REWARD,
      3n * REWARD,
      payout(9000),
      payout(9000),
    ]);
  });
});

describe("shares and dividends", () => {
  it("moves balances on transfer, counts holders, and records dividend claims", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [LOCAL]: {
          simulate: [
            { contract: "CorpusShares", event: "Admitted", ...at(1), params: { account: ALICE } },
            { contract: "CorpusShares", event: "Admitted", ...at(1), params: { account: BOB } },
            shareTransfer(ZERO, ALICE, 90n, 2),
            issued(ALICE, 90n, b32(77), 2), // no run with this hash: the issue stands alone
            shareTransfer(ZERO, BOB, 10n, 3),
            issued(BOB, 10n, b32(78), 3),
            // Bob hands all his shares to Alice: he stops being a holder.
            shareTransfer(BOB, ALICE, 10n, 4),
            {
              contract: "CorpusShares",
              event: "DividendDeclared",
              ...at(5),
              params: { id: 1n, recordDate: BigInt(ts(10)), executionDate: BigInt(ts(20)), amount: 1_000_000n },
            },
            { contract: "CorpusShares", event: "DividendClaimed", ...at(21), params: { id: 1n, holder: ALICE, amount: 1_000_000n } },
          ],
        },
      },
    });

    t.expect((await indexer.Operator.getOrThrow(ALICE)).shareBalance).toBe(100n);
    t.expect((await indexer.Operator.getOrThrow(BOB)).shareBalance).toBe(0n);
    const stats = await indexer.Stats.getOrThrow(String(LOCAL));
    t.expect([stats.shareSupply, stats.shareHolders, stats.admitted, stats.dividends, stats.dividendsDeclared, stats.dividendsClaimed]).toEqual([
      100n,
      1,
      2,
      1,
      1_000_000n,
      1_000_000n,
    ]);

    const transfers = await indexer.ShareTransfer.getAll();
    t.expect(transfers.map((row) => [row.isMint, row.value]).sort()).toEqual([
      [false, 10n],
      [true, 10n],
      [true, 90n],
    ]);
    const lone = (await indexer.ShareIssue.getAll()).find((row) => row.trajHash === b32(77));
    t.expect(lone?.run_id).toBeUndefined();

    const dividend = await indexer.Dividend.getOrThrow("1");
    t.expect([dividend.amount, dividend.claimed, dividend.claimCount, dividend.supplyAtDeclaration, dividend.declaredTx]).toEqual([
      1_000_000n,
      1_000_000n,
      1,
      100n,
      tx(5),
    ]);
    const claim = await indexer.DividendClaim.getOrThrow(`1-${ALICE}`);
    t.expect([claim.dividend_id, claim.holder_id, claim.amount, claim.txHash]).toEqual(["1", ALICE, 1_000_000n, tx(21)]);
    t.expect((await indexer.Operator.getOrThrow(ALICE)).dividendsClaimed).toBe(1_000_000n);
  });
});

describe("passkeys", () => {
  it("counts only live keys: a revoke or a zero key is not a passkey", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [LOCAL]: {
          simulate: [
            { contract: "PasskeyRegistry", event: "PasskeyRegistered", ...at(1), params: { owner: ALICE, x: b32(1), y: b32(2) } },
            { contract: "PasskeyRegistry", event: "PasskeyRegistered", ...at(2), params: { owner: BOB, x: b32(3), y: b32(4) } },
            { contract: "PasskeyRegistry", event: "PasskeyRevoked", ...at(3), params: { owner: BOB } },
            { contract: "PasskeyRegistry", event: "PasskeyRegistered", ...at(4), params: { owner: CAROL, x: b32(0), y: b32(0) } },
          ],
        },
      },
    });

    const bob = await indexer.Passkey.getOrThrow(BOB);
    t.expect([bob.active, bob.revokedTx]).toEqual([false, tx(3)]);
    t.expect((await indexer.Operator.getOrThrow(BOB)).hasPasskey).toBe(false);
    t.expect((await indexer.Operator.getOrThrow(CAROL)).hasPasskey).toBe(false);
    t.expect((await indexer.Operator.getOrThrow(ALICE)).hasPasskey).toBe(true);
    const stats = await indexer.Stats.getOrThrow(String(LOCAL));
    t.expect([stats.passkeys, stats.passkeyRegistrations]).toEqual([1, 3]);
  });
});

describe("subscriptions", () => {
  it("records each purchase and keeps the subscriber's latest expiry", async (t) => {
    const indexer = createTestIndexer();
    const until1 = BigInt(ts(5) + 7 * 86_400);
    const until2 = until1 + 30n * 86_400n;
    await indexer.process({
      chains: {
        [LOCAL]: {
          simulate: [
            { contract: "CorpusAccess", event: "Subscribed", ...at(5), params: { who: BUYER, days_: 7n, paid: 7_000n, until: until1 } },
            { contract: "CorpusAccess", event: "Subscribed", ...at(9), params: { who: BUYER, days_: 30n, paid: 30_000n, until: until2 } },
          ],
        },
      },
    });

    const subscriber = await indexer.Subscriber.getOrThrow(BUYER);
    t.expect([subscriber.until, subscriber.totalPaid, subscriber.totalDays, subscriber.subscriptionCount]).toEqual([until2, 37_000n, 37, 2]);
    const rows = await indexer.Subscription.getAll();
    t.expect(rows.map((row) => [row.days, row.txHash]).sort()).toEqual([
      [30, tx(9)],
      [7, tx(5)],
    ]);
    const stats = await indexer.Stats.getOrThrow(String(LOCAL));
    t.expect([stats.subscriptions, stats.subscribers, stats.subscriptionRevenue]).toEqual([2, 1, 37_000n]);
  });
});

describe("agents", () => {
  it("ranks buyers by what they bought: purchases, distinct tasks and spend", async (t) => {
    const indexer = createTestIndexer();
    const OTHER = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;
    const by = (who: `0x${string}`, e: ReturnType<typeof sold>) => ({ ...e, params: { ...e.params, buyer: who } });
    await indexer.process({
      chains: {
        [LOCAL]: {
          simulate: [
            sold(1n, 0n, 0n, 10_000n, 5),
            sold(2n, 0n, 0n, 10_000n, 6),
            sold(3n, 3n, 0n, 10_000n, 7),
            by(OTHER, sold(4n, 3n, 0n, 10_000n, 8)),
          ],
        },
      },
    });
    const a = await indexer.Agent.getOrThrow(BUYER);
    t.expect([a.purchases, a.tasks, a.spent, a.lastTaskId, a.firstAt, a.lastAt]).toEqual([3, 2, 30_000n, 3n, BigInt(ts(5)), BigInt(ts(7))]);
    t.expect(a.lastSha256).toBe(b32(9003));
    const b = await indexer.Agent.getOrThrow(OTHER);
    t.expect([b.purchases, b.tasks, b.spent]).toEqual([1, 1, 10_000n]);
    const pairs = await indexer.AgentTask.getAll();
    t.expect(pairs.map((x) => [x.agent, x.taskId, x.purchases]).sort()).toEqual([
      [OTHER, 3n, 1],
      [BUYER, 0n, 2],
      [BUYER, 3n, 1],
    ].sort());
    const stats = await indexer.Stats.getOrThrow(String(LOCAL));
    t.expect([stats.sales, stats.agents]).toEqual([4, 2]);
  });
});

describe("daily buckets", () => {
  it("splits runs by UTC day and counts an operator once per day", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [LOCAL]: {
          simulate: [
            taskCreated(0n, 1),
            accepted(0n, 0n, ALICE, 8000, 2, DAY + 100),
            accepted(1n, 0n, ALICE, 8500, 3, DAY + 200),
            accepted(2n, 0n, BOB, 9000, 4, DAY + 86_400 + 5), // the next day
          ],
        },
      },
    });

    const first = await indexer.DailyStat.getOrThrow("2025-09-29");
    t.expect([first.runs, first.activeOperators, first.newOperators, first.bestScore]).toEqual([2, 1, 1, 8500]);
    const second = await indexer.DailyStat.getOrThrow("2025-09-30");
    t.expect([second.dayStart, second.runs, second.activeOperators, second.newOperators]).toEqual([BigInt(DAY + 86_400), 1, 1, 1]);
    const alice = await indexer.Operator.getOrThrow(ALICE);
    t.expect([alice.runCount, alice.bestScore, alice.tasksContributed]).toEqual([2, 8500, 1]);
  });
});

describe("chains never share a row", () => {
  it("keeps task 0 and the totals separate on Monad and the local chain", async (t) => {
    const indexer = createTestIndexer();
    const block = MONAD_START + 10;
    await indexer.process({
      chains: {
        [LOCAL]: { simulate: [taskCreated(0n, 5, "local task"), accepted(0n, 0n, ALICE, 8000, 6)] },
        [MONAD]: { simulate: [taskCreated(0n, block, "monad task")] },
      },
    });

    const tasks = await indexer.Task.getWhere({ id: { _eq: "0" } });
    t.expect(tasks.map((row) => [row.chainId, row.name, row.runCount]).sort()).toEqual([
      [MONAD, "monad task", 0],
      [LOCAL, "local task", 1],
    ]);
    const monadStats = await indexer.Stats.getOrThrow(String(MONAD));
    const localStats = await indexer.Stats.getOrThrow(String(LOCAL));
    t.expect([monadStats.tasks, monadStats.runs, monadStats.lastBlock]).toEqual([1, 0, BigInt(block)]);
    t.expect([localStats.tasks, localStats.runs]).toEqual([1, 1]);
  });
});
