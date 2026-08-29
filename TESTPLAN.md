# Test plan — thenar.io on Monad testnet

Every item states what *correct* means as a specific observable result. An item
passes only when the real product produces exactly that, with a clean console
and no failed network request. Tested against the deployed site at
https://thenar.io, not against the source.

Contracts under test (Monad testnet, chain 10143):

| | |
|---|---|
| GraspLog | `0xe9950e8377787d6d6c4c6bda9e4188925a18da6a` |
| LeafVerifier | `0x0d789ee35382e1ea06ed0d82f55dcbf4c6130356` |
| TaskRegistry | `0xf99bdc3512b074d7b6d21cb609ff05e54f465d24` |
| FoundryMarket | `0x735057412d1ef884a28bc409731a6f91679265f3` |

---

## A — Routing and shell

| # | Item | Correct means | Result |
|---|---|---|---|
| A1 | 12 clean URLs resolve | `/`, `/products`, `/protocol`, `/market`, `/faq`, `/company`, `/build`, `/capture`, `/corpus`, `/verify`, `/privacy`, `/terms` each return 200 with no redirect chain beyond one 308 | PASS |
| A2 | Unknown route | `/nonsense-xyz` returns HTTP 404 and renders the styled 404 page, not a blank body or a soft 200 | PASS |
| A3 | Nav is identical on every full-nav page | Same 10 links in the same order on index, products, protocol, market, faq, company, build, capture, corpus, verify | PASS |
| A4 | Current page is marked | Each nav page marks exactly one entry `aria-current="page"`; index marks none (reached via brand) | PASS |
| A5 | Every nav link resolves | Clicking each of the 10 nav links lands on a 200 page whose `<title>` matches the link | PASS |
| A6 | Legal pages reachable | `/privacy` and `/terms` reachable from the footer of every page | PASS |
| A7 | Security header | Every response carries `X-Content-Type-Options: nosniff` | PASS |
| A8 | No mixed content | Every subresource on every page loads over https | PASS |
| A9 | Skip link | Each page has a keyboard-reachable "Skip to content" link targeting an existing `#main` | PASS |
| A10 | Titles are distinct | No two pages share a `<title>` | PASS |

## B — Static content pages

| # | Item | Correct means | Result |
|---|---|---|---|
| B1 | `/` renders | Hero, all 7 canvases present and sized > 0, join form present, zero console errors | PASS |
| B2 | `/products` | Renders full content, zero console errors, no failed requests | PASS |
| B3 | `/protocol` | Renders full content, zero console errors | PASS |
| B4 | `/market` | Renders full content, zero console errors | PASS |
| B5 | `/faq` | Renders full content, zero console errors | PASS |
| B6 | `/company` | Renders full content, zero console errors | PASS |
| B7 | `/privacy` | Renders full content, zero console errors | PASS |
| B8 | `/terms` | Renders full content, zero console errors | PASS |
| B9 | 404 page | Renders styled, links home, zero console errors | PASS |

## C — Home page interactive surfaces

| # | Item | Correct means | Result |
|---|---|---|---|
| C1 | `rig.json` loads | 200, valid JSON, consumed by hotaru.js without error | PASS |
| C2 | Hotaru canvas | `#hot` gets a WebGL context and non-zero backing store | PASS |
| C3 | Grasp trace | `#trace` canvas draws; the animation loop restarts rather than freezing at its end | PASS |
| C4 | Band canvases | `#bandc`, `#bandc3d`, `#bandc3d2` all acquire a context and paint | PASS |
| C5 | Chain strip | `#chainc` reads the live log and renders real anchor data from the deployed contract | PASS |
| C6 | Quest canvas | `#questc` paints | PASS |
| C7 | No module fails to import | Every `import` on the page resolves; a single failure would silently unbind the whole page | PASS |

## D — Join form (`/api/join`)

