// The station's HTTP API, served next to the relay's WebSocket.
//
//   GET  /api/station                    chain, keys' balances, log size
//   GET  /api/tasks                      scanned tasks, with their on-chain record
//   POST /api/tasks                      {scene, reward} → TaskRegistry.publish
//   GET  /api/tasks/:hash                one task: spec, scene, episodes, skills, corpora
//   POST /api/episodes                   {specHash, contributor, episode} → score, log, anchor, bounty
//   GET  /api/episodes/:leafIndex        one stored recording, frames and all
//   GET  /api/episodes/:leafIndex/proof  inclusion proof against the anchor that covers it
//   POST /api/tasks/:hash/skills         {leafIndex?} → teach from an accepted episode
//   POST /api/tasks/:hash/corpus         {price} → FoundryMarket.sealCorpus
//   POST /api/corpus/:id/license         → FoundryMarket.license, pays everyone in one tx
//   GET  /api/tasks/:hash/export         LeRobot v3 dataset of the accepted episodes (.tar.gz)
//
// Errors are JSON `{error}` with a sentence a person can act on.
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { parseEther, formatEther } from "viem";
import * as grasp from "./grasp.mjs";
import { checkScene, specFromScene, publishable, checkEpisode, buildLeaf, payoutAddress, toJSON, worldSeedOf, withTcp, inputOf, HUMAN } from "./episodes.mjs";
import { learn } from "../src/teach.js";

const arm = JSON.parse(readFileSync(new URL("../public/models/arm.json", import.meta.url)));
const HASH = /^0x[0-9a-f]{64}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new HttpError(400, m);
const notFound = (m) => new HttpError(404, m);

async function body(req, limit = 8 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, "That request is too large.");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw bad("The request body is not JSON.");
  }
}
function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(toJSON(data)));
}
/** A chain failure, told plainly: a revert name, or "unreachable". */
function chainError(e) {
  const m = e?.shortMessage ?? e?.message ?? String(e);
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|timed out|HTTP request failed/i.test(m)) return new HttpError(502, "Monad's RPC is not answering; try again in a moment.");
  if (/insufficient funds|exceeds the balance/i.test(m)) return new HttpError(402, "A station wallet cannot cover the value plus gas. Top up the curator from the Monad faucet.");
  return new HttpError(502, `Monad refused it: ${m}`);
}

function taskView(db, t, onChain) {
  const eps = db.episodes(t.specHash);
  return {
    specHash: t.specHash,
    registryId: t.registryId,
    instruction: t.spec.instruction,
    scene: t.scene,
    rewardMon: formatEther(BigInt(t.rewardWei)),
    txHash: t.txHash,
    explorer: t.txHash ? `${grasp.EXPLORER}/tx/${t.txHash}` : `${grasp.EXPLORER}/address/${grasp.ADDR.registry}`,
    onChain,
    episodes: eps.length,
    accepted: eps.filter((e) => e.accepted).length,
    createdAt: t.createdAt,
  };
}

