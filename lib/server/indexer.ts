/**
 * The Envio indexer, read from the server.
 *
 * Monad's public RPC answers eth_getLogs over at most 100 blocks, so history
 * the app cannot hold in its own database (who ran on which day, how many runs
 * were signed with a passkey, every sale) is read from the HyperIndex indexer
 * in indexer/ instead. Its GraphQL endpoint is ENVIO_GRAPHQL_URL: Envio Cloud,
 * or the Hasura that indexer/scripts/start.sh runs. A self-hosted Hasura's
 * admin secret, if one is needed, is ENVIO_GRAPHQL_SECRET. Neither is public:
 * the browser only ever sees /api/indexer.
 */
export const INDEXER_URL = process.env.ENVIO_GRAPHQL_URL?.trim() || null;

export class IndexerError extends Error {}

export async function indexerQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!INDEXER_URL) throw new IndexerError("no indexer is configured (ENVIO_GRAPHQL_URL)");
  const secret = process.env.ENVIO_GRAPHQL_SECRET?.trim();
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-hasura-admin-secret": secret } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) throw new IndexerError(`the indexer answered ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new IndexerError(body.errors[0].message);
  if (!body.data) throw new IndexerError("the indexer returned no data");
  return body.data;
}
