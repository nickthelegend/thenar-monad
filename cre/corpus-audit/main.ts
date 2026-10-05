/**
 * corpus-audit: a Chainlink DON checks the corpus Thenar sells against the
 * root the verifier committed on Monad, and writes what it found on chain.
 *
 *   cron → every node: GET {apiBase}/api/corpus/episodes, build each task's
 *          Merkle root itself → consensus (identical) on the roots
 *        → EVM read on monad-testnet: CorpusManifest.latest for every task,
 *          in one Multicall3 call
 *        → a verdict per task (Matches, Grown, Short, Altered, Uncommitted)
 *        → writeReport to CorpusAudit (a ReceiverTemplate) on monad-testnet
 *
 * Thenar's server is the party being checked, so the DON never takes its word
 * for a root: it takes only the episode hashes and does the hashing itself.
 */
import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  Runner,
  TxStatus,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import { zeroAddress, type Hex } from "viem";
import { committedCall, committedFrom, encodeReport, findingsOf, MULTICALL3, servedFrom, type Served } from "./audit";

type Config = {
  schedule: string;
  /** Where Thenar serves /api/corpus/episodes. */
  apiBase: string;
  /** The chain the corpus is paid and committed on (10143 for Monad testnet). */
  chainId: number;
  chainSelectorName: string;
  /** CorpusManifest: the verifier's commitments. */
  corpusManifest: Hex;
  /** CorpusAudit: where the findings are written. */
  corpusAudit: Hex;
  gasLimit: string;
};

/** On every node: the episodes Thenar serves, reduced to roots this node computed. */
const fetchServed = (sendRequester: HTTPSendRequester, config: Config): string => {
  const res = sendRequester
    .sendRequest({ url: `${config.apiBase}/api/corpus/episodes`, method: "GET", headers: { accept: "application/json" } })
    .result();
  if (res.statusCode !== 200) throw new Error(`Thenar answered ${res.statusCode}`);
  const served = servedFrom(JSON.parse(new TextDecoder().decode(res.body)), config.chainId);
  // A string, so identical consensus compares exactly what every node computed.
  return JSON.stringify(served);
};

const onCron = (runtime: Runtime<Config>): string => {
  const config = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`unknown chain ${config.chainSelectorName}`);

  // 1. What Thenar serves, as roots the nodes agree on.
  const http = new cre.capabilities.HTTPClient();
  const agreed = http.sendRequest(runtime, fetchServed, consensusIdenticalAggregation<string>())(config).result();
  const served = JSON.parse(agreed) as Served[];
  if (!served.length) {
    runtime.log("Thenar serves no paid episodes yet; nothing to audit.");
    return "nothing to audit";
  }

  // 2. What the verifier committed, read from Monad at a finalized block.
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const read = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: MULTICALL3, data: committedCall(config.corpusManifest, served.map((s) => s.taskId)) }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  const committed = committedFrom(bytesToHex(read.data));

  // 3. A verdict per task, signed by the DON and written to CorpusAudit.
  const findings = findingsOf(served, committed);
  for (const f of findings) {
    runtime.log(`task ${f.taskId}: ${["uncommitted", "matches", "grown", "short", "altered"][f.verdict]} (served ${f.served}, committed ${f.committed})`);
  }
  const observedAt = BigInt(Math.floor(runtime.now().getTime() / 1000));
  const report = runtime.report(prepareReportRequest(encodeReport(observedAt, findings))).result();
  const write = evm
    .writeReport(runtime, { receiver: config.corpusAudit, report, gasConfig: { gasLimit: config.gasLimit } })
    .result();
  if (write.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`the report did not land: ${write.errorMessage ?? TxStatus[write.txStatus]}`);
  }
  const tx = write.txHash ? bytesToHex(write.txHash) : "unknown";
  runtime.log(`audited ${findings.length} tasks · tx ${tx}`);
  return tx;
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