export function createApi({ db, broadcast = () => {} }) {
  const routes = [];
  const on = (method, pattern, fn) => routes.push({ method, pattern, fn });

  on("GET", /^\/api\/station$/, async () => {
    const problem = grasp.configured();
    if (problem) throw new HttpError(503, problem);
    return { ...(await grasp.status()), rewardCapMon: formatEther(grasp.MAX_REWARD), reserveMon: formatEther(grasp.RESERVE) };
  });

  on("GET", /^\/api\/tasks$/, async () => {
    const tasks = db.tasks();
    const chain = await Promise.all(tasks.map((t) => grasp.taskOnChain(t.registryId).catch(() => null)));
    return { tasks: tasks.map((t, i) => taskView(db, t, chain[i])) };
  });

  on("POST", /^\/api\/tasks$/, async (req) => {
    const problem = grasp.configured();
    if (problem) throw new HttpError(503, problem);
    const { scene, reward } = await body(req);
    const why = checkScene(scene);
    if (why) throw bad(why);
    let rewardWei;
    try {
      rewardWei = parseEther(String(reward ?? "0").trim() || "0");
    } catch {
      throw bad("The reward must be a number of MON, like 0.001.");
    }
    if (rewardWei < 0n) throw bad("The reward cannot be negative.");
    if (rewardWei > grasp.MAX_REWARD) throw bad(`The reward may not exceed ${formatEther(grasp.MAX_REWARD)} MON per episode.`);
    const spec = specFromScene(scene, { manifestSha: arm.sourceSha256 });
    const { specHash, errors, warnings } = publishable(spec);
    if (errors.length) throw bad(`The task is not publishable: ${errors.join("; ")}.`);
    let pubd;
    try {
      pubd = await grasp.publishTask(specHash, spec.acceptance.targetEpisodes);
    } catch (e) {
      throw chainError(e);
    }
    const existing = db.task(specHash);
    if (!existing) db.addTask({ specHash, registryId: pubd.id, spec, scene, rewardWei: rewardWei.toString(), txHash: pubd.txHash, blockNumber: pubd.blockNumber });
    const t = db.task(specHash);
    const view = taskView(db, t, await grasp.taskOnChain(t.registryId));
    broadcast({ type: "task", task: view });
    return { status: pubd.already ? 200 : 201, body: { task: { ...view, id: t.registryId }, warnings, already: pubd.already } };
  });

  on("GET", /^\/api\/tasks\/(0x[0-9a-fA-F]{64})$/, async (_req, [h]) => {
    const t = db.task(h.toLowerCase());
    if (!t) throw notFound("No task with that spec hash on this station.");
    const [onChain, corpora] = await Promise.all([grasp.taskOnChain(t.registryId), corporaOf(t.specHash)]);
    return {
      task: taskView(db, t, onChain),
      spec: t.spec,
      episodes: db.episodes(t.specHash),
      skills: db.skills(t.specHash).map(({ skill, ...s }) => ({ ...s, durationS: skill.duration_s })),
      corpora,
    };
  });

  async function corporaOf(specHash) {
    return Promise.all(db.corpora(specHash).map(async (c) => ({ ...c, onChain: await grasp.corpusOnChain(c.corpusId), licences: db.licences(c.corpusId) })));
  }

  on("POST", /^\/api\/episodes$/, async (req) => {
    const problem = grasp.configured();
    if (problem) throw new HttpError(503, problem);
    const { specHash, contributor, episode } = await body(req);
    if (!HASH.test(String(specHash).toLowerCase())) throw bad("specHash must be a task's 32-byte spec hash.");
    const t = db.task(specHash.toLowerCase());
    if (!t) throw notFound("That task is not on this station. Scan it first.");
    const who = contributor ? payoutAddress(contributor) : null;
    if (contributor && !who) throw bad("The payout address is not a valid Monad address.");
    const why = checkEpisode(episode);
    if (why) throw bad(why);
    episode.frames = withTcp(episode.frames);
    episode.input = inputOf(episode.frames);
    // The episode must have been recorded against this task's scene, not another.
    const c0 = episode.frames[0]["observation.cube"];
    const off = Math.hypot(c0[0] * 1000 - t.scene.pick.x_mm, c0[1] * 1000 - t.scene.pick.y_mm);
    if (off > 30) throw bad(`This episode's object started ${Math.round(off)} mm from where the task's scan put the ${t.scene.pick.label}; it was recorded against another scene.`);
    const salt = randomBytes(32).toString("hex");
    const built = buildLeaf({ ep: episode, scene: t.scene, specHash: t.specHash, contributor: who ?? "anonymous", salt });
    // The leaf carries a fresh consent salt, so the same recording would hash
    // to a new leaf each time; the trajectory's own hash is what repeats.
    const dup = db.byPayload(t.specHash, built.episode.payloadHash);
    if (dup || store_has(built.leaf)) throw new HttpError(409, `This recording was already submitted, as leaf ${dup?.leaf_index ?? "?"}.`);

    let appended;
    try {
      appended = await grasp.appendAndAnchor(built.leaf, { preimage: built.preimage, taskId: t.specHash, contributor: who, qualityScore: built.score.totalBps, success: built.accepted ? 1 : 0 });
    } catch (e) {
      if (/already in the log/.test(e.message)) throw new HttpError(409, "This exact episode has already been submitted.");
      throw e;
    }
    db.addEpisode({ leaf: built.leaf, leafIndex: appended.index, specHash: t.specHash, contributor: who, input: episode.input ?? null, score: built.score, accepted: built.accepted, qualityBps: built.score.totalBps, frames: episode.frames, consent: built.consent, salt, preimage: built.preimage });
    if (appended.anchor) {
      db.setAnchor(built.leaf, appended.anchor.index, appended.anchor.txHash);
      // An earlier leaf whose anchor failed is covered by this one too.
      for (const u of db.unanchored()) if (u.leaf_index < appended.anchor.size) db.setAnchor(u.leaf, appended.anchor.index, appended.anchor.txHash);
    }

    let payout = null;
    const reward = BigInt(t.rewardWei);
    const human = HUMAN.has(episode.input);
    if (built.accepted && who && reward > 0n && human) {
      try {
        const p = await grasp.payBounty(who, reward);
        db.setPayout(built.leaf, p.txHash, reward.toString(), null);
        payout = { txHash: p.txHash, amountMon: formatEther(reward), to: who, explorer: `${grasp.EXPLORER}/tx/${p.txHash}` };
      } catch (e) {
        db.setPayout(built.leaf, null, null, e.message);
        payout = { error: e.shortMessage ?? e.message };
      }
    }
    const result = {
      leafIndex: appended.index,
      leaf: built.leaf,
      accepted: built.accepted,
      score: built.score,
      reason: built.accepted ? null : !built.score.success ? `The ${t.scene.pick.label} came to rest ${Math.round(built.score.deviationMm)} mm from the ${t.scene.place.label}; the task allows ${t.spec.success.toleranceMm} mm.` : `Scored ${built.score.totalBps / 100}%, under the ${t.spec.acceptance.minScoreBps / 100}% this task accepts.`,
      anchor: appended.anchor && { ...appended.anchor, explorer: `${grasp.EXPLORER}/tx/${appended.anchor.txHash}` },
      anchorError: appended.anchorError && `Logged at leaf ${appended.index}, but anchoring on Monad failed (${appended.anchorError}); the next episode's anchor will cover it.`,
      payout,
      input: episode.input,
      bounty: !human ? `No bounty: this take was driven by the ${episode.input === "taught-repeat" ? "taught skill" : episode.input === "scripted-demo" ? "scripted demo" : "replay"}, not a person.` : !who ? "No payout address was given, so no bounty was paid." : null,
    };
    broadcast({ type: "episode", specHash: t.specHash, ...result });
    return { status: 201, body: result };
  });
  const store_has = (leaf) => grasp.store.indexOfLeaf(leaf) !== null;

  on("GET", /^\/api\/episodes\/(\d+)$/, async (_req, [i]) => {
    const e = db.episode(+i, true);
    if (!e) throw notFound("No episode at that leaf index on this station.");
    return { format: "thenar-quest-episode/1", robot: "so101-mg996r-r3", fps: 30, specHash: e.specHash, leafIndex: e.leafIndex, leaf: e.leaf, input: e.input, score: e.score, accepted: e.accepted, anchorIndex: e.anchorIndex, frames: e.frames };
  });

  on("GET", /^\/api\/episodes\/(\d+)\/proof$/, async (_req, [i]) => {
    const e = db.episode(+i);
    if (!e) throw notFound("No episode at that leaf index on this station.");
    let p;
    try {
      p = await grasp.proofFor(+i);
    } catch (err) {
      throw chainError(err);
    }
    if (!p) throw new HttpError(409, "That episode is in the log but no anchor on Monad covers it yet.");
    return { ...p, verifier: grasp.ADDR.verifier, chainId: 10143, rpc: "https://testnet-rpc.monad.xyz" };
  });

  on("POST", /^\/api\/tasks\/(0x[0-9a-fA-F]{64})\/skills$/, async (req, [h]) => {
    const t = db.task(h.toLowerCase());
    if (!t) throw notFound("No task with that spec hash on this station.");
    const { leafIndex } = await body(req);
    const eps = db.episodes(t.specHash).filter((e) => e.accepted && HUMAN.has(e.input));
    if (!eps.length) throw new HttpError(409, "Teach needs one accepted demonstration of this task by a person first.");
    const from = leafIndex != null ? eps.find((e) => e.leafIndex === +leafIndex) : eps.sort((a, b) => b.qualityBps - a.qualityBps)[0];
    if (!from) throw bad("That episode is not an accepted demonstration of this task.");
    const full = db.episode(from.leafIndex, true);
    const { skill, reason } = learn({ frames: full.frames, started_at: new Date(full.createdAt).toISOString(), task: { goal: [t.scene.place.x_mm, t.scene.place.y_mm] } });
    if (!skill) throw new HttpError(422, reason);
    const id = db.addSkill({ specHash: t.specHash, fromLeafIndex: from.leafIndex, skill });
    return { status: 201, body: { id, fromLeafIndex: from.leafIndex, qualityBps: from.qualityBps, skill } };
  });

  on("GET", /^\/api\/tasks\/(0x[0-9a-fA-F]{64})\/skills\/latest$/, async (_req, [h]) => {
    if (!db.task(h.toLowerCase())) throw notFound("No task with that spec hash on this station.");
    // Nothing taught yet is a normal state of a task, not a missing resource.
    return db.skills(h.toLowerCase())[0] ?? { skill: null };
  });

  on("POST", /^\/api\/tasks\/(0x[0-9a-fA-F]{64})\/corpus$/, async (req, [h]) => {
    const t = db.task(h.toLowerCase());
    if (!t) throw notFound("No task with that spec hash on this station.");
    const { price } = await body(req);
    let priceWei;
    try {
      priceWei = parseEther(String(price ?? "").trim());
    } catch {
      throw bad("The licence price must be a number of MON, like 0.005.");
    }
    if (priceWei <= 0n || priceWei > parseEther("0.05")) throw bad("The licence price must be above 0 and at most 0.05 MON.");
    const eps = db.episodes(t.specHash).filter((e) => e.accepted && e.contributor && e.anchorIndex != null && HUMAN.has(e.input));
    if (!eps.length) throw new HttpError(409, "Nothing to seal: this task has no anchored, accepted episodes by a person with a payout address.");
    // Weight = the quality each contributor put into this task's corpus.
    const w = new Map();
    for (const e of eps) w.set(e.contributor, (w.get(e.contributor) ?? 0) + e.qualityBps);
    const contributors = [...w.keys()], weights = [...w.values()];
    let s;
    try {
      s = await grasp.sealCorpus(t.registryId, contributors, weights, priceWei);
    } catch (e) {
      throw chainError(e);
    }
    db.addCorpus({ corpusId: s.corpusId, specHash: t.specHash, anchorIndex: s.anchorIndex, priceWei: priceWei.toString(), contributors: contributors.map((a, i) => ({ address: a, weight: weights[i] })), txHash: s.txHash });
    return { status: 201, body: { ...s, price: formatEther(priceWei), contributors: contributors.map((a, i) => ({ address: a, weight: weights[i] })), explorer: `${grasp.EXPLORER}/tx/${s.txHash}` } };
  });

  on("POST", /^\/api\/corpus\/(\d+)\/license$/, async (_req, [id]) => {
    const c = db.corpus(+id);
    if (!c) throw notFound("That corpus was not sealed by this station.");
    let l;
    try {
      l = await grasp.license(+id);
    } catch (e) {
      throw e.status === 409 || e.status === 402 ? new HttpError(e.status, e.message) : chainError(e);
    }
    db.addLicence({ ...l, corpusId: +id });
    broadcast({ type: "licence", corpusId: +id, ...l });
    return { status: 201, body: { ...l, explorer: `${grasp.EXPLORER}/tx/${l.txHash}` } };
  });

  on("GET", /^\/api\/tasks\/(0x[0-9a-fA-F]{64})\/export$/, async (_req, [h], res) => {
    const t = db.task(h.toLowerCase());
    if (!t) throw notFound("No task with that spec hash on this station.");
    const eps = db.episodes(t.specHash).filter((e) => e.accepted).map((e) => db.episode(e.leafIndex, true));
    if (!eps.length) throw new HttpError(409, "No accepted episodes to export yet.");
    const name = `thenar-${t.specHash.slice(2, 10)}-lerobot`;
    const dir = resolve(grasp.ROOT, ".data/export", name);
    rmSync(dir, { recursive: true, force: true });
    writeLeRobot(dir, t, eps);
    const tar = resolve(grasp.ROOT, ".data/export", `${name}.tar.gz`);
    execFileSync("tar", ["-czf", tar, "-C", resolve(grasp.ROOT, ".data/export"), name]);
    res.writeHead(200, { "content-type": "application/gzip", "content-disposition": `attachment; filename="${name}.tar.gz"` });
    res.end(readFileSync(tar));
    return null;
  });

  return async function handle(req, res) {
    const url = new URL(req.url, "http://station");
    if (!url.pathname.startsWith("/api/")) return false;
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.pattern);
      if (!m) continue;
      try {
        const out = await r.fn(req, m.slice(1), res);
        if (out === null) return true;
        if (out?.status && out.body) send(res, out.status, out.body);
        else send(res, 200, out);
      } catch (e) {
        if (!(e instanceof HttpError)) console.error(e);
        send(res, e.status ?? 500, { error: e instanceof HttpError ? e.message : `The station failed: ${e.message}` });
      }
      return true;
    }
    const known = routes.some((r) => url.pathname.match(r.pattern));
    send(res, known ? 405 : 404, { error: known ? `${req.method} is not allowed here.` : "No such endpoint." });
    return true;
  };
}

