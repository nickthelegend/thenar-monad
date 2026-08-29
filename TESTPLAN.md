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

| # | Item | Correct means |
|---|---|---|
| A1 | 12 clean URLs resolve | `/`, `/products`, `/protocol`, `/market`, `/faq`, `/company`, `/build`, `/capture`, `/corpus`, `/verify`, `/privacy`, `/terms` each return 200 with no redirect chain beyond one 308 |
| A2 | Unknown route | `/nonsense-xyz` returns HTTP 404 and renders the styled 404 page, not a blank body or a soft 200 |
| A3 | Nav is identical on every full-nav page | Same 10 links in the same order on index, products, protocol, market, faq, company, build, capture, corpus, verify |
| A4 | Current page is marked | Each nav page marks exactly one entry `aria-current="page"`; index marks none (reached via brand) |
| A5 | Every nav link resolves | Clicking each of the 10 nav links lands on a 200 page whose `<title>` matches the link |
| A6 | Legal pages reachable | `/privacy` and `/terms` reachable from the footer of every page |
| A7 | Security header | Every response carries `X-Content-Type-Options: nosniff` |
| A8 | No mixed content | Every subresource on every page loads over https |
| A9 | Skip link | Each page has a keyboard-reachable "Skip to content" link targeting an existing `#main` |
| A10 | Titles are distinct | No two pages share a `<title>` |

## B — Static content pages

| # | Item | Correct means |
|---|---|---|
| B1 | `/` renders | Hero, all 7 canvases present and sized > 0, join form present, zero console errors |
| B2 | `/products` | Renders full content, zero console errors, no failed requests |
| B3 | `/protocol` | Renders full content, zero console errors |
| B4 | `/market` | Renders full content, zero console errors |
| B5 | `/faq` | Renders full content, zero console errors |
| B6 | `/company` | Renders full content, zero console errors |
| B7 | `/privacy` | Renders full content, zero console errors |
| B8 | `/terms` | Renders full content, zero console errors |
| B9 | 404 page | Renders styled, links home, zero console errors |

## C — Home page interactive surfaces

| # | Item | Correct means |
|---|---|---|
| C1 | `rig.json` loads | 200, valid JSON, consumed by hotaru.js without error |
| C2 | Hotaru canvas | `#hot` gets a WebGL context and non-zero backing store |
| C3 | Grasp trace | `#trace` canvas draws; the animation loop restarts rather than freezing at its end |
| C4 | Band canvases | `#bandc`, `#bandc3d`, `#bandc3d2` all acquire a context and paint |
| C5 | Chain strip | `#chainc` reads the live log and renders real anchor data from the deployed contract |
| C6 | Quest canvas | `#questc` paints |
| C7 | No module fails to import | Every `import` on the page resolves; a single failure would silently unbind the whole page |

## D — Join form (`/api/join`)

| # | Item | Correct means |
|---|---|---|
| D1 | Form has method and action | `method="post"`, `action="/api/join"` — so a handler failure cannot leak PII into the URL via a native GET |
| D2 | Empty name | Server returns 400 `{"error":"Tell us your name."}` |
| D3 | Malformed email | Server returns 400 with the email-specific message |
| D4 | Valid submission, no mail key | Server returns 503 with a message naming a real alternative address — never a cheerful 200 that drops the person |
| D5 | Wrong method | GET `/api/join` returns 405 with an `Allow: POST` header |
| D6 | Oversized fields | 10 KB name/note is truncated server side, not reflected back or crashed on |
| D7 | Double submit | Submitting twice quickly fires one request, and the button never sticks reading "Sending" |
| D8 | Client-side error surfacing | A 503 is shown to the user as readable text, not swallowed |
| D9 | Real delivery | *Requires a Resend credential that does not exist in this repo or the Vercel project.* |

## E — `/verify`

| # | Item | Correct means |
|---|---|---|
| E1 | Page loads | Form, three sample buttons, decoded panel and scene canvas present; zero console errors |
| E2 | Load a real capture | Fills anchor/leaf/preimage/proof from `sample-proof.json`; preimage is 154 bytes |
| E3 | Load a real episode | Fills from `sample-episode.json`; preimage is 197 bytes |
| E4 | Load a recorded episode | Fills from `sample-recorded.json`; readout states 190 samples, 20 Hz, 9.45 s, 4.49 mm, 78.99% |
| E5 | Verify the capture | Contract returns true; verdict reads as confirmed |
| E6 | Verify the episode | Contract returns true |
| E7 | Verify the recorded episode | Contract returns true; this is a leaf produced by the capture page |
| E8 | Wrong leaf index | Verdict is a refusal, not a pass and not an unhandled error |
| E9 | One flipped byte | Verdict is a refusal |
| E10 | Wrong anchor index | Verdict is a refusal |
| E11 | Empty submission | Refuses with a readable message rather than throwing |
| E12 | Garbage preimage | Refuses with a readable message |
| E13 | Decoded panel | Shows taskId, world seed, success and score decoded from the preimage itself |
| E14 | Scene rebuild | Canvas redraws the sampled world for the loaded episode's seed |
| E15 | Keyboard shortcuts | `s`, `e`, `r` load the three samples; `⌘↵` submits |
| E16 | Deep link | `?preimage=…` pre-fills the form on load |

