/* grasp-chain.js — the settlement ledger, actually running.
 *
 * The previous version of this drew a plausible ledger and said so in the
 * corner. This one reads GraspLog on Monad Testnet over JSON-RPC and draws
 * what is actually anchored: every batch, its root, how many clips it carries,
 * and the block it landed in.
 *
 * Reads need no wallet. If the RPC cannot be reached the strip says so rather
 * than falling back to invented blocks — a ledger that lies when the network
 * is down is worse than one that admits it.
 */
export const MONAD = {
  chainId: 10143,
  name: "Monad Testnet",
  rpc: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadscan.com",
  log: "0xe9950e8377787d6d6c4c6bda9e4188925a18da6a",
  verifier: "0x0d789ee35382e1ea06ed0d82f55dcbf4c6130356",
  registry: "0xf99bdc3512b074d7b6d21cb609ff05e54f465d24",
  market: "0x735057412d1ef884a28bc409731a6f91679265f3",
};

/* Selectors are taken from `cast sig`, not eyeballed — a wrong one returns
   empty data that decodes to zero, which looks like an empty log. */
const SEL = {
  anchorCount: "0x34f96c8c",  // anchorCount()
  anchorAt: "0x16994960",     // anchorAt(uint256)
  receiptCount: "0x7f038f3c", // receiptCount()
  corpusCount: "0x60d0f933",  // corpusCount()
  corpusAt: "0x2a1b631d",     // corpusAt(uint256)
  taskCount: "0xb6cb58a5",    // taskCount()
  taskAt: "0x4dc6deba",       // taskAt(uint256)
  capTable: "0x5bcdd86e",     // capTable(uint256)
  receiptAt: "0x8f18191b",    // receiptAt(uint256)
  episodeFacts: "0x7a05da04", // episodeFacts(bytes)
};

/* --- minimal ABI decoding ------------------------------------------------
   The site ships no web3 bundle, so returned data is decoded by hand. Every
   reader below reads its own head offsets rather than assuming a layout: a
   struct with a dynamic member is returned behind a pointer, and guessing that
   wrong silently yields plausible-looking rubbish. */
const W = 64;                                    // one abi word, in hex chars
const at = (hex, i) => "0x" + hex.slice(2 + i * W, 2 + (i + 1) * W);
const uint = (hex, i) => BigInt(at(hex, i));
const addr = (hex, i) => "0x" + hex.slice(2 + i * W + 24, 2 + (i + 1) * W);
const bool = (hex, i) => uint(hex, i) === 1n;

/** A dynamic array of words that starts at word `ptr` (in words from `base`). */
function words(hex, ptrWord, base = 0) {
  const off = Number(uint(hex, ptrWord)) / 32 + base;
  const len = Number(uint(hex, off));
  return Array.from({ length: len }, (_, k) => at(hex, off + 1 + k));
}

function str(hex, ptrWord, base = 0) {
  const off = Number(uint(hex, ptrWord)) / 32 + base;
  const len = Number(uint(hex, off));
  const raw = hex.slice(2 + (off + 1) * W, 2 + (off + 1) * W + len * 2);
  return decodeURIComponent(raw.replace(/(..)/g, "%$1"));
}