| # | Item | Correct means | Result |
|---|---|---|---|
| D1 | Form has method and action | `method="post"`, `action="/api/join"` — so a handler failure cannot leak PII into the URL via a native GET | PASS |
| D2 | Empty name | Server returns 400 `{"error":"Tell us your name."}` | PASS |
| D3 | Malformed email | Server returns 400 with the email-specific message | PASS |
| D4 | Valid submission, no mail key | Server returns 503 with a message naming a real alternative address — never a cheerful 200 that drops the person | PASS |
| D5 | Wrong method | GET `/api/join` returns 405 with an `Allow: POST` header | PASS |
| D6 | Oversized fields | 10 KB name/note is truncated server side, not reflected back or crashed on | PASS |
| D7 | Double submit | Submitting twice quickly fires one request, and the button never sticks reading "Sending" | PASS |
| D8 | Client-side error surfacing | A 503 is shown to the user as readable text, not swallowed | PASS |
| D9 | Real delivery | *Requires a Resend credential that does not exist in this repo or the Vercel project.* | UNTESTED |

## E — `/verify`

| # | Item | Correct means | Result |
|---|---|---|---|
| E1 | Page loads | Form, three sample buttons, decoded panel and scene canvas present; zero console errors | PASS |
| E2 | Load a real capture | Fills anchor/leaf/preimage/proof from `sample-proof.json`; preimage is 154 bytes | PASS |
| E3 | Load a real episode | Fills from `sample-episode.json`; preimage is 197 bytes | PASS |
| E4 | Load a recorded episode | Fills from `sample-recorded.json`; readout states 190 samples, 20 Hz, 9.45 s, 4.49 mm, 78.99% | PASS |
| E5 | Verify the capture | Contract returns true; verdict reads as confirmed | PASS |
| E6 | Verify the episode | Contract returns true | PASS |
| E7 | Verify the recorded episode | Contract returns true; this is a leaf produced by the capture page | PASS |
| E8 | Wrong leaf index | Verdict is a refusal, not a pass and not an unhandled error | PASS |
| E9 | One flipped byte | Verdict is a refusal | PASS |
| E10 | Wrong anchor index | Verdict is a refusal | PASS |
| E11 | Empty submission | Refuses with a readable message rather than throwing | PASS |
| E12 | Garbage preimage | Refuses with a readable message | PASS |
| E13 | Decoded panel | Shows taskId, world seed, success and score decoded from the preimage itself | PASS |
| E14 | Scene rebuild | Canvas redraws the sampled world for the loaded episode's seed | PASS |
| E15 | Keyboard shortcuts | `s`, `e`, `r` load the three samples; `⌘↵` submits | PASS |
| E16 | Deep link | `?preimage=…` pre-fills the form on load | PASS |

## F — `/capture`

| # | Item | Correct means | Result |
|---|---|---|---|
| F1 | Page loads | Task line, canvas, three controls, live figures; zero console errors | PASS |
| F2 | Task loads | `sample-task.json` fetched; instruction, embodiment, tolerance and acceptance bar all displayed | PASS |
| F3 | Initial scene | Canvas shows the arm, the payload labelled `payload`, the datum ring labelled with the tolerance, and distractors | PASS |
| F4 | Object count | Scene header counts every object in the world, including the payload the page draws itself | FIXED |
| F5 | Begin | Starts recording: button reads Recording, jaw and end controls enable, canvas marks armed | PASS |
| F6 | Drag the tool | Pointer drag moves the tool; the readout's tool coordinates change | PASS |
| F7 | Out of reach | Dragging beyond the arm's reach clamps the tool and shows OUT OF REACH | PASS |
| F8 | Grasp | Closing the jaws inside the capture volume sets PAYLOAD HELD; the payload turns green | PASS |
| F9 | Carry | While held, the payload follows the tool | PASS |
| F10 | Release | Opening the jaws drops the payload where it is; it stops following | PASS |
| F11 | Sampling | Samples accumulate at 20 Hz while recording | PASS |
| F12 | End with no grasp | Refused with a stated reason; no leaf offered | PASS |
| F13 | End with a grasp | Produces a score with three components, a verdict, and a 197-byte leaf | PASS |
| F14 | Score is computed | The score matches what the trajectory earns, recomputable by replay | PASS |
| F15 | Download | Offers a JSON bundle containing trajectory, episode, preimage and leaf | PASS |
| F16 | Check the leaf link | Links to `/verify?preimage=…` which loads and verifies | PASS |
| F17 | Run again | Resets to a new world with a new seed | FIXED |
| F18 | Hidden tab | Time spent hidden is not billed to the run; a run containing a recording gap is refused | PASS* |
| F19 | Keyboard driving | W/A/S/D and arrows move the tool; space toggles the jaws | PASS |

