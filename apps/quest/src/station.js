// The Quest app's side of the station: pick a scanned task, send episodes to
// be scored, logged and anchored, get the bounty, teach the arm, and check
// every claim against Monad directly rather than taking the station's word.
import { createPublicClient, http, parseAbi, isAddress, getAddress } from "viem";

const MONAD = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
};
const VERIFIER_ABI = parseAbi(["function verifyLeaf(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)"]);
const chain = createPublicClient({ chain: MONAD, transport: http() });
const EXPLORER = "https://testnet.monadscan.com";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : "");

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

async function api(path, init) {
  let res;
  try {
    res = await fetch(`api/${path}`, init && { ...init, headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) });
  } catch {
    throw new Error("The station is not answering. Start it on the Mac with `pnpm relay`.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `The station answered ${res.status}.`);
  return body;
}

export class Station {
  constructor({ onTask, onLine, toast }) {
    this.onTask = onTask;
    this.onLine = onLine;
    this.toast = toast;
    this.tasks = [];
    this.current = null;
    this.skill = null;
    this.online = false;
    this.busy = false;
    this.payout = store.get("thenar.payout") ?? "";
    $("#payout").value = this.payout;
    $("#payout").onchange = (e) => this.setPayout(e.target.value);
    $("#refresh-tasks").onclick = () => this.refresh();
    this.renderPayout();
  }

  setPayout(v) {
    const s = v.trim();
    if (s && !isAddress(s, { strict: false })) {
      $("#payout-note").textContent = "That is not a Monad address (0x followed by 40 hex characters).";
      $("#payout-note").className = "note bad";
      return;
    }
    this.payout = s ? getAddress(s) : "";
    $("#payout").value = this.payout;
    store.set("thenar.payout", this.payout);
    this.renderPayout();
  }
  renderPayout() {
    const n = $("#payout-note");
    n.className = "note";
    n.textContent = this.payout ? "Accepted episodes pay this address in MON." : "Add your Monad address to be paid for accepted episodes.";
  }

  async refresh() {
    try {
      const [st, t] = await Promise.all([api("station"), api("tasks")]);
      this.online = true;
      this.status = st;
      this.tasks = t.tasks;
      $("#station-state").textContent = `Monad block ${st.block.toLocaleString()} · ${st.tasks} tasks on chain · log ${st.logSize} episodes, ${st.anchors} anchors · curator ${Number(st.curatorBalance).toFixed(3)} MON`;
    } catch (e) {
      this.online = false;
      this.tasks = [];
      $("#station-state").textContent = e.message;
    }
    this.renderTasks();
    const want = this.current?.specHash ?? new URLSearchParams(location.search).get("task");
    if (want && this.tasks.some((t) => t.specHash === want) && this.current?.specHash !== want) this.select(want);
  }

  renderTasks() {
    const el = $("#tasks");
    if (!this.online) return (el.innerHTML = "");
    if (!this.tasks.length) {
      el.innerHTML = `<p class="note">No scanned tasks yet. <a href="scan.html">Scan the table</a> to make one.</p>`;
      return;
    }
    el.innerHTML = this.tasks
      .map(
        (t) => `<button class="task ${this.current?.specHash === t.specHash ? "on" : ""}" data-task="${t.specHash}">
          <b>${esc(t.instruction)}</b>
          <small>Task #${t.registryId} · ${t.rewardMon} MON per accepted episode · ${t.accepted}/${t.episodes} accepted${t.onChain?.open === false ? " · closed" : ""}</small>
        </button>`,
      )
      .join("");
    el.querySelectorAll("[data-task]").forEach((b) => (b.onclick = () => this.select(b.dataset.task)));
  }

  async select(specHash) {
    const t = this.tasks.find((x) => x.specHash === specHash);
    if (!t) return;
    this.current = t;
    this.skill = null;
    this.renderTasks();
    this.onTask(t);
    $("#task-actions").hidden = false;
    $("#task-links").innerHTML = `<a href="${t.explorer}" target="_blank" rel="noreferrer">Published on Monad</a> · <a href="corpus.html?task=${t.specHash}">Corpus &amp; payouts</a>`;
    try {
      const s = await api(`tasks/${specHash}/skills/latest`);
      this.skill = s.skill;
      $("#skill-state").textContent = s.skill ? `Taught from episode ${s.fromLeafIndex}. Repeat runs it on this scene.` : "Nothing taught yet: do the task yourself once, get it accepted, then Teach.";
    } catch (e) {
      $("#skill-state").textContent = e.message;
    }
    $("#repeat").disabled = !this.skill;
  }

  /** Score, log, anchor and (when accepted) pay for an episode. */
  async submit(ep) {
    if (!this.current) throw new Error("Choose a scanned task first.");
    if (this.busy) throw new Error("Still sending the last episode.");
    this.busy = true;
    this.line("Sending to the station: scoring, logging, anchoring on Monad…");
    try {
      const r = await api("episodes", { method: "POST", body: { specHash: this.current.specHash, contributor: this.payout || null, episode: ep } });
      this.renderResult(r);
      const pct = (r.score.totalBps / 100).toFixed(1);
      this.line(r.accepted ? `Accepted · ${pct}% · leaf ${r.leafIndex}${r.payout?.txHash ? ` · paid ${r.payout.amountMon} MON` : ""}` : `Not accepted · ${r.reason}`);
      this.verify(r.leafIndex).catch(() => {});
      this.current.episodes++;
      if (r.accepted) this.current.accepted++;
      this.renderTasks();
      return r;
    } catch (e) {
      this.line(e.message);
      $("#result").innerHTML = `<p class="note bad">${esc(e.message)}</p>`;
      throw e;
    } finally {
      this.busy = false;
    }
  }

  renderResult(r) {
    const link = (href, text) => `<a href="${href}" target="_blank" rel="noreferrer">${text}</a>`;
    $("#result").innerHTML = `
      <div class="result ${r.accepted ? "good" : "bad"}">
        <b>${r.accepted ? "Accepted" : "Not accepted"} · ${(r.score.totalBps / 100).toFixed(1)}%</b>
        <small>placement ${(r.score.placement * 100).toFixed(0)}% · smoothness ${(r.score.smoothness * 100).toFixed(0)}% · pace ${(r.score.efficiency * 100).toFixed(0)}% · ${Math.round(r.score.deviationMm)} mm off</small>
        ${r.reason ? `<small>${esc(r.reason)}</small>` : ""}
        <small>Leaf ${r.leafIndex} · ${r.anchor ? link(r.anchor.explorer, `anchored #${r.anchor.index}`) : esc(r.anchorError ?? "not anchored")}</small>
        <small>${r.payout?.txHash ? link(r.payout.explorer, `Paid ${r.payout.amountMon} MON to ${short(r.payout.to)}`) : esc(r.payout?.error ?? r.bounty ?? "")}</small>
        <small id="verified">Checking the proof on Monad…</small>
      </div>`;
  }

  /** Ask LeafVerifier on Monad, not the station, whether the leaf is in the anchored log. */
  async verify(leafIndex) {
    const el = () => $("#verified");
    try {
      const p = await api(`episodes/${leafIndex}/proof`);
      const ok = await chain.readContract({ address: p.verifier, abi: VERIFIER_ABI, functionName: "verifyLeaf", args: [BigInt(p.anchorIndex), p.preimage, p.proof, BigInt(p.leafIndex)] });
      if (el()) el().innerHTML = ok ? `✓ LeafVerifier on Monad confirms leaf ${p.leafIndex} is in anchor #${p.anchorIndex}` : "✗ Monad's LeafVerifier rejected the proof";
      return ok;
    } catch (e) {
      if (el()) el().textContent = `Not verified: ${e.shortMessage ?? e.message}`;
      return false;
    }
  }

  async teach() {
    if (!this.current) throw new Error("Choose a scanned task first.");
    const s = await api(`tasks/${this.current.specHash}/skills`, { method: "POST", body: {} });
    this.skill = s.skill;
    $("#skill-state").textContent = `Taught from episode ${s.fromLeafIndex} (${(s.qualityBps / 100).toFixed(1)}%). Repeat runs it on this scene.`;
    $("#repeat").disabled = false;
    return s;
  }

  line(text) {
    this.onLine?.(text);
    $("#station-line").textContent = text;
  }
}

export { EXPLORER };
