# Bosqu Launchpad — Ammora on GIWA

Exchange + Launchpad web app (v1) on the Ammora protocol (SDK 0.3.9, auto-route V4)
on GIWA Sepolia Testnet (chain 91342).

**Testnet only — no real money, no mainnet.** Wallet-connect only (injected
connector, e.g. MetaMask). This app never asks for, stores, or transmits a
private key or seed phrase.

## Run locally

```bash
npm install
npm run build     # must pass
npm run preview   # then open the printed URL
```

## Features (v1)

- **Exchange** — live read-only quotes via the Ammora SDK; swaps signed in your
  own wallet. Market selector with verified venues (21 Nov 2026):
  - Graduated pools (concentrated): BAEKHO ⇄ WETH (default), TNDM ⇄ WETH,
    KGPT ⇄ WETH. The KGPT pool's WETH reserve is drained (~0.000001 WETH),
    so normal buys revert with `PriceRangeViolation` — the UI explains this
    and offers the max fillable amount via `quoteExactInPartial`.
  - Bonding curves (DBC, Active): DKNG, ICD, 2D, TESTD — buy 0.01 WETH
    quotes with a full fill. A custom-curve option accepts any ALC address.
  - Quotes work without a wallet (a documented non-zero placeholder payer
    is used for read-only quotes; the SDK rejects the zero address).
  - Only `full` fills can be swapped (graduation-boundary / partial fills
    are blocked with an explanation).
- **Launchpad** — enter a Config ID (no preset), load + review the on-chain
  Config, then create a token launch (token + ALC curve in one tx). **Config #6
  is blocked in code** (graduation-safety incident, see below).
- **Header/footer** — GIWA Sepolia badge, links to the Ammora waitlist and docs,
  testnet-only disclaimer.

## Safety — Config #6 is BANNED for new launches

Config #6 (Registry `0x6d043014972b87406C4757a5f2d655A24e0b0aF9`, hash
`0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667`) can sell
all 1,000,000,000 base tokens while needing 333,333,333 for the graduation
pool, so migration fails (`MigrationNotReady`). Config #10 is only a test
observation, not a safe default. The docs publish no "qualified" template
ID/hash to copy — qualification is a process (see `research/RESEARCH.md` §8.3).
This app therefore ships **no preset Config** and refuses #6 by ID and by hash.

## Sources

- Research: `../research/RESEARCH.md`
- Docs: https://ammora-docs.vercel.app/guides/launchpad,
  https://ammora-docs.vercel.app/guides/partner-quickstart
- Examples: https://github.com/AmmoraLabs/ammora-examples

## TODO (v1 scope, marked in the UI — no mocks)

- Author a new qualified Config (`buildCreateAmmoraV4Config`) — needs the §8.3
  readiness reconciliation first.
- Atomic Config + launch + first buy; graduation (final buy → separate migrate);
  FeeVault / LP fee claims.
