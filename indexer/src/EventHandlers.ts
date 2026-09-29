import { indexer, type EvmOnEventContext } from "envio";

import {
  ZERO_ADDRESS,
  isZeroKey,
  logId,
  maxBig,
  newDailyStat,
  newOperator,
  newStats,
  sameAddress,
  taskContributorId,
  touched,
  type DailyStat,
  type EventMeta,
  type Operator,
  type Stats,
} from "./entities";

/**
 * Thenar handlers.
 *
 * Every handler loads what it needs up front, then writes each row once.
 * Handlers run twice per event (a parallel preload pass that warms the cache,
 * then the ordered pass that writes), so they do no external I/O.
 *
 * Rows are per chain (`disable_default_cross_chain`), so `context.X.get(id)`
 * only ever sees the current event's chain, and the chain's Stats row is keyed
 * by the chain id itself.
 */

type Context = EvmOnEventContext;

const statsFor = async (context: Context, chainId: number): Promise<Stats> =>
  (await context.Stats.get(String(chainId))) ?? newStats(chainId);

const dayFor = async (context: Context, timestamp: number): Promise<DailyStat> => {
  const fresh = newDailyStat(timestamp);
  return (await context.DailyStat.get(fresh.id)) ?? fresh;
};

const operatorFor = async (context: Context, address: string): Promise<Operator> =>
  (await context.Operator.get(address)) ?? newOperator(address);

const at = (event: EventMeta) => ({
  blockNumber: BigInt(event.block.number),
  timestamp: BigInt(event.block.timestamp),
  txHash: event.transaction.hash,
});

/* ------------------------------------------------------------------ */
/* AxonProtocolV2: tasks                                              */
/* ------------------------------------------------------------------ */

indexer.onEvent({ contract: "AxonProtocolV2", event: "TaskCreated" }, async ({ event, context }) => {
  const p = event.params;
  const [stats, day] = await Promise.all([statsFor(context, event.chainId), dayFor(context, event.block.timestamp)]);
  const when = at(event);

  context.Task.set({
    id: p.taskId.toString(),
    taskId: p.taskId,
    name: p.name,
    funder: p.funder,
    slots: Number(p.slots),
    rewardPerTrajectory: p.rewardPerTrajectory,
    scenario: Number(p.scenario),
    difficulty: Number(p.difficulty),
    runCount: 0,
    contributorCount: 0,
    paidTotal: 0n,
    scoreTotal: 0n,
    bestScore: 0,
    bestRun_id: undefined,
    lastRunAt: undefined,
    toppedUp: 0n,
    fundings: 0,
    filled: false,
    filledAt: undefined,
    filledTx: undefined,
    expired: false,
    expiredAt: undefined,
    expiredTx: undefined,
    refunded: undefined,
    saleCount: 0,
    salesVolume: 0n,
    createdBlock: when.blockNumber,
    createdAt: when.timestamp,
    createdTx: when.txHash,
  });

  context.DailyStat.set({ ...day, tasksCreated: day.tasksCreated + 1 });
  context.Stats.set(touched({ ...stats, tasks: stats.tasks + 1 }, event));
});

indexer.onEvent({ contract: "AxonProtocolV2", event: "TaskFunded" }, async ({ event, context }) => {
  const { taskId, amount } = event.params;
  const [task, stats] = await Promise.all([context.Task.get(taskId.toString()), statsFor(context, event.chainId)]);
  if (task) {
    context.Task.set({ ...task, toppedUp: task.toppedUp + amount, fundings: task.fundings + 1 });
  } else {
    context.log.warn(`TaskFunded for unindexed task ${taskId}: is start_block later than the deployment?`);
  }
  context.Stats.set(touched({ ...stats, fundedTotal: stats.fundedTotal + amount }, event));
});

indexer.onEvent({ contract: "AxonProtocolV2", event: "TaskFilled" }, async ({ event, context }) => {
  const id = event.params.taskId.toString();
  const [task, stats] = await Promise.all([context.Task.get(id), statsFor(context, event.chainId)]);
  const firstTime = task !== undefined && !task.filled;
  if (task && firstTime) {
    context.Task.set({
      ...task,
      filled: true,
      filledAt: BigInt(event.block.timestamp),
      filledTx: event.transaction.hash,
    });
  }
  context.Stats.set(touched({ ...stats, tasksFilled: stats.tasksFilled + (firstTime ? 1 : 0) }, event));
});

