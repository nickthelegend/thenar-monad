import { readCorpora, readTasks, readReceiptCount, MONAD } from "../apps/web/grasp-chain.js";
console.log("chain:", MONAD.chainId, "log", MONAD.log.slice(0,10)+"…");
const t = await readTasks();
console.log(`tasks: ${t.length}`);
for (const x of t) console.log(`  #${x.index} curator ${x.curator.slice(0,10)}… ${x.curatorBps/100}% target ${x.targetEpisodes} open=${x.open} uri="${x.uri}"`);
const c = await readCorpora();
console.log(`corpora: ${c.length}`);
for (const x of c) console.log(`  #${x.index} task ${x.taskId} size ${x.corpusSize} price ${x.price} contributors ${x.contributors.length} weightTotal ${x.weightTotal} open=${x.open}`);
console.log("receipts:", await readReceiptCount());
