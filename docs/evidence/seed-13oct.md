# Team-seeded activity, 13 Oct 2026

**Everything on this page was done by the Thenar team, not by outside users.** Three operator wallets we
generated ran `scripts/monad-operator-run.mjs` against app.thenar.io, and our own buyer agent made one x402
purchase. The runs replay recordings made on our local chain for a task with the same scene. The hosted verifier
re-scored each one for its wallet. Two other recordings were refused: one as a duplicate route and one as
physically invalid. Tasks past their deadline or closed by the funder refused runs too. Those refusals are the
product working, and they are why the three runs land on tasks 0 and 12.

Monad testnet (chain 10143). Every link opens in MonadVision.

## Paid runs

| Wallet | Task | Score | Executed / final from send | Paid run | Shares issued | Run page |
|---|---|---|---|---|---|---|
| seed-1 `0x3dB4…70FC` | 0, toothpaste | 84.79 | 631 ms / 1,301 ms | [`0x0dd42b77…1d140c`](https://testnet.monadvision.com/tx/0x0dd42b77c298e045d704ec5054d45cbb52532c1a96b892e4a49149214c1d140c) | [85 THNRC](https://testnet.monadvision.com/tx/0x19f789e95330e14258bef6c084e93c0e337aa9f345820a5b35181ae8589e4d7b) | [run](https://app.thenar.io/run/0x91fdeb4fe274691578384c0b531875814e84c3f3fd18bfdb74c67dfaec892af2) |
| seed-2 `0xbB09…FE43` | 12, lab bounty (Privy-funded) | 76.06 | 590 ms / 1,308 ms | [`0xf24c8169…b62e`](https://testnet.monadvision.com/tx/0xf24c8169085e565388035b89075736882ecb3cde78265c933cba5865d8e4b62e) | [76 THNRC](https://testnet.monadvision.com/tx/0x261644d0d16495dff46e7d7aa74d347a88d594a89cdfdefe83f3730a3b6c10af) | [run](https://app.thenar.io/run/0xaa609bb4fb1b803aeaf626aa9fb07a24796973bacd923728ff14b4797225a6f3) |
| seed-3 `0x0E9E…9853` | 0, toothpaste | 66.06 | 416 ms / 1,111 ms | [`0x9a874d5c…dd134`](https://testnet.monadvision.com/tx/0x9a874d5cbede1b248229971c42157a7699664613b5c9f2e731fc356aaa2dd134) | [66 THNRC](https://testnet.monadvision.com/tx/0x03890a872179672fe69a773c70fda3f34aff6c6cfaf81d33b514e71b9105651f) | [run](https://app.thenar.io/run/0x192258737f51e4ec73b8ea3fb507f510e04e3d4ad9a59573c9d6b366d791c7b0) |

## Setup for each wallet

| Wallet | Funded | Admission (CorpusShares) | Passkey that signed the admission |
|---|---|---|---|
| seed-1 | [0.15 MON](https://testnet.monadvision.com/tx/0xd9241f4a4f9238e0fca16dfb15e659f890b000804d3394266ff99bc234ed6845) | [`0xdb395633…750c70`](https://testnet.monadvision.com/tx/0xdb395633d9093c5b31918a62c51b0ad8fcdd44db23b90256dd4d0c244d750c70) * | [`0x5ff49a09…2e18`](https://testnet.monadvision.com/tx/0x5ff49a09ce0a9db9233dbb1c5a4fef8b8479623c5489e425ded901b6026e2e18) |
| seed-2 | 0.15 MON | [`0xa779d03d…5129f7e`](https://testnet.monadvision.com/tx/0xa779d03df97ca0cd8a369c0f87f452316bae059d895380110cb1c15ab5129f7e) | [`0x767a9694…4668b`](https://testnet.monadvision.com/tx/0x767a969445c4a079c5c82bba5e65d34adba104cec651473b69f9f6824be4668b) |
| seed-3 | [0.15 MON](https://testnet.monadvision.com/tx/0x04dc1faf9b87b06787f7890a7ece004141733ff8350c4a912a7ae1abf23123c5) | [`0xd6f8b08c…3f25e`](https://testnet.monadvision.com/tx/0xd6f8b08c406813e1844ac08851c225a297d18d3aae2d4091a12dae9a0303f25e) | [`0xffb575e0…f1a16`](https://testnet.monadvision.com/tx/0xffb575e05dd6df6fea17d395a0e4f48b2bddff173cb128e57b43855012cf1a16) |

\* For seed-1, the hosted `/api/operator` admit returned 502 twice ("Missing or invalid parameters") just after the
issuer was topped up. The same `addToControlList` call, sent by the issuer key from a team machine, succeeded.
Seed-2 and seed-3 were admitted by the hosted server itself. Every run then asked the server for admission, and it
answered `already: true` from the chain.

Each wallet registers a new P-256 key on every attempt (`register` replaces the old one), so the wallets have
more PasskeyRegistry transactions than runs. The refused attempts are on chain too.

## Agent purchase over x402

| Buyer | Corpus | Settlement | SalesLog |
|---|---|---|---|
| agent `0x9a6C…63aA` | task 12, 1 episode, 140 frames, sha256 `19b0f6e4…b35f` | [`0x4a643bfc…dcf0cf`](https://testnet.monadvision.com/tx/0x4a643bfc3f87e6abb92e494730b127bf60b63c0c51b731996e5ce47bb3dcf0cf) | #2, the same sha256 as the bytes received |

## MON spent

All of it came from the team's operator wallet `0xc0F3…b5D7`, which held 1.5 MON before seeding and 0.622 MON
after. Of the 0.878 MON spent:

- 0.4 MON topped up the corpus issuer ([`0xabdcef64…a49c0`](https://testnet.monadvision.com/tx/0xabdcef64e294d82c58552800a8961db5d2ec866f62b2010a9e55c378807a49c0)), which pays for admissions and share issues.
- The rest is gas in the three seed wallets. They still hold what is left of their funding.
- Three spare wallets were funded by a shell-quoting mistake and never used. Each was swept back:
  [`0xe44fc2cb…`](https://testnet.monadvision.com/tx/0xe44fc2cb6a472a9ee6749023a296dc0cc2b44d7f99ec7402a5b26862ad75905d),
  [`0xde5a4d97…`](https://testnet.monadvision.com/tx/0xde5a4d97d9302be9cb111fb955c8045d09fbc9f1241adc2e28394e4bf11e05cd),
  [`0x6da6159d…`](https://testnet.monadvision.com/tx/0x6da6159d1d113531a3e9a4e238a8b51be8aa8186a1cca88b9067d80b3411ca64).