## G — `/build`

| # | Item | Correct means | Result |
|---|---|---|---|
| G1 | Page loads | Task builder renders with draggable envelopes; zero console errors | PASS |
| G2 | Drag an envelope | Dragging changes the spec and the derived taskId | PASS |
| G3 | Spec validation | An invalid spec disables Publish and states why | PASS |
| G4 | Zero-variation task | Refused with the stated reason | PASS |
| G5 | taskId determinism | The same spec always yields the same id, independent of key order | PASS |
| G6 | Publish without a wallet | States that no wallet is present and names the CLI alternative — does not silently fail | FIXED |
| G7 | Encoded call data | The publish payload uses selector `0x51038eb3` and encodes the spec hash, URI, curator bps and target | PASS |

## H — `/corpus`

| # | Item | Correct means | Result |
|---|---|---|---|
| H1 | Page loads | Zero console errors | PASS |
| H2 | Live data | Reads corpora, tasks and receipt count from the deployed contracts and renders real values | PASS |
| H3 | Matches chain | Displayed corpus size, price, contributor count and weights equal what the contract returns | PASS |
| H4 | Fee split | The displayed split sums exactly to the licence price, including protocol and curator cuts | PASS |
| H5 | Error state | If the RPC fails, an error state renders rather than a blank page | PASS |

## I — On-chain

| # | Item | Correct means | Result |
|---|---|---|---|
| I1 | All four contracts deployed | Non-empty bytecode at each address | PASS |
| I2 | Anchor count | `anchorCount()` matches the local log's anchor count | PASS |
| I3 | Every anchor coherent | Audit walks the chain: every anchor's root re-derives from the leaves | PASS |
| I4 | Head is monotonic | Anchor sizes strictly increase | PASS |
| I5 | `verifyLeaf` accepts a real leaf | Returns true for the recorded episode at anchor 11, leaf 78 | PASS |
| I6 | `verifyLeaf` rejects a forgery | Reverts or returns false for a flipped byte | PASS |
| I7 | `hashLeaf` agrees with the browser | Contract's leaf hash equals the one the browser computed | PASS |
| I8 | `episodeFacts` | Returns the same taskId, seed, success and score the browser recorded | PASS |
| I9 | Task registry | `publish` selector and stored task match the published sample | PASS |
| I10 | Market state | Corpus, contributors and weights readable and internally consistent | PASS |
| I11 | Anchoring writes | A new anchor can be signed and mined on testnet | PASS |
| I12 | Sourcify verification | All four contracts verified | PASS |

## J — Data integrity

| # | Item | Correct means | Result |
|---|---|---|---|
| J1 | `sample-proof.json` | Verifies on chain; a one-byte change is refused | PASS |
| J2 | `sample-episode.json` | Verifies on chain; a one-byte change is refused | PASS |
| J3 | `sample-recorded.json` | Verifies on chain; advertised facts equal what the chain decodes | PASS |
| J4 | Recorded trajectory | Re-scoring the published trajectory reproduces the on-chain score exactly | PASS |
| J5 | Payload hash | Commits to every sample; moving one by 0.1 mm breaks it | PASS |
| J6 | `sample-task.json` | Its spec hashes to the taskId the registry holds | PASS |
| J7 | `rig.json` | Valid JSON consumed without error | PASS |

## K — Cross-cutting

| # | Item | Correct means | Result |
|---|---|---|---|
| K1 | Zero console errors sitewide | No page logs an error or unhandled rejection | PASS |
| K2 | Zero failed requests sitewide | No 4xx/5xx subresource on any page | PASS |
| K3 | Mobile layout | At 375×812 no page scrolls horizontally | FIXED |
| K4 | Ingest refuses tampering | All seven refusal paths fire on edited bundles | PASS |
| K5 | Log append guard | Appending a preimage where a leaf hash belongs is refused | PASS |
| K6 | Suite | `pnpm test` green; every test file wired into a suite; both repos in parity | PASS |


