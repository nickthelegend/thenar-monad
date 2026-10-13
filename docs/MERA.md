# How Thenar uses Mera: one passkey is who you are, and the key your robot obeys

*Thenar · Monad Metropolis, Track 04 · live at https://app.thenar.io*

Thenar is a market for robot demonstrations on Monad:
- **operators** drive a robot arm;
- a verifier scores the run, and **one Monad transaction records it and pays them**;
- **AI agents** buy the corpus.

Mera, Monad's passkey library, gives each operator one passkey that does two jobs.

## The problem Mera solves: a person behind every paid run, and a key for the arm

A market that pays for demonstrations has two trust problems:

1. **Is a person driving?** If a script can farm paid runs, the data is worthless and the escrow drains. Thenar
   needs proof that a human with a device signed in, checked on chain, not just by our server.
2. **Who may command the arm?** An operator's physical SO-101 follows commands sent over the network. It should obey
   a key only that operator holds, without a seed phrase, a file on disk, or a second sign-up.

A passkey (Face ID, a fingerprint, a PIN) solves both if it can be used twice: once as a **P-256 signing key**
Monad can verify, and once as a source of **secret key material** (WebAuthn PRF) to derive the arm's key. Mera
runs both ceremonies.

## How it works

### 1. Identity: a P-256 passkey, verified by Monad's precompile

`lib/passkey.ts` uses Mera to make the passkey and keeps its P-256 public key. The operator registers it in
`PasskeyRegistry` on Monad. To be admitted, they sign a server-issued challenge as a WebAuthn assertion. The registry
verifies it through Monad's P-256 precompile at `0x0100` (EIP-7951): one `staticcall`, instead of hundreds of
thousands of gas in Solidity.

```solidity
address public constant P256_VERIFY = 0x0000000000000000000000000000000000000100;

function verifyWithKey(bytes32 digest, bytes32 r, bytes32 s, bytes32 x, bytes32 y) public view returns (bool) {
    (bool ok, bytes memory out) = P256_VERIFY.staticcall(abi.encodePacked(digest, r, s, x, y));
    if (!ok) revert PrecompileUnavailable();
    return out.length == 32 && uint256(bytes32(out)) == 1;
}
```

The server's gate then refuses an assertion that:
- has no user verification;
- comes from another origin or relying party;
- replays a challenge;
- comes from an address with no key on chain.

Only a verified operator is admitted to the corpus-shares whitelist, and every later paid run issues shares to that
address.

### 2. The arm's key: PRF → HKDF → Ed25519, through Mera

The same passkey's PRF, evaluated by Mera with a purpose-specific salt, gives bytes only this passkey can produce:

```ts
// lib/passkey.ts
const salt = SHA-256("thenar:" + purpose + ":v1");
const { prfOutput } = await getPasskeyPrfOutput({ rpId: location.hostname, prfSalt: salt, credential });

// lib/robot-key.ts
const prf = await passkeySecret(address, "so101-commands");
const seed = HKDF-SHA-256(prf, info = "thenar so101 command key v1");
return createEd25519SigningSession({ privateKey: seed });   // Mera holds it; the seed is zeroed
```

That Ed25519 key signs every command the station sends to the operator's own arm. The arm relay
(`scripts/arm-relay.mjs --owner <public key>`) moves the arm only for frames signed by that key. The seed is never stored: "Derive my SO-101 key" on `/passkey` re-derives the same key each
time, and a different purpose (salt) gives an independent key.

## Engineering notes

- **Keep what Mera discards.** Mera returns the PRF output. Thenar also needs the credential's P-256 public key for
  the registry, so `lib/passkey.ts` wraps the browser's WebAuthn client and keeps the attestation's key while Mera
  runs the ceremony.
- **The DER signature to (r, s)** conversion and the WebAuthn digest (`authenticatorData ‖ SHA-256(clientDataJSON)`)
  live in `lib/webauthn.ts`, shared by the browser, the server gate and the tests.
- **Tested in a real browser.** `test/live-passkey.mjs` drives Chromium's virtual authenticator (resident keys, user
  verification, PRF) through the real `lib/passkey.ts` and Mera. Monad's registry then verifies the assertion. It
  checks that the PRF is stable for one purpose and separated between purposes.

## What Mera brought to Thenar

- **Sybil resistance enforced on chain.** A paid run needs a passkey that Monad's precompile verified. A farm of
  scripted wallets can't pass it.
- **One sign-in, two keys.** The operator's identity and their robot's command key come from one passkey: no seed
  phrase, no key file, and nothing stored that could leak.
- **It's native to Monad.** The precompile makes passkey verification a cheap view call, so it runs on every
  admission instead of being trusted to a server.

## See it live (Monad testnet)

- **The demo take's passkey registration:**
  [0x175d59ba…d692](https://testnet.monadvision.com/tx/0x175d59ba8721a332b7dd6ddd5bcdad91cabac8fe4f324705d1b28e086090d692).
  In the video the passkey comes from Chromium's virtual authenticator, labelled on screen.
- **An operator's registration and admission:**
  - registration [0x3d763ead…b408fe](https://testnet.monadvision.com/tx/0x3d763ead3bc5666292aaee48e38dfaa2071a74feb0d0be2d08354a6eb6b408fe);
  - admission (CorpusShares whitelist) [0x15b27d03…2ceed](https://testnet.monadvision.com/tx/0x15b27d03781dcfb2f094fa74f77710a762746c014526bdcab6d0d96b5172ceed).
- **A paid run by a passkey-admitted operator:**
  [0x909f2c23…0d59](https://testnet.monadvision.com/tx/0x909f2c23ccae46476bbf18f55fb0a7e85d56a0cf23a642f47ea2375f0eda0d59).
- **In the app:**
  - `/passkey` shows "Prove it on Monad" and "Derive my SO-101 key";
  - `/network` checks a P-256 key through `0x0100` live.
- **The demo video at 0:35–0:48:** `docs/demo/thenar-demo.mp4`.
- **Code:** `lib/passkey.ts`, `lib/robot-key.ts`, `lib/webauthn.ts`, `components/operator-gate.tsx`,
  `components/passkey-keys.tsx`, `contracts/src/PasskeyRegistry.sol`.
