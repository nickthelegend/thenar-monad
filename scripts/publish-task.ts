/**
 * Publish a task spec to the registry from the command line.
 *
 *   pnpm tsx scripts/publish-task.ts my-task.json \
 *     --uri https://thenar.io/tasks/my-task --curator-bps 1000 --target 500
 *
 * The build page offers this to anyone without a wallet in their browser: it
 * copies the spec, and this sends it. The spec is validated here rather than
 * trusted, because the page's validation is a courtesy to the curator and not
 * a control — and because a task whose scenes never vary is a demo that would
 * sit in the registry forever, unpublishable only after somebody paid gas.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN } from "../services/log/src/chain.ts";
import { deployerKey } from "../services/log/src/anchorer.ts";
import { validateTaskSpec, taskId } from "../packages/protocol/src/taskspec.ts";

const REGISTRY_ABI = parseAbi([
  "function publish(bytes32 specHash, string uri, uint16 curatorBps, uint32 targetEpisodes) returns (uint256)",
  "function taskCount() view returns (uint256)",
]);

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
};

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("usage: pnpm tsx scripts/publish-task.ts <spec.json> --uri <url> " +
                  "[--curator-bps 1000] [--target 500]");
    process.exit(1);
  }

  const doc = JSON.parse(readFileSync(file, "utf8"));
  // The build page copies the bare spec; a published task document nests it.
  const spec = doc.spec ?? doc;

  const issues = validateTaskSpec(spec);
  for (const i of issues) console.log(`  ${i.severity === "error" ? "error" : " warn"}  ${i.message}`);
  if (issues.some((i) => i.severity === "error")) {
    console.error("\nrefusing to publish a spec with errors — fix them and run this again");
    process.exit(1);
  }

  const specHash = taskId(spec);
  const uri = arg("uri");
  const curatorBps = Number(arg("curator-bps", "1000"));
  const targetEpisodes = Number(arg("target", String(spec.acceptance?.targetEpisodes ?? 500)));
  if (curatorBps > 3000) throw new Error(`curatorBps ${curatorBps} is above the registry's 3000 cap`);
  if (targetEpisodes === 0) throw new Error("targetEpisodes must not be zero");

  const registry = (process.env.TASK_REGISTRY ?? "") as Hex;
  if (!registry) throw new Error("set TASK_REGISTRY (see .env.contracts)");

  const account = privateKeyToAccount(deployerKey());
  const pub = createPublicClient({ chain: CHAIN, transport: http() });
  const wallet = createWalletClient({ account, chain: CHAIN, transport: http() });

  const chainId = await pub.getChainId();
  if (chainId !== CHAIN.id) {
    throw new Error(`REFUSING_WRONG_CHAIN: connected to ${chainId}, expected ${CHAIN.id}`);
  }

  console.log(`spec        ${file}`);
  console.log(`  taskId    ${specHash}`);
  console.log(`  uri       ${uri}`);
  console.log(`  curator   ${curatorBps} bps to ${account.address}`);
  console.log(`  target    ${targetEpisodes} episodes`);
  console.log(`  registry  ${registry} on ${CHAIN.name} (${CHAIN.id})`);

  const before = Number(await pub.readContract({
    address: registry, abi: REGISTRY_ABI, functionName: "taskCount" }));

  // Simulate first: publishing a spec hash the registry already holds reverts,
  // and finding that out from a receipt costs gas to learn nothing.
  await pub.simulateContract({
    account, address: registry, abi: REGISTRY_ABI, functionName: "publish",
    args: [specHash, uri, curatorBps, targetEpisodes],
  });

  const txHash = await wallet.writeContract({
    address: registry, abi: REGISTRY_ABI, functionName: "publish",
    args: [specHash, uri, curatorBps, targetEpisodes], gas: 300000n,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`publish reverted — ${txHash}`);

  const after = Number(await pub.readContract({
    address: registry, abi: REGISTRY_ABI, functionName: "taskCount" }));
  console.log(`\npublished as task #${after - 1} (registry went ${before} to ${after}) in block ${receipt.blockNumber}`);
  console.log(txHash);
}

main().catch((e) => { console.error(e.shortMessage ?? e.message); process.exit(1); });