indexer.onEvent({ contract: "AxonProtocolV2", event: "TaskExpired" }, async ({ event, context }) => {
  const { taskId, refunded } = event.params;
  const [task, stats] = await Promise.all([context.Task.get(taskId.toString()), statsFor(context, event.chainId)]);
  if (task) {
    context.Task.set({
      ...task,
      expired: true,
      expiredAt: BigInt(event.block.timestamp),
      expiredTx: event.transaction.hash,
      refunded,
    });
  }
  context.Stats.set(
    touched({ ...stats, tasksExpired: stats.tasksExpired + 1, refundedTotal: stats.refundedTotal + refunded }, event),
  );
});

/* ------------------------------------------------------------------ */
/* AxonProtocolV2: runs                                               */
/* ------------------------------------------------------------------ */

indexer.onEvent({ contract: "AxonProtocolV2", event: "TrajectoryAccepted" }, async ({ event, context }) => {
  const { trajectoryId, taskId, contributor, trajHash, cid, paid } = event.params;
  const score = Number(event.params.score);
  const runId = trajectoryId.toString();
  const taskKey = taskId.toString();
  const contribId = taskContributorId(taskKey, contributor);
  const when = at(event);

  const [task, operator, contrib, stats, day] = await Promise.all([
    context.Task.get(taskKey),
    operatorFor(context, contributor),
    context.TaskContributor.get(contribId),
    statsFor(context, event.chainId),
    dayFor(context, event.block.timestamp),
  ]);
  const dailyOperatorId = `${day.date}-${contributor}`;
  const dailyOperator = await context.DailyOperator.get(dailyOperatorId);

  const firstRunEver = operator.runCount === 0;
  const firstRunOnTask = contrib === undefined;
  const firstRunToday = dailyOperator === undefined;

  context.Run.set({
    id: runId,
    trajectoryId,
    task_id: taskKey,
    taskId,
    contributor_id: contributor,
    trajHash,
    cid,
    score,
    paid,
    viaPasskey: false,
    sharesIssued: 0n,
    blockNumber: when.blockNumber,
    timestamp: when.timestamp,
    txHash: when.txHash,
    logIndex: event.logIndex,
  });

  if (task) {
    const newBest = score > task.bestScore || task.bestRun_id === undefined;
    context.Task.set({
      ...task,
      runCount: task.runCount + 1,
      contributorCount: task.contributorCount + (firstRunOnTask ? 1 : 0),
      paidTotal: task.paidTotal + paid,
      scoreTotal: task.scoreTotal + BigInt(score),
      bestScore: newBest ? score : task.bestScore,
      bestRun_id: newBest ? runId : task.bestRun_id,
      lastRunAt: when.timestamp,
    });
  } else {
    context.log.warn(`Run ${runId} on unindexed task ${taskKey}: is start_block later than the deployment?`);
  }

  context.TaskContributor.set({
    id: contribId,
    task_id: taskKey,
    operator_id: contributor,
    runCount: (contrib?.runCount ?? 0) + 1,
    scoreTotal: (contrib?.scoreTotal ?? 0n) + BigInt(score),
    paidTotal: (contrib?.paidTotal ?? 0n) + paid,
    bestScore: Math.max(contrib?.bestScore ?? 0, score),
    firstRunAt: contrib?.firstRunAt ?? when.timestamp,
    lastRunAt: when.timestamp,
  });

  context.Operator.set({
    ...operator,
    runCount: operator.runCount + 1,
    tasksContributed: operator.tasksContributed + (firstRunOnTask ? 1 : 0),
    paidTotal: operator.paidTotal + paid,
    scoreTotal: operator.scoreTotal + BigInt(score),
    bestScore: Math.max(operator.bestScore, score),
    firstRunAt: operator.firstRunAt ?? when.timestamp,
    lastRunAt: when.timestamp,
  });

  context.DailyOperator.set({
    id: dailyOperatorId,
    date: day.date,
    operator_id: contributor,
    runs: (dailyOperator?.runs ?? 0) + 1,
  });

  context.DailyStat.set({
    ...day,
    runs: day.runs + 1,
    paid: day.paid + paid,
    scoreTotal: day.scoreTotal + BigInt(score),
    bestScore: Math.max(day.bestScore, score),
    activeOperators: day.activeOperators + (firstRunToday ? 1 : 0),
    newOperators: day.newOperators + (firstRunEver ? 1 : 0),
  });

  context.Stats.set(
    touched(
      {
        ...stats,
        runs: stats.runs + 1,
        operators: stats.operators + (firstRunEver ? 1 : 0),
        paidTotal: stats.paidTotal + paid,
        scoreTotal: stats.scoreTotal + BigInt(score),
      },
      event,
    ),
  );
});

