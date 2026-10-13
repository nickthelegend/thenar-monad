/**
 * One operator's paid run on Monad testnet, end to end, without a browser.
 *
 *   node --import ./test/register.mjs scripts/monad-operator-run.mjs [taskId]
 *   OPERATOR_KEY_FILE=.data/seed-1.key FUNDER_KEY_FILE=.data/monad-operator.key RECORDING=0x… … [taskId]
 *
 * The same steps the station takes, against the live app (APP_ORIGIN,
 * default https://app.thenar.io) and Monad testnet:
 *   1. a fresh operator wallet, given a little MON for gas by FUNDER_KEY_FILE;
 *   2. a P-256 key registered in PasskeyRegistry (Monad checks it at 0x0100);
 *   3. admission: the server's challenge, signed as a WebAuthn assertion;
 *   4. the hosted verifier re-scores a recorded trajectory and signs it;
 *   5. submitTrajectory, sent with eth_sendRawTransactionSync, timed executed
 *      and final, and recorded with /api/submitted and /api/receipts.
 * The trajectory is a run recorded on the local chain for the task of the same
 * name (same scene, same rules). The verifier scores it afresh for this
 * operator, since the contributor is part of what it hashes.
 */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { AXON_ABI } from "../lib/abi.ts";
import { DEPLOYMENT } from "../lib/deployment.ts";
import { noteSynced, trackReceipt } from "../lib/receipt-timers.ts";

const SITE = process.env.APP_ORIGIN ?? "https://app.thenar.io";
const RPC = "https://testnet-rpc.monad.xyz";
const TASK = Number(process.argv[2] ?? 0);
const FUNDER_KEY_FILE = process.env.FUNDER_KEY_FILE ?? "/Volumes/Extreme SSD/Projects/metropolis-funding/keys/cre-shared.key";
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const tx = (h) => `https://testnet.monadvision.com/tx/${h}`;

// 1. An operator wallet, kept in .data/ (gitignored) so a failed run resumes
//    with the same address instead of funding a new one.
const KEY_FILE = process.env.OPERATOR_KEY_FILE ?? ".data/monad-operator.key";
if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, generatePrivateKey(), { mode: 0o600 });
const operator = privateKeyToAccount(readFileSync(KEY_FILE, "utf8").trim());
if ((await pub.getBalance({ address: operator.address })) < parseEther("0.05")) {
  const funder = privateKeyToAccount(readFileSync(FUNDER_KEY_FILE, "utf8").trim());
  const fund = await createWalletClient({ account: funder, chain, transport: http(RPC) }).sendTransaction({ to: operator.address, value: parseEther("0.15"), gas: 21_000n });
  await pub.waitForTransactionReceipt({ hash: fund });
  console.log(`operator ${operator.address} funded 0.15 MON  ${tx(fund)}`);
}
// The public RPC is load-balanced: wait until the node answering sees the balance.
while ((await pub.getBalance({ address: operator.address })) === 0n) await new Promise((r) => setTimeout(r, 500));
console.log(`operator ${operator.address} holds ${formatEther(await pub.getBalance({ address: operator.address }))} MON`);
const wallet = createWalletClient({ account: operator, chain, transport: http(RPC) });

// 2. A P-256 key, registered on chain.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = publicKey.export({ format: "jwk" });
const coord = (b64) => `0x${Buffer.from(b64, "base64url").toString("hex").padStart(64, "0")}`;
const registry = DEPLOYMENT.contracts.passkeyRegistry;
const regAbi = parseAbi(["function register(bytes32 x, bytes32 y)"]);
// register() replaces any earlier key for this address, so a resumed run binds this process's fresh key.
const regGas = await pub.estimateContractGas({ address: registry, abi: regAbi, functionName: "register", args: [coord(jwk.x), coord(jwk.y)], account: operator });
const reg = await wallet.writeContract({ address: registry, abi: regAbi, functionName: "register", args: [coord(jwk.x), coord(jwk.y)], gas: (regGas * 11n) / 10n });
await pub.waitForTransactionReceipt({ hash: reg });
console.log(`passkey  registered in PasskeyRegistry  ${tx(reg)}`);