## F — `/capture`

| # | Item | Correct means |
|---|---|---|
| F1 | Page loads | Task line, canvas, three controls, live figures; zero console errors |
| F2 | Task loads | `sample-task.json` fetched; instruction, embodiment, tolerance and acceptance bar all displayed |
| F3 | Initial scene | Canvas shows the arm, the payload labelled `payload`, the datum ring labelled with the tolerance, and distractors |
| F4 | Object count | Scene header counts every object in the world, including the payload the page draws itself |
| F5 | Begin | Starts recording: button reads Recording, jaw and end controls enable, canvas marks armed |
| F6 | Drag the tool | Pointer drag moves the tool; the readout's tool coordinates change |
| F7 | Out of reach | Dragging beyond the arm's reach clamps the tool and shows OUT OF REACH |
| F8 | Grasp | Closing the jaws inside the capture volume sets PAYLOAD HELD; the payload turns green |
| F9 | Carry | While held, the payload follows the tool |
| F10 | Release | Opening the jaws drops the payload where it is; it stops following |
| F11 | Sampling | Samples accumulate at 20 Hz while recording |
| F12 | End with no grasp | Refused with a stated reason; no leaf offered |
| F13 | End with a grasp | Produces a score with three components, a verdict, and a 197-byte leaf |
| F14 | Score is computed | The score matches what the trajectory earns, recomputable by replay |
| F15 | Download | Offers a JSON bundle containing trajectory, episode, preimage and leaf |
| F16 | Check the leaf link | Links to `/verify?preimage=…` which loads and verifies |
| F17 | Run again | Resets to a new world with a new seed |
| F18 | Hidden tab | Time spent hidden is not billed to the run; a run containing a recording gap is refused |
| F19 | Keyboard driving | W/A/S/D and arrows move the tool; space toggles the jaws |

## G — `/build`

| # | Item | Correct means |
|---|---|---|
| G1 | Page loads | Task builder renders with draggable envelopes; zero console errors |
| G2 | Drag an envelope | Dragging changes the spec and the derived taskId |
| G3 | Spec validation | An invalid spec disables Publish and states why |
| G4 | Zero-variation task | Refused with the stated reason |
| G5 | taskId determinism | The same spec always yields the same id, independent of key order |
| G6 | Publish without a wallet | States that no wallet is present and names the CLI alternative — does not silently fail |
| G7 | Encoded call data | The publish payload uses selector `0x51038eb3` and encodes the spec hash, URI, curator bps and target |

## H — `/corpus`

| # | Item | Correct means |
|---|---|---|
| H1 | Page loads | Zero console errors |
| H2 | Live data | Reads corpora, tasks and receipt count from the deployed contracts and renders real values |
| H3 | Matches chain | Displayed corpus size, price, contributor count and weights equal what the contract returns |
| H4 | Fee split | The displayed split sums exactly to the licence price, including protocol and curator cuts |
| H5 | Error state | If the RPC fails, an error state renders rather than a blank page |

## I — On-chain

| # | Item | Correct means |
|---|---|---|
| I1 | All four contracts deployed | Non-empty bytecode at each address |
| I2 | Anchor count | `anchorCount()` matches the local log's anchor count |
| I3 | Every anchor coherent | Audit walks the chain: every anchor's root re-derives from the leaves |
| I4 | Head is monotonic | Anchor sizes strictly increase |
| I5 | `verifyLeaf` accepts a real leaf | Returns true for the recorded episode at anchor 11, leaf 78 |
| I6 | `verifyLeaf` rejects a forgery | Reverts or returns false for a flipped byte |
| I7 | `hashLeaf` agrees with the browser | Contract's leaf hash equals the one the browser computed |
| I8 | `episodeFacts` | Returns the same taskId, seed, success and score the browser recorded |
| I9 | Task registry | `publish` selector and stored task match the published sample |
| I10 | Market state | Corpus, contributors and weights readable and internally consistent |
| I11 | Anchoring writes | A new anchor can be signed and mined on testnet |
| I12 | Sourcify verification | All four contracts verified |

## J — Data integrity

| # | Item | Correct means |
|---|---|---|
| J1 | `sample-proof.json` | Verifies on chain; a one-byte change is refused |
| J2 | `sample-episode.json` | Verifies on chain; a one-byte change is refused |
| J3 | `sample-recorded.json` | Verifies on chain; advertised facts equal what the chain decodes |
| J4 | Recorded trajectory | Re-scoring the published trajectory reproduces the on-chain score exactly |
| J5 | Payload hash | Commits to every sample; moving one by 0.1 mm breaks it |
| J6 | `sample-task.json` | Its spec hashes to the taskId the registry holds |
| J7 | `rig.json` | Valid JSON consumed without error |

## K — Cross-cutting

| # | Item | Correct means |
|---|---|---|
| K1 | Zero console errors sitewide | No page logs an error or unhandled rejection |
| K2 | Zero failed requests sitewide | No 4xx/5xx subresource on any page |
| K3 | Mobile layout | At 375×812 no page scrolls horizontally |
| K4 | Ingest refuses tampering | All seven refusal paths fire on edited bundles |
| K5 | Log append guard | Appending a preimage where a leaf hash belongs is refused |
| K6 | Suite | `pnpm test` green; every test file wired into a suite; both repos in parity |
