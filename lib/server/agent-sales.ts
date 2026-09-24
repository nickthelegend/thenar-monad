import "server-only";
import { isAddress } from "@/lib/chain";
import { DEPLOYMENT } from "@/lib/deployment";
import { query, run } from "./sql";

/** Where corpus sales are paid: CORPUS_TREASURY, or the deployer that funds the tasks. */
export function corpusTreasury(): string | null {
  const t = process.env.CORPUS_TREASURY || DEPLOYMENT.deployer;
  return isAddress(t) ? t : null;
}

export type CorpusSale = {
  /** The settlement tx hash for a paid pull; `agentkit:<nonce>` for a free one. */
  id: string;
  task_id: number;
  /** Every sale is x402; "agentkit" survives only on rows from before World's
   *  free-pull path was removed. */
  method: "x402" | "agentkit";
  /** The paying address for a payment, the agent's address for a free pull. */
  buyer: string | null;
  network: string;
  /** Atomic units of `asset`. Null for a free pull, which moved nothing. */
  amount: string | null;
  asset: string | null;
  created_at: number;
};

export async function recordSale(s: CorpusSale): Promise<void> {
  await run(
    `INSERT INTO corpus_sale (id, task_id, method, buyer, network, amount, asset, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    [s.id, s.task_id, s.method, s.buyer, s.network, s.amount, s.asset, s.created_at],
  );
}

export type SaleAudit = { contract: string; sequence: number; transaction: string };

/**
 * The digest of what a sale served, and where in SalesLog it was logged.
 *
 * Written even when the log could not be posted, with the reason, so a sale
 * missing from the log is visibly missing rather than quietly so.
 */
export async function recordAudit(
  saleId: string, sha256: string, audit: SaleAudit | null, error: string | null,
): Promise<void> {
  await run(
    `INSERT INTO corpus_sale_audit (sale_id, sha256, log_contract, log_seq, transaction_id, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (sale_id) DO NOTHING`,
    [saleId, sha256, audit?.contract ?? null, audit?.sequence ?? null, audit?.transaction ?? null, error, Date.now()],
  );
}

export type ListedSale = CorpusSale & {
  sha256: string | null;
  log_contract: string | null;
  log_seq: number | null;
  log_tx: string | null;
  audit_error: string | null;
};

export async function recentSales(limit = 50): Promise<ListedSale[]> {
  return query<ListedSale>(
    `SELECT s.id, s.task_id, s.method, s.buyer, s.network, s.amount, s.asset, s.created_at,
            a.sha256, a.log_contract, a.log_seq, a.transaction_id AS log_tx, a.error AS audit_error
       FROM corpus_sale s LEFT JOIN corpus_sale_audit a ON a.sale_id = s.id
      ORDER BY s.created_at DESC LIMIT ?`,
    [limit],
  );
}

/** Everything one agent wallet has bought, newest first. */
export async function salesTo(buyer: string, limit = 50): Promise<ListedSale[]> {
  return query<ListedSale>(
    `SELECT s.id, s.task_id, s.method, s.buyer, s.network, s.amount, s.asset, s.created_at,
            a.sha256, a.log_contract, a.log_seq, a.transaction_id AS log_tx, a.error AS audit_error
       FROM corpus_sale s LEFT JOIN corpus_sale_audit a ON a.sale_id = s.id
      WHERE s.buyer = ?
      ORDER BY s.created_at DESC LIMIT ?`,
    [buyer.toLowerCase(), limit],
  );
}