// Follows TrajectoryAccepted in the same transaction when the run was signed
// with the operator's passkey.
indexer.onEvent({ contract: "AxonProtocolV2", event: "PasskeyRun" }, async ({ event, context }) => {
  const { trajectoryId, contributor } = event.params;
  const [run, operator, stats] = await Promise.all([
    context.Run.get(trajectoryId.toString()),
    operatorFor(context, contributor),
    statsFor(context, event.chainId),
  ]);
  if (run) context.Run.set({ ...run, viaPasskey: true });
  context.Operator.set({ ...operator, passkeyRunCount: operator.passkeyRunCount + 1 });
  context.Stats.set(touched({ ...stats, passkeyRuns: stats.passkeyRuns + 1 }, event));
});

/* ------------------------------------------------------------------ */
/* AxonProtocolV2: payments the contract could not push               */
/* ------------------------------------------------------------------ */

indexer.onEvent({ contract: "AxonProtocolV2", event: "PaymentDeferred" }, async ({ event, context }) => {
  const { to, amount } = event.params;
  const [operator, stats] = await Promise.all([operatorFor(context, to), statsFor(context, event.chainId)]);
  context.Operator.set({ ...operator, deferredTotal: operator.deferredTotal + amount, owed: operator.owed + amount });
  context.Stats.set(touched({ ...stats, deferredTotal: stats.deferredTotal + amount }, event));
});

indexer.onEvent({ contract: "AxonProtocolV2", event: "Claimed" }, async ({ event, context }) => {
  const { to, amount } = event.params;
  const [operator, stats] = await Promise.all([operatorFor(context, to), statsFor(context, event.chainId)]);
  const owed = operator.owed - amount;
  context.Operator.set({ ...operator, claimedTotal: operator.claimedTotal + amount, owed: owed < 0n ? 0n : owed });
  context.Stats.set(touched({ ...stats, claimedTotal: stats.claimedTotal + amount }, event));
});

/* ------------------------------------------------------------------ */
/* SalesLog                                                           */
/* ------------------------------------------------------------------ */

indexer.onEvent({ contract: "SalesLog", event: "CorpusSold" }, async ({ event, context }) => {
  const { seq, saleId, taskId, buyer, asset, amount, sha256 } = event.params;
  // SalesLog.Terms: 0 = X402 (paid), 1 = AgentKit (free).
  const terms = event.params.terms === 0n ? "X402" : "AgentKit";
  const taskKey = taskId.toString();
  const when = at(event);

  const [task, saleAsset, stats, day] = await Promise.all([
    context.Task.get(taskKey),
    context.SaleAsset.get(asset),
    statsFor(context, event.chainId),
    dayFor(context, event.block.timestamp),
  ]);

  context.Sale.set({
    id: seq.toString(),
    seq,
    saleId,
    task_id: taskKey,
    taskId,
    terms,
    buyer,
    asset,
    amount,
    sha256,
    blockNumber: when.blockNumber,
    timestamp: when.timestamp,
    txHash: when.txHash,
    logIndex: event.logIndex,
  });

  if (task) {
    context.Task.set({ ...task, saleCount: task.saleCount + 1, salesVolume: task.salesVolume + amount });
  }
  context.SaleAsset.set({
    id: asset,
    sales: (saleAsset?.sales ?? 0) + 1,
    volume: (saleAsset?.volume ?? 0n) + amount,
  });
  context.DailyStat.set({ ...day, sales: day.sales + 1, salesVolume: day.salesVolume + amount });
  context.Stats.set(
    touched(
      {
        ...stats,
        sales: stats.sales + 1,
        paidSales: stats.paidSales + (terms === "X402" ? 1 : 0),
        freeSales: stats.freeSales + (terms === "AgentKit" ? 1 : 0),
        salesVolume: stats.salesVolume + amount,
      },
      event,
    ),
  );
});

/* ------------------------------------------------------------------ */
/* CorpusShares: control list, issuance, balances                     */
/* ------------------------------------------------------------------ */

