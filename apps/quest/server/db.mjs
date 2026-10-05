// The station's own records, next to the GRASP log in .data/: which scanned
// scene each task came from, every episode submitted (with its full frames,
// so the corpus exports real trajectories), bounties paid, skills taught,
// corpora sealed and licences sold. SQLite, persisted, no in-memory stand-ins.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ROOT } from "./grasp.mjs";

export function openDb(path = process.env.THENAR_STATION_DB ?? resolve(ROOT, ".data/station.db")) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS task (
      spec_hash TEXT PRIMARY KEY, registry_id INTEGER NOT NULL, spec TEXT NOT NULL, scene TEXT NOT NULL,
      reward_wei TEXT NOT NULL, tx_hash TEXT, block_number INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS episode (
      leaf TEXT PRIMARY KEY, leaf_index INTEGER UNIQUE NOT NULL, spec_hash TEXT NOT NULL REFERENCES task(spec_hash),
      contributor TEXT, input TEXT, score TEXT NOT NULL, accepted INTEGER NOT NULL, quality_bps INTEGER NOT NULL,
      frames TEXT NOT NULL, consent TEXT NOT NULL, salt TEXT NOT NULL, preimage TEXT NOT NULL,
      anchor_index INTEGER, anchor_tx TEXT, payout_tx TEXT, payout_wei TEXT, payout_error TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS episode_task ON episode(spec_hash);
    CREATE TABLE IF NOT EXISTS skill (
      id INTEGER PRIMARY KEY AUTOINCREMENT, spec_hash TEXT NOT NULL, from_leaf_index INTEGER NOT NULL,
      skill TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS corpus (
      corpus_id INTEGER PRIMARY KEY, spec_hash TEXT NOT NULL, anchor_index INTEGER NOT NULL, price_wei TEXT NOT NULL,
      contributors TEXT NOT NULL, tx_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS licence (
      receipt_id INTEGER PRIMARY KEY, corpus_id INTEGER NOT NULL, detail TEXT NOT NULL, tx_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const task = (r) => r && { specHash: r.spec_hash, registryId: r.registry_id, spec: JSON.parse(r.spec), scene: JSON.parse(r.scene), rewardWei: r.reward_wei, txHash: r.tx_hash, blockNumber: r.block_number, createdAt: r.created_at };
  const episode = (r, withFrames = false) =>
    r && {
      leaf: r.leaf, leafIndex: r.leaf_index, specHash: r.spec_hash, contributor: r.contributor, input: r.input,
      score: JSON.parse(r.score), accepted: !!r.accepted, qualityBps: r.quality_bps, preimage: r.preimage,
      anchorIndex: r.anchor_index, anchorTx: r.anchor_tx, payoutTx: r.payout_tx, payoutWei: r.payout_wei, payoutError: r.payout_error,
      createdAt: r.created_at, ...(withFrames ? { frames: JSON.parse(r.frames) } : {}),
    };
  return {
    raw: db,
    close: () => db.close(),
    addTask: (t) =>
      run(`INSERT INTO task VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(spec_hash) DO NOTHING`, t.specHash, t.registryId, JSON.stringify(t.spec), JSON.stringify(t.scene), t.rewardWei, t.txHash, t.blockNumber, Date.now()),
    tasks: () => all(`SELECT * FROM task ORDER BY created_at DESC`).map((r) => task(r)),
    task: (h) => task(get(`SELECT * FROM task WHERE spec_hash = ?`, h)),
    addEpisode: (e) =>
      run(
        `INSERT INTO episode (leaf, leaf_index, spec_hash, contributor, input, score, accepted, quality_bps, frames, consent, salt, preimage, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        e.leaf, e.leafIndex, e.specHash, e.contributor, e.input, JSON.stringify(e.score), e.accepted ? 1 : 0, e.qualityBps, JSON.stringify(e.frames), e.consent, e.salt, e.preimage, Date.now(),
      ),
    setAnchor: (leaf, index, tx) => run(`UPDATE episode SET anchor_index = ?, anchor_tx = ? WHERE leaf = ?`, index, tx, leaf),
    setPayout: (leaf, tx, wei, err) => run(`UPDATE episode SET payout_tx = ?, payout_wei = ?, payout_error = ? WHERE leaf = ?`, tx, wei, err, leaf),
    episodes: (h) => all(`SELECT * FROM episode WHERE spec_hash = ? ORDER BY leaf_index`, h).map((r) => episode(r)),
    // The payload hash sits right after the version byte in the preimage ("0x" + "02" + 64 hex).
    byPayload: (h, payloadHash) => get(`SELECT leaf_index FROM episode WHERE spec_hash = ? AND lower(substr(preimage, 5, 64)) = ?`, h, payloadHash.slice(2).toLowerCase()),
    episode: (leafIndex, withFrames) => episode(get(`SELECT * FROM episode WHERE leaf_index = ?`, leafIndex), withFrames),
    unanchored: () => all(`SELECT leaf, leaf_index FROM episode WHERE anchor_index IS NULL ORDER BY leaf_index`),
    addSkill: (s) => Number(run(`INSERT INTO skill (spec_hash, from_leaf_index, skill, created_at) VALUES (?,?,?,?)`, s.specHash, s.fromLeafIndex, JSON.stringify(s.skill), Date.now()).lastInsertRowid),
    skills: (h) => all(`SELECT * FROM skill WHERE spec_hash = ? ORDER BY id DESC`, h).map((r) => ({ id: r.id, specHash: r.spec_hash, fromLeafIndex: r.from_leaf_index, createdAt: r.created_at, skill: JSON.parse(r.skill) })),
    addCorpus: (c) => run(`INSERT INTO corpus VALUES (?,?,?,?,?,?,?)`, c.corpusId, c.specHash, c.anchorIndex, c.priceWei, JSON.stringify(c.contributors), c.txHash, Date.now()),
    corpora: (h) => all(`SELECT * FROM corpus WHERE spec_hash = ? ORDER BY corpus_id DESC`, h).map((r) => ({ corpusId: r.corpus_id, specHash: r.spec_hash, anchorIndex: r.anchor_index, priceWei: r.price_wei, contributors: JSON.parse(r.contributors), txHash: r.tx_hash, createdAt: r.created_at })),
    corpus: (id) => get(`SELECT * FROM corpus WHERE corpus_id = ?`, id),
    addLicence: (l) => run(`INSERT INTO licence VALUES (?,?,?,?,?)`, l.receiptId, l.corpusId, JSON.stringify(l), l.txHash, Date.now()),
    licences: (corpusId) => all(`SELECT * FROM licence WHERE corpus_id = ? ORDER BY receipt_id DESC`, corpusId).map((r) => JSON.parse(r.detail)),
  };
}
