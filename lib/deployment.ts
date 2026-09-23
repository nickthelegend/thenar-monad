/**
 * The Monad testnet deployment, as contracts/script/DeployMonad.s.sol left it.
 *
 * Written by scripts/apply-deploy.mjs from forge's broadcast record, never by
 * hand, so an address here is an address a transaction created. Public on
 * purpose: every value is on chain already, and committing it means a fresh
 * checkout and the deployed site read the same contracts without either
 * needing an env file to agree.
 *
 * An empty address means not deployed yet, which every surface already knows
 * how to say.
 *
 * No imports: scripts load this file with Node, outside the Next build.
 */
export const DEPLOYMENT = {
  chainId: 10143,
  /** The block AxonProtocolV2 was created in. */
  deployBlock: 0,
  deployedAt: "",
  deployer: "",
  verifier: "",
  contracts: {
    passkeyRegistry: "",
    axon: "",
    trajectoryCertificate: "",
    contributionRecord: "",
    corpusAccess: "",
    corpusManifest: "",
    corpusShares: "",
    salesLog: "",
    referrals: "",
    foundry: "",
    prizePool: "",
    confidentialPayouts: "",
  },
} as const;