indexer.onEvent({ contract: "CorpusShares", event: "Admitted" }, async ({ event, context }) => {
  const { account } = event.params;
  const [operator, stats] = await Promise.all([operatorFor(context, account), statsFor(context, event.chainId)]);
  const firstTime = !operator.admitted;
  context.Operator.set({
    ...operator,
    admitted: true,
    admittedAt: operator.admittedAt ?? BigInt(event.block.timestamp),
    admittedTx: operator.admittedTx ?? event.transaction.hash,
  });
  context.Stats.set(touched({ ...stats, admitted: stats.admitted + (firstTime ? 1 : 0) }, event));
});

// Balances and supply move on Transfer (an issue emits Transfer(0, holder) and
// then Issued), so Issued only records which run the shares were for.
indexer.onEvent({ contract: "CorpusShares", event: "Transfer" }, async ({ event, context }) => {
  const { from, to, value } = event.params;
  const isMint = sameAddress(from, ZERO_ADDRESS);
  const isBurn = sameAddress(to, ZERO_ADDRESS);
  const when = at(event);

  const [sender, receiver, stats] = await Promise.all([
    isMint ? undefined : operatorFor(context, from),
    isBurn ? undefined : operatorFor(context, to),
    statsFor(context, event.chainId),
  ]);

  context.ShareTransfer.set({
    id: logId(event),
    from,
    to,
    value,
    isMint,
    blockNumber: when.blockNumber,
    timestamp: when.timestamp,
    txHash: when.txHash,
    logIndex: event.logIndex,
  });

  let holders = stats.shareHolders;
  if (sender && receiver && sameAddress(from, to)) {
    // A self-transfer moves nothing.
  } else {
    if (sender) {
      const balance = sender.shareBalance - value;
      if (sender.shareBalance > 0n && balance <= 0n) holders -= 1;
      context.Operator.set({ ...sender, shareBalance: balance });
    }
    if (receiver) {
      const balance = receiver.shareBalance + value;
      if (receiver.shareBalance <= 0n && balance > 0n) holders += 1;
      context.Operator.set({ ...receiver, shareBalance: balance });
    }
  }

  const supply = stats.shareSupply + (isMint ? value : 0n) - (isBurn ? value : 0n);
  context.Stats.set(touched({ ...stats, shareSupply: supply, shareHolders: holders }, event));
});

indexer.onEvent({ contract: "CorpusShares", event: "Issued" }, async ({ event, context }) => {
  const { holder, value, trajHash } = event.params;
  const when = at(event);
  const [operator, runs, stats] = await Promise.all([
    operatorFor(context, holder),
    context.Run.getWhere({ trajHash: { _eq: trajHash } }),
    statsFor(context, event.chainId),
  ]);
  const run = runs[0];

  context.ShareIssue.set({
    id: logId(event),
    holder_id: holder,
    value,
    trajHash,
    run_id: run?.id,
    blockNumber: when.blockNumber,
    timestamp: when.timestamp,
    txHash: when.txHash,
    logIndex: event.logIndex,
  });
  if (run) context.Run.set({ ...run, sharesIssued: run.sharesIssued + value });
  context.Operator.set({ ...operator, sharesIssued: operator.sharesIssued + value });
  context.Stats.set(touched(stats, event));
});

/* ------------------------------------------------------------------ */
/* CorpusShares: dividends                                            */
/* ------------------------------------------------------------------ */

indexer.onEvent({ contract: "CorpusShares", event: "DividendDeclared" }, async ({ event, context }) => {
  const { id, recordDate, executionDate, amount } = event.params;
  const stats = await statsFor(context, event.chainId);
  const when = at(event);
  context.Dividend.set({
    id: id.toString(),
    dividendId: id,
    recordDate,
    executionDate,
    amount,
    claimed: 0n,
    claimCount: 0,
    reclaimed: 0n,
    supplyAtDeclaration: stats.shareSupply,
    declaredAt: when.timestamp,
    declaredBlock: when.blockNumber,
    declaredTx: when.txHash,
  });
  context.Stats.set(
    touched({ ...stats, dividends: stats.dividends + 1, dividendsDeclared: stats.dividendsDeclared + amount }, event),
  );
});

indexer.onEvent({ contract: "CorpusShares", event: "DividendClaimed" }, async ({ event, context }) => {
  const { id, holder, amount } = event.params;
  const key = id.toString();
  const when = at(event);
  const [dividend, operator, stats] = await Promise.all([
    context.Dividend.get(key),
    operatorFor(context, holder),
    statsFor(context, event.chainId),
  ]);
  context.DividendClaim.set({
    id: `${key}-${holder}`,
    dividend_id: key,
    holder_id: holder,
    amount,
    blockNumber: when.blockNumber,
    timestamp: when.timestamp,
    txHash: when.txHash,
  });
  if (dividend) {
    context.Dividend.set({ ...dividend, claimed: dividend.claimed + amount, claimCount: dividend.claimCount + 1 });
  }
  context.Operator.set({ ...operator, dividendsClaimed: operator.dividendsClaimed + amount });
  context.Stats.set(touched({ ...stats, dividendsClaimed: stats.dividendsClaimed + amount }, event));
});