async function rpc(method, params) {
  const r = await fetch(MONAD.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const word = (hex, i) => "0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64);
const num = (hex, i) => BigInt(word(hex, i));
const pad = (n) => n.toString(16).padStart(64, "0");

/** Read the anchors the chain actually holds, newest last. */
export async function readAnchors(limit = 12) {
  const countHex = await call(MONAD.log, SEL.anchorCount);
  const count = Number(BigInt(countHex));
  const first = Math.max(0, count - limit);
  const out = [];
  for (let i = first; i < count; i++) {
    const raw = await call(MONAD.log, SEL.anchorAt + pad(i));
    out.push({
      index: i,
      root: word(raw, 0),
      prevRoot: word(raw, 1),
      revocationRoot: word(raw, 2),
      size: Number(num(raw, 3)),
      at: Number(num(raw, 4)),
      blockNumber: Number(num(raw, 5)),
    });
  }
  return { count, anchors: out };
}

const BLUE = "#4D17F5", PINK = "#FA9DCD", MUTE = "#6E6E6E";
const FG = "#FFFFFF", DIM = "#9B9B9B", LINE = "#272727";
const BW = 132, GAP = 14;

function round(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Every sealed corpus the market holds, with its cap table.
 *  `corpusAt` returns a flat tuple and keeps the arrays behind `capTable`, so
 *  the cap table is a second read rather than a pointer into the first. */
export async function readCorpora() {
  const n = Number(BigInt(await call(MONAD.market, SEL.corpusCount)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const raw = await call(MONAD.market, SEL.corpusAt + pad(i));
    const cap = await call(MONAD.market, SEL.capTable + pad(i));
    out.push({
      index: i,
      taskId: uint(raw, 0),
      corpusRoot: at(raw, 1),
      corpusSize: Number(uint(raw, 2)),
      price: uint(raw, 3),
      token: addr(raw, 4),
      open: bool(raw, 5),
      contributorCount: Number(uint(raw, 6)),
      contributors: words(cap, 0).map((w) => "0x" + w.slice(26)),
      weights: words(cap, 1).map((w) => BigInt(w)),
      weightTotal: uint(cap, 2),
    });
  }
  return out;
}

/** Every published task in the registry. */
export async function readTasks() {
  const n = Number(BigInt(await call(MONAD.registry, SEL.taskCount)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const raw = await call(MONAD.registry, SEL.taskAt + pad(i));
    const base = Number(uint(raw, 0)) / 32;
    out.push({
      index: i,
      specHash: at(raw, base + 0),
      curator: addr(raw, base + 1),
      uri: str(raw, base + 2, base),
      curatorBps: Number(uint(raw, base + 3)),
      targetEpisodes: Number(uint(raw, base + 4)),
      publishedAt: Number(uint(raw, base + 5)),
      open: bool(raw, base + 6),
    });
  }
  return out;
}

/** How many licences have been sold, across all corpora. */
export async function readReceiptCount() {
  return Number(BigInt(await call(MONAD.market, SEL.receiptCount)));
}

export function mountChain(cv) {
  const ctx = cv.getContext("2d");
  let state = { status: "loading", anchors: [], count: 0, clips: 0 };

  function paint() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth | 0, h = cv.clientHeight | 0;
    if (!w || !h) return;
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr; cv.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.font = "700 10px Manrope, system-ui, sans-serif";
    ctx.fillStyle = MUTE;
    ctx.fillText("ANCHORED BATCHES, MONAD TESTNET", 2, 16);

    if (state.status !== "ready") {
      ctx.font = "600 12px Manrope, system-ui, sans-serif";
      ctx.fillStyle = state.status === "error" ? PINK : DIM;
      ctx.fillText(
        state.status === "error"
          ? "Could not reach Monad. Nothing is drawn rather than guessed."
          : "Reading the log…",
        2, h / 2,
      );
      return;
    }

    const label = `${state.clips} CLIPS IN ${state.count} ANCHORS`;
    ctx.fillStyle = BLUE;
    ctx.fillText(label, w - ctx.measureText(label).width - 2, 16);

    const top = 52, bh = h - top - 46;
    ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top + bh + 12.5); ctx.lineTo(w, top + bh + 12.5);
    ctx.stroke();

    const shown = state.anchors.slice(-Math.max(1, Math.floor(w / (BW + GAP))));
    shown.forEach((a, k) => {
      const bx = w - 8 - (shown.length - k) * (BW + GAP) + GAP;
      if (bx + BW < -20) return;
      const newest = k === shown.length - 1;

      ctx.fillStyle = newest ? "rgba(77,23,245,0.22)" : "rgba(31,31,31,0.9)";
      ctx.strokeStyle = newest ? BLUE : LINE;
      round(ctx, bx, top, BW, bh, 10);
      ctx.fill(); ctx.stroke();

      ctx.font = "600 11px Manrope, system-ui, sans-serif";
      ctx.fillStyle = newest ? FG : DIM;
      ctx.fillText(a.root.slice(0, 6) + "…" + a.root.slice(-4), bx + 12, top + 22);

      ctx.font = "600 10px Manrope, system-ui, sans-serif";
      ctx.fillStyle = MUTE;
      ctx.fillText(`BLOCK ${a.blockNumber}`, bx + 12, top + 38);
      if (a.revocationRoot !== "0x" + "0".repeat(64)) {
        ctx.fillStyle = PINK;
        ctx.fillText("CARRIES A WITHDRAWAL", bx + 12, top + 52);
      }

      ctx.font = "700 15px Manrope, system-ui, sans-serif";
      ctx.fillStyle = newest ? FG : DIM;
      ctx.fillText(`${a.size} clips`, bx + 12, top + bh - 12);
    });

    ctx.font = "600 10px Manrope, system-ui, sans-serif";
    ctx.fillStyle = MUTE;
    ctx.fillText("READ LIVE FROM THE CONTRACT — NOT A SIMULATION", 2, h - 8);
  }

  async function load() {
    try {
      const { count, anchors } = await readAnchors();
      state = {
        status: count === 0 ? "error" : "ready",
        anchors, count,
        clips: anchors.length ? anchors[anchors.length - 1].size : 0,
      };
    } catch {
      state = { ...state, status: "error" };
    }
    paint();
  }

  addEventListener("resize", paint, { passive: true });
  paint();
  load();
  setInterval(load, 30000);
}