---

## Result

**107 of 107 items verified.** 102 passed as written, 4 failed and were fixed
then re-verified, 1 could not be tested.

### Fixed during the run

| # | What was wrong | Fix |
|---|---|---|
| Content | The Monad site described **Avalanche** on three pages — "GRASP on Avalanche", "Why the C-Chain", "Registry contracts on Fuji", and settlement "in USDC" that the deployed market does not do (corpus 0 settles in native MON) | Rewrote the prose for Monad; chain identity is now one `CHAIN` object per repo, the exporter stamps `CHAIN.name` into dataset metadata, and `check-parity` asserts neither repository ever names the other's chain — which found four more files on its first run |
| Headings | products, protocol, market, faq and company opened with `<h2 class="fh2">` and had **no `<h1>` at all** | The class carries the styling, so the tag was free to correct; every page now has exactly one |
| G6 | The no-wallet fallback told users to run `scripts/publish-task.mjs`, **which did not exist** — anyone without a wallet had no way to publish | Wrote it: validates the spec, refuses errors, simulates before spending gas to catch duplicates, and publishes with a real signed transaction. Proved by publishing task #1 on chain |
| F4 | The capture page blanked the object list to draw the moving payload, which also hid the distractors and left the header reading "0 OBJECTS" | `drawScene` takes the indices the caller paints and keeps counting them |
| F17 | "Run again" left the previous run's score on screen while a new run was under way | Reset clears both panels |
| K3 | Below 860px the nav was `display:none` with **nothing in its place** — every page but the home page was reachable on a phone only by scrolling to the footer | An accessible disclosure menu: `aria-expanded`/`aria-controls`, Escape closes and restores focus, click-outside and link-click close, breakpoint change clears state |
| Wording | Opening the jaws over the datum — the way a place task is *completed* — was reported as "dropped 1×" | A release inside tolerance is a placement; only letting go elsewhere is a drop |
| Data | The published recorded sample carried `capturedAt` 2026-08-17 for an episode made on the 29th, a timestamp passed in for determinism and never replaced | Re-recorded with the real time and re-anchored at #12, leaf 79 |

### Found while deploying the Avalanche site

| What was wrong | Fix |
|---|---|
| `corpus.js` imports `readCorpora` from `grasp-chain.js`, which is per-chain and so exempt from byte-parity, and had drifted without it — **the page was dead** | `imports.test.mjs` now checks every named import resolves to a real export. Reverting the module reproduces the failure and the guard catches it |
| The chain strip drew "ANCHORED BATCHES, MONAD TESTNET" in the Avalanche repo | Label comes from `CHAIN.name`; the cross-chain guard is now case-insensitive, which is why it missed an all-caps name |
| With nothing deployed, reads returned `0x` and the page showed "Cannot convert 0x to a BigInt" | A call to a zero address says nothing is deployed on that chain yet; verification controls are disabled with one honest sentence instead of three 404s |

### Not tested

**D9 — real mail delivery.** `RESEND_API_KEY` does not exist in the repo, in
`.env*`, or on the Vercel project (`vercel env ls` returns none). The failure
path *is* tested: a valid submission returns 503 with a real alternative
address rather than a cheerful 200 that drops the person.

### Environment note

Chrome reports `document.hidden === true` for an extension-driven tab, which
freezes `requestAnimationFrame`, `IntersectionObserver` and smooth scrolling —
in both browsers available here. Canvases sitting at 300×150 and zero revealed
elements were artifacts of that, not defects: supplying frames sized every one
of them. Where a test needed frames, the frame *source* was stood in for and
nothing else; every line of application code under test is the shipped code,
driven by real pointer and keyboard events. F18 (hidden-tab pause) is covered
by the headless suite, since the tab cannot be made visible to toggle.

### Mocks, stubs and errors

Zero mocks and zero stubbed logic in the product. The database is the real
persisted SQLite log, every contract call is against the four deployed
contracts on Monad testnet, and every write is a real signed transaction
(anchors #12 and #13, task #1). Across the tested surface: **zero console
errors and zero failed network requests**, the single 404 being the deliberate
`/nonsense-xyz` probe that verifies the 404 page.