indexer.onEvent({ contract: "CorpusShares", event: "DividendReclaimed" }, async ({ event, context }) => {
  const { id, amount } = event.params;
  const [dividend, stats] = await Promise.all([context.Dividend.get(id.toString()), statsFor(context, event.chainId)]);
  if (dividend) context.Dividend.set({ ...dividend, reclaimed: dividend.reclaimed + amount });
  context.Stats.set(touched(stats, event));
});

/* ------------------------------------------------------------------ */
/* PasskeyRegistry                                                    */
/* ------------------------------------------------------------------ */

indexer.onEvent({ contract: "PasskeyRegistry", event: "PasskeyRegistered" }, async ({ event, context }) => {
  const { owner, x, y } = event.params;
  const [passkey, operator, stats] = await Promise.all([
    context.Passkey.get(owner),
    operatorFor(context, owner),
    statsFor(context, event.chainId),
  ]);
  const when = at(event);
  const wasActive = passkey?.active ?? false;
  // hasPasskey() on chain is "x or y is non-zero", so a zero key registers nothing.
  const active = !isZeroKey(x, y);

  context.Passkey.set({
    id: owner,
    owner_id: owner,
    x,
    y,
    active,
    registrations: (passkey?.registrations ?? 0) + 1,
    registeredAt: when.timestamp,
    registeredBlock: when.blockNumber,
    registeredTx: when.txHash,
    revokedAt: undefined,
    revokedTx: undefined,
  });
  context.Operator.set({ ...operator, hasPasskey: active, passkey_id: owner });
  context.Stats.set(
    touched(
      {
        ...stats,
        passkeys: stats.passkeys + (active ? 1 : 0) - (wasActive ? 1 : 0),
        passkeyRegistrations: stats.passkeyRegistrations + 1,
      },
      event,
    ),
  );
});

indexer.onEvent({ contract: "PasskeyRegistry", event: "PasskeyRevoked" }, async ({ event, context }) => {
  const { owner } = event.params;
  const [passkey, operator, stats] = await Promise.all([
    context.Passkey.get(owner),
    context.Operator.get(owner),
    statsFor(context, event.chainId),
  ]);
  const wasActive = passkey?.active ?? false;
  if (passkey) {
    context.Passkey.set({
      ...passkey,
      active: false,
      revokedAt: BigInt(event.block.timestamp),
      revokedTx: event.transaction.hash,
    });
  }
  if (operator) context.Operator.set({ ...operator, hasPasskey: false });
  context.Stats.set(touched({ ...stats, passkeys: stats.passkeys - (wasActive ? 1 : 0) }, event));
});

/* ------------------------------------------------------------------ */
/* CorpusAccess                                                       */
/* ------------------------------------------------------------------ */

indexer.onEvent({ contract: "CorpusAccess", event: "Subscribed" }, async ({ event, context }) => {
  const { who, paid, until } = event.params;
  const days = Number(event.params.days_);
  const when = at(event);
  const [subscriber, stats] = await Promise.all([context.Subscriber.get(who), statsFor(context, event.chainId)]);

  context.Subscription.set({
    id: logId(event),
    subscriber_id: who,
    days,
    paid,
    until,
    blockNumber: when.blockNumber,
    timestamp: when.timestamp,
    txHash: when.txHash,
    logIndex: event.logIndex,
  });
  context.Subscriber.set({
    id: who,
    until: maxBig(subscriber?.until ?? 0n, until),
    totalPaid: (subscriber?.totalPaid ?? 0n) + paid,
    totalDays: (subscriber?.totalDays ?? 0) + days,
    subscriptionCount: (subscriber?.subscriptionCount ?? 0) + 1,
    firstAt: subscriber?.firstAt ?? when.timestamp,
    lastAt: when.timestamp,
  });
  context.Stats.set(
    touched(
      {
        ...stats,
        subscriptions: stats.subscriptions + 1,
        subscribers: stats.subscribers + (subscriber ? 0 : 1),
        subscriptionRevenue: stats.subscriptionRevenue + paid,
      },
      event,
    ),
  );
});
