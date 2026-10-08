import type { Entity } from "envio";

/**
 * Defaults for rows seen for the first time, and the small pure helpers the
 * handlers share. No registrations here: Envio loads every file in src/, and
 * this one only exports.
 */

export type Stats = Entity<"Stats">;
export type DailyStat = Entity<"DailyStat">;
export type Operator = Entity<"Operator">;
export type Task = Entity<"Task">;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

/** The minimum an event needs to say where and when it happened. */
export type EventMeta = {
  readonly chainId: number;
  readonly logIndex: number;
  readonly block: { readonly number: number; readonly timestamp: number };
  readonly transaction: { readonly hash: string };
};

export const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const isZeroKey = (x: string, y: string) =>
  x.toLowerCase() === ZERO_BYTES32 && y.toLowerCase() === ZERO_BYTES32;

/** One row per log: `${txHash}-${logIndex}`. */
export const logId = (event: EventMeta) => `${event.transaction.hash}-${event.logIndex}`;

export const taskContributorId = (taskId: string, operator: string) => `${taskId}-${operator}`;

/** UTC date of a unix timestamp, YYYY-MM-DD. */
export const utcDate = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 10);

/** Unix seconds at 00:00 UTC of the day `timestamp` falls in. */
export const utcDayStart = (timestamp: number) => BigInt(timestamp - (timestamp % 86_400));

export const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);

export function newStats(chainId: number): Stats {
  return {
    id: String(chainId),
    tasks: 0,
    tasksFilled: 0,
    tasksExpired: 0,
    runs: 0,
    passkeyRuns: 0,
    operators: 0,
    paidTotal: 0n,
    scoreTotal: 0n,
    fundedTotal: 0n,
    refundedTotal: 0n,
    deferredTotal: 0n,
    claimedTotal: 0n,
    sales: 0,
    paidSales: 0,
    freeSales: 0,
    agents: 0,
    salesVolume: 0n,
    shareSupply: 0n,
    shareHolders: 0,
    admitted: 0,
    passkeys: 0,
    passkeyRegistrations: 0,
    dividends: 0,
    dividendsDeclared: 0n,
    dividendsClaimed: 0n,
    subscriptions: 0,
    subscribers: 0,
    subscriptionRevenue: 0n,
    lastBlock: 0n,
    lastEventAt: 0n,
  };
}

export function newDailyStat(timestamp: number): DailyStat {
  const date = utcDate(timestamp);
  return {
    id: date,
    date,
    dayStart: utcDayStart(timestamp),
    runs: 0,
    paid: 0n,
    scoreTotal: 0n,
    bestScore: 0,
    activeOperators: 0,
    newOperators: 0,
    tasksCreated: 0,
    sales: 0,
    salesVolume: 0n,
  };
}

export function newOperator(id: string): Operator {
  return {
    id,
    runCount: 0,
    passkeyRunCount: 0,
    tasksContributed: 0,
    paidTotal: 0n,
    scoreTotal: 0n,
    bestScore: 0,
    firstRunAt: undefined,
    lastRunAt: undefined,
    hasPasskey: false,
    passkey_id: undefined,
    admitted: false,
    admittedAt: undefined,
    admittedTx: undefined,
    shareBalance: 0n,
    sharesIssued: 0n,
    dividendsClaimed: 0n,
    deferredTotal: 0n,
    claimedTotal: 0n,
    owed: 0n,
  };
}

/** Stamp the chain's totals with the event that last touched them. */
export function touched(stats: Stats, event: EventMeta): Stats {
  return {
    ...stats,
    lastBlock: maxBig(stats.lastBlock, BigInt(event.block.number)),
    lastEventAt: maxBig(stats.lastEventAt, BigInt(event.block.timestamp)),
  };
}
