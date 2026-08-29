/** Every page carries the same navigation.
 *
 * The capture page shipped reachable only from itself: the file existed, the
 * route resolved, and nothing linked it. A page nobody can get to is a page
 * that does not exist, and no other test notices — imports resolve, routes
 * return 200, and the nav is quietly one entry short.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (c, m, x = "") => { if (!c) fails++; console.log(`${c ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const pages = readdirSync(web).filter((f) => f.endsWith(".html"));
/* Legal pages and the 404 carry a deliberately minimal nav: someone reading the
   terms is not mid-journey through the product. */
const MINIMAL = new Set(["privacy.html", "terms.html", "404.html"]);

const navOf = (src) => {
  const a = src.indexOf("<!-- NAV:START -->");
  if (a < 0) return null;
  return src.slice(a, src.indexOf("<!-- NAV:END -->"));
};
const linksOf = (nav) => [...nav.matchAll(/href="\.\/([a-z0-9-]+\.html)"/g)].map((m) => m[1]);

const full = pages.filter((p) => !MINIMAL.has(p));
ok(full.length > 5, "there are pages to compare", `${full.length}`);

const navs = new Map();
for (const p of full) {
  const nav = navOf(readFileSync(join(web, p), "utf8"));
  ok(nav !== null, `${p} has a nav`);
  if (nav) navs.set(p, linksOf(nav));
}

// The union of every nav is what a complete nav should contain; anything short
// of it is a page some visitors cannot reach from where they are.
const union = [...new Set([...navs.values()].flat())].sort();
for (const [p, links] of navs) {
  const missing = union.filter((u) => !links.includes(u));
  ok(missing.length === 0, `${p} links every page the others do`, missing.join(", "));
}

// Every page with a full nav must be in that nav, or it is unreachable.
for (const p of full) {
  ok(union.includes(p), `${p} is reachable from the navigation`);
}

/* And a page that appears in the nav must mark itself there, so a visitor
   knows where they are. The home page is the exception by design: it is
   reached through the brand mark rather than a nav entry, and marking the
   brand as current would announce "Thenar" as the visitor's location. */
for (const p of full) {
  const nav = navOf(readFileSync(join(web, p), "utf8")) ?? "";
  const inTopnav = new RegExp(`<nav[^>]*topnav[\\s\\S]*?href="\\./${p.replace(".", "\\.")}"`).test(nav);
  const marks = [...nav.matchAll(/aria-current="page"/g)].length;
  ok(marks <= 1, `${p} marks no more than one entry as current`, `${marks}`);
  if (inTopnav) ok(marks === 1, `${p} marks itself as the current page`);
  else console.log(`  --   ${p} is not a nav entry — reached through the brand mark`);
}


/* Below 860px the primary nav is display:none. That is fine only if something
 * else opens it: without a control, every page but the home page was reachable
 * on a phone only by scrolling to the footer. */
for (const p of full) {
  const src = readFileSync(join(web, p), "utf8");
  const hasBtn = /<button[^>]*class="navtoggle"/.test(src);
  const controls = (src.match(/aria-controls="([^"]+)"/) || [])[1];
  const navId = (src.match(/<nav class="topnav" id="([^"]+)"/) || [])[1];
  ok(hasBtn, `${p} has a menu control for narrow screens`);
  ok(!!controls && controls === navId,
     `${p} points its menu control at the nav it opens`, `${controls} -> ${navId}`);
  ok(/aria-expanded="false"/.test(src), `${p} starts with the menu closed`);
  ok(src.includes("./nav.js"), `${p} loads the script that opens it`);
}

console.log(fails === 0 ? "\nnavigation: consistent across every page\n" : `\n${fails} check(s) failed\n`);
process.exit(fails ? 1 : 0);