// 3. Admission: the server's challenge, signed as a WebAuthn assertion from this site.
const sha = (...parts) => { const h = createHash("sha256"); for (const p of parts) h.update(p); return h.digest(); };
const b64url = (b) => Buffer.from(b).toString("base64url");
const post = (path, body) => fetch(`${SITE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const { body: { challenge } } = await post("/api/operator", { action: "challenge", address: operator.address });
const authData = Buffer.concat([sha(Buffer.from(new URL(SITE).hostname)), Buffer.from([0x05]), Buffer.from([0, 0, 0, 7])]);
const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: SITE }));
const assertion = {
  authenticatorData: b64url(authData), clientDataJSON: b64url(clientData),
  signature: b64url(sign("sha256", Buffer.concat([authData, sha(clientData)]), privateKey)),
};
const admitted = await post("/api/operator", { action: "admit", address: operator.address, assertion });
console.log(`admitted ${admitted.status} ${JSON.stringify(admitted.body).slice(0, 160)}`);
if (!admitted.body.admitted) process.exit(1);

// 4. The hosted verifier scores a recording of this task's scene and signs it.
// RECORDING picks one recording by its hash; otherwise the task's best.
const where = process.env.RECORDING ? `traj_hash = '${process.env.RECORDING.replace(/[^0-9a-fx]/gi, "")}'` : `task_id = ${TASK} and settled = 1 order by score desc`;
const out = execFileSync("sqlite3", ["-json", ".data/localnet.db", `select samples, duration_s, deviation_mm, payload_ids from trajectory where ${where} limit 1;`], { encoding: "utf8" }).trim();
const [row] = out ? JSON.parse(out) : [];
if (!row) throw new Error(`no recorded run for task ${TASK} on this machine`);
const verdict = await post("/api/verify", {
  taskId: TASK, contributor: operator.address, samples: JSON.parse(row.samples), durationSeconds: row.duration_s,
  deviationMm: row.deviation_mm, success: true, ...(row.payload_ids ? { payloadIds: JSON.parse(row.payload_ids) } : {}),
});
console.log(`verifier ${verdict.status} score ${verdict.body.score} accepted ${verdict.body.accepted} ${verdict.body.error ?? ""}`);
if (!verdict.body.accepted) process.exit(1);

// 5. One transaction records the run and pays the operator, timed from the send.
const args = [BigInt(TASK), verdict.body.trajHash, verdict.body.cid, verdict.body.score, verdict.body.signature];
const gas = (await pub.estimateContractGas({ address: DEPLOYMENT.contracts.axon, abi: AXON_ABI, functionName: "submitTrajectory", args, account: operator }) * 11n) / 10n;
const request = await wallet.prepareTransactionRequest({ to: DEPLOYMENT.contracts.axon, data: (await import("viem")).encodeFunctionData({ abi: AXON_ABI, functionName: "submitTrajectory", args }), gas });
const serialized = await wallet.signTransaction(request);
const sentAt = performance.now();
const synced = await pub.request({ method: "eth_sendRawTransactionSync", params: [serialized] });
noteSynced(synced.transactionHash, sentAt, performance.now());
const { receipt, timers } = await (await trackReceipt(pub, synced.transactionHash, { sentAt, where: "monad" })).final;
console.log(`paid run ${receipt.status} on Monad, executed ${Math.round(timers.executedMs)} ms, final ${timers.finalMs ? Math.round(timers.finalMs) + " ms" : "not seen"}  ${tx(synced.transactionHash)}`);
console.log(`gas      limit ${gas}, used ${receipt.gasUsed}, charged ${formatEther(gas * receipt.effectiveGasPrice)} MON (Monad charges the limit)`);
const recorded = await post("/api/submitted", { trajHash: verdict.body.trajHash, txHash: synced.transactionHash });
console.log(`recorded ${recorded.status} shares ${JSON.stringify(recorded.body.shares ?? recorded.body.error).slice(0, 140)}`);
const timed = await post("/api/receipts", { tx: synced.transactionHash, action: "submitTrajectory", chain: "monad", via: timers.via, executedMs: Math.round(timers.executedMs), finalMs: timers.finalMs ? Math.round(timers.finalMs) : null });
console.log(`receipts ${timed.status}  run page ${SITE}/run/${verdict.body.trajHash}`);
