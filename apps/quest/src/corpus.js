// The corpus of a scanned task: every episode with its leaf and anchor, a
// proof check against Monad's LeafVerifier from this page, and the market:
// seal the corpus in FoundryMarket, buy a licence, see who it paid.
import { createPublicClient, http, parseAbi } from "viem";
import "./scan.css";
import "./corpus.css";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (h) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "—");
const EXPLORER = "https://testnet.monadscan.com";
const tx = (h, text) => (h ? `<a href="${EXPLORER}/tx/${h}" target="_blank" rel="noreferrer">${text ?? short(h)}</a>` : "—");
const addr = (a) => (a ? `<a href="${EXPLORER}/address/${a}" target="_blank" rel="noreferrer">${short(a)}</a>` : "—");
const chain = createPublicClient({
  chain: { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } },
  transport: http(),
});
const VERIFY = parseAbi(["function verifyLeaf(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)"]);

async function api(path, init) {
  let res;
  try {
    res = await fetch(`api/${path}`, init && { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(init) });
  } catch {
    throw new Error("The station is not answering. Start it on the Mac with `pnpm relay`.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `The station answered ${res.status}.`);
  return body;
}

let current = new URLSearchParams(location.search).get("task");

async function load() {
  try {
    const [st, t] = await Promise.all([api("station"), api("tasks")]);
    $("#station").textContent = `Monad testnet · block ${st.block.toLocaleString()} · curator ${short(st.curator)} holds ${Number(st.curatorBalance).toFixed(4)} MON · log ${st.logSize} leaves, ${st.anchors} anchors`;
    $("#tasks").innerHTML = t.tasks.length
      ? t.tasks.map((x) => `<button class="task ${x.specHash === current ? "on" : ""}" data-task="${x.specHash}"><b>${esc(x.instruction)}</b><small>Task #${x.registryId} · ${x.accepted}/${x.episodes} accepted · ${x.rewardMon} MON bounty</small></button>`).join("")
      : `<p class="note">No tasks yet. <a href="scan.html">Scan one.</a></p>`;
    document.querySelectorAll("[data-task]").forEach((b) => (b.onclick = () => select(b.dataset.task)));
    if (current && t.tasks.some((x) => x.specHash === current)) await select(current);
  } catch (e) {
    $("#station").textContent = e.message;
    $("#station").className = "note bad";
  }
}

async function select(h) {
  current = h;
  history.replaceState(null, "", `?task=${h}`);
  document.querySelectorAll("[data-task]").forEach((b) => b.classList.toggle("on", b.dataset.task === h));
  const d = await api(`tasks/${h}`);
  $("#detail").hidden = false;
  $("#instruction").textContent = d.task.instruction;
  $("#task-meta").innerHTML = `TaskRegistry #${d.task.registryId} · spec <code>${short(d.task.specHash)}</code> · ${tx(d.task.txHash, "published")} · curator ${addr(d.task.onChain?.curator)} takes ${(d.task.onChain?.curatorBps ?? 0) / 100}% of each licence · ${d.task.onChain?.open ? "open" : "closed"}`;
  $("#episodes").innerHTML = d.episodes.length
    ? d.episodes
        .map(
          (e) => `<tr class="${e.accepted ? "" : "rejected"}"><td><a href="api/episodes/${e.leafIndex}" target="_blank" rel="noreferrer" title="The recording, as JSON">${e.leafIndex}</a></td><td>${addr(e.contributor)}</td><td>${esc(e.input)}</td>
            <td>${(e.qualityBps / 100).toFixed(1)}% ${e.accepted ? "✓" : "✗"}</td><td>${e.anchorIndex != null ? tx(e.anchorTx, `#${e.anchorIndex}`) : "pending"}</td>
            <td>${e.payoutTx ? tx(e.payoutTx, "paid") : esc(e.payoutError ?? "—")}</td>
            <td><button data-verify="${e.leafIndex}">Verify</button></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="7" class="note">No episodes yet. Record one in the arm view and submit it.</td></tr>`;
  document.querySelectorAll("[data-verify]").forEach((b) => (b.onclick = () => verify(b)));
  $("#export").href = `api/tasks/${h}/export`;
  $("#export").hidden = !d.episodes.some((e) => e.accepted);
  const human = new Set(["desktop", "quest-controller", "quest-hand", "leader-arm"]);
  const sealable = d.episodes.filter((e) => e.accepted && e.contributor && e.anchorIndex != null && human.has(e.input));
  // A new seal only makes sense once there is a person's episode the last corpus does not cover.
  const covered = d.corpora.length ? Math.max(...d.corpora.map((c) => c.anchorIndex)) : -1;
  const fresh = sealable.filter((e) => e.anchorIndex > covered);
  $("#seal").disabled = !fresh.length;
  $("#seal-state").textContent = !sealable.length ? "Nothing to seal yet: it needs accepted episodes by people, with payout addresses." : !fresh.length ? `Corpus #${d.corpora[0].corpusId} already covers every accepted episode by a person.` : `${fresh.length} accepted episode${fresh.length > 1 ? "s" : ""} by people not yet in a corpus.`;
  $("#seal-state").className = "note";
  renderCorpora(d.corpora);
}

async function verify(btn) {
  btn.disabled = true;
  btn.textContent = "Checking…";
  try {
    const p = await api(`episodes/${btn.dataset.verify}/proof`);
    const ok = await chain.readContract({ address: p.verifier, abi: VERIFY, functionName: "verifyLeaf", args: [BigInt(p.anchorIndex), p.preimage, p.proof, BigInt(p.leafIndex)] });
    btn.textContent = ok ? `✓ in anchor #${p.anchorIndex}` : "✗ rejected";
    btn.className = ok ? "ok" : "no";
  } catch (e) {
    btn.textContent = "Failed";
    btn.title = e.shortMessage ?? e.message;
    btn.disabled = false;
  }
}

function renderCorpora(list) {
  $("#corpora").innerHTML = list
    .map(
      (c) => `<div class="card">
        <p class="card-head"><b>Corpus #${c.corpusId}</b> · ${c.onChain.price} MON · anchor #${c.anchorIndex} (${c.onChain.size} leaves) · ${tx(c.txHash, "sealed")} · ${c.onChain.open ? "open" : "closed"}</p>
        <table><thead><tr><th>Contributor</th><th>Weight</th><th>Share</th></tr></thead><tbody>
        ${c.onChain.contributors.map((x) => `<tr><td>${addr(x.address)}</td><td>${x.weight}</td><td>${((Number(x.weight) / Number(c.onChain.weightTotal)) * 100).toFixed(1)}%</td></tr>`).join("")}
        </tbody></table>
        <button data-license="${c.corpusId}" class="primary" ${c.onChain.open ? "" : "disabled"}>Buy a licence for ${c.onChain.price} MON</button>
        ${c.licences
          .map(
            (l) => `<div class="licence">Licence #${l.receiptId} · ${tx(l.txHash, "bought")} by ${addr(l.buyer)}${l.funded ? ` (topped up ${l.funded.amount} MON first)` : ""}<br>
            curator ${l.toCurator} MON · contributors ${l.toContributors} MON · protocol ${l.toProtocol} MON<br>
            ${l.paid.map((p) => `paid ${addr(p.address)} ${p.amount} MON`).join(" · ")}${l.credited.length ? ` · credited ${l.credited.map((p) => addr(p.address)).join(", ")}` : ""}</div>`,
          )
          .join("")}
      </div>`,
    )
    .join("");
  document.querySelectorAll("[data-license]").forEach((b) => (b.onclick = () => buy(b)));
}

$("#seal").onclick = async () => {
  const price = Number($("#price").value);
  if (!(price > 0 && price <= 0.05)) {
    $("#seal-state").textContent = "The licence price must be above 0 and at most 0.05 MON.";
    $("#seal-state").className = "note bad";
    return;
  }
  $("#seal").disabled = true;
  $("#seal-state").textContent = "Sealing on Monad…";
  $("#seal-state").className = "note";
  try {
    const s = await api(`tasks/${current}/corpus`, { price: $("#price").value });
    $("#seal-state").innerHTML = `Sealed corpus #${s.corpusId} at anchor #${s.anchorIndex}: ${tx(s.txHash)}`;
    await select(current);
  } catch (e) {
    $("#seal-state").textContent = e.message;
    $("#seal-state").className = "note bad";
    $("#seal").disabled = false;
  }
};

async function buy(b) {
  b.disabled = true;
  b.textContent = "Buying on Monad…";
  try {
    await api(`corpus/${b.dataset.license}/license`, {});
    await select(current);
  } catch (e) {
    b.textContent = e.message;
    b.disabled = false;
  }
}

load();