/**
 * LeRobot v3 layout (jsonl data, as services/export writes), with the real
 * frames: state and action are the six joints in degrees, plus the gripper's
 * pose and the object's, so a policy can be trained without an adapter.
 */
function writeLeRobot(dir, t, eps) {
  mkdirSync(join(dir, "data"), { recursive: true });
  mkdirSync(join(dir, "meta"), { recursive: true });
  let index = 0;
  const episodes = [];
  eps.forEach((e, ei) => {
    const rows = e.frames.map((f, fi) => JSON.stringify({
      timestamp: +(f.t - e.frames[0].t).toFixed(4), frame_index: fi, episode_index: ei, index: index++, task_index: 0,
      "observation.state": f["observation.state"], action: f.action, "observation.tcp": f["observation.tcp"], "observation.object": f["observation.cube"],
    }));
    writeFileSync(join(dir, "data", `episode_${String(ei).padStart(6, "0")}.jsonl`), rows.join("\n") + "\n");
    episodes.push({ episode_index: ei, length: rows.length, tasks: [t.spec.instruction], thenar: { leaf: e.leaf, leaf_index: e.leafIndex, anchor_index: e.anchorIndex, anchor_tx: e.anchorTx, quality_bps: e.qualityBps, contributor: e.contributor, input: e.input } });
  });
  writeFileSync(join(dir, "meta", "episodes.jsonl"), episodes.map((x) => JSON.stringify(x)).join("\n") + "\n");
  writeFileSync(join(dir, "meta", "tasks.jsonl"), JSON.stringify({ task_index: 0, task: t.spec.instruction }) + "\n");
  writeFileSync(join(dir, "meta", "info.json"), JSON.stringify({
    codebase_version: "v3.0", data_format: "jsonl", robot_type: "so101_mg996r_r3", fps: 30,
    total_episodes: eps.length, total_frames: index, total_tasks: 1,
    features: {
      "observation.state": { dtype: "float32", shape: [6], names: arm.jointNames, unit: "deg" },
      action: { dtype: "float32", shape: [6], names: arm.jointNames, unit: "deg" },
      "observation.tcp": { dtype: "float32", shape: [7], names: ["x", "y", "z", "qx", "qy", "qz", "qw"], unit: "m, arm base frame" },
      "observation.object": { dtype: "float32", shape: [7], names: ["x", "y", "z", "qx", "qy", "qz", "qw"], unit: "m, arm base frame" },
    },
    thenar: { spec_hash: t.specHash, registry_id: t.registryId, world_seed: worldSeedOf(t.scene).toString(), scene: t.scene, spec: t.spec, log: grasp.ADDR.log, verifier: grasp.ADDR.verifier, chain_id: 10143 },
  }, null, 1));
}
