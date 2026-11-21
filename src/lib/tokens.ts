/**
 * Testnet tokens and markets known from Ammora docs / example runs and
 * verified live on GIWA Sepolia (probe 21 Nov 2026 ~23:55 WIB, blocks
 * ~41934xxx). WETH is the default quote token from the SDK catalog.
 *
 * MARKET HEALTH (verified read-only, no transactions):
 * - BAEKHO concentrated pool: buy 0.01 WETH OK (~16.6M BAEKHO, ~16.8% impact),
 *   buy 0.001 WETH OK (~1.89M BAEKHO, ~2.6% impact). DEFAULT market.
 * - DKNG / ICD / 2D / TESTD bonding curves (DBC, Active): buy 0.01 WETH OK,
 *   fill=full. DKNG: ~31.1M out; ICD: ~106.9M out; 2D: ~99.8M out.
 * - KGPT concentrated pool: WETH reserve exhausted (~0.000001 WETH left).
 *   Only micro-buys (<= ~0.000001 WETH) and sells (<= ~1000 KGPT) quote;
 *   normal buys revert with PriceRangeViolation. Kept as a market with an
 *   honest warning — it is the graduated token from the fresh-partner run
 *   (Config #25, RESEARCH.md §8.4).
 * - TNDM concentrated pool: buy 0.001 WETH OK, buy 0.01 WETH reverts.
 */
import type { Address } from "viem";
import { WETH } from "./ammora";

export interface TestnetToken {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  /** Graduated (concentrated) pool, if the token has one. */
  pool?: Address;
  note: string;
}

export const WETH_TOKEN: TestnetToken = {
  symbol: "WETH",
  name: "Wrapped Ether (GIWA Sepolia)",
  address: WETH,
  decimals: 18,
  note: "Default quote token (SDK catalog)",
};

export const KGPT_TOKEN: TestnetToken = {
  symbol: "KGPT",
  name: "KGPT (fresh-partner run, Config #25)",
  address: "0xeFD0b74cB733534D6554894c0FdF5931a711BCFB",
  decimals: 9,
  pool: "0xD912Fa18061E5665136AE5dBc002aDa0fc0D3c28",
  note: "Graduated token — trade via its concentrated pool",
};

export const BAEKHO_TOKEN: TestnetToken = {
  symbol: "BAEKHO",
  name: "BAEKHO (graduated, recent launch)",
  address: "0x1eaa7BdB1f982b3e6A760E63AA60CaE8c3f80fcD",
  decimals: 9,
  pool: "0x35Fff2d0911A4d2afceB69e48Eb37327a5d1Cb4a",
  note: "Graduated token — default Exchange market (verified quoting)",
};

export const TNDM_TOKEN: TestnetToken = {
  symbol: "TNDM",
  name: "TNDM (graduated, recent launch)",
  address: "0x49Ed98DD273c4a73Edc075Fa3A21a9cd4554f701",
  decimals: 9,
  pool: "0xb2D555984dE947Bf92cdf732ae04E7341A3C9607",
  note: "Graduated token — thin WETH reserve, small buys only",
};

export const KNOWN_TOKENS: TestnetToken[] = [WETH_TOKEN, KGPT_TOKEN, BAEKHO_TOKEN, TNDM_TOKEN];

/** A selectable Exchange market: one token + one quotable venue. */
export interface Market {
  id: string;
  label: string;
  /** "pool" = graduated concentrated pool, "curve" = bonding curve (DBC). */
  model: "pool" | "curve";
  base: TestnetToken;
  /** Pool address (concentrated) or curve address (DBC). */
  venue: Address;
  /** Default amount-in for this market (human units, WETH for buys). */
  defaultAmount: string;
  /** Short health note shown in the UI (verified 21 Nov 2026). */
  health: string;
  /** True when normal-size buys revert on this venue. */
  thin?: boolean;
}

export const DKNG_CURVE: Address = "0xb1c4C6bE055163483E344461ba2559CB886AF07d";
export const DKNG_TOKEN: TestnetToken = {
  symbol: "DKNG",
  name: "DKNG (bonding curve, Active)",
  address: "0x1F7517EB921b35d531a758D1Cf37Cbb537bE1D80",
  decimals: 9,
  note: "Active DBC curve — buy 0.01 WETH quotes full",
};

export const ICD_CURVE: Address = "0x2dE703bD4E81d05A7654191b2d30A267d8D096bF";
export const ICD_TOKEN: TestnetToken = {
  symbol: "ICD",
  name: "ICD (bonding curve, Active)",
  address: "0x4b77b68c848d09371fDA4709874b1BBD35Bf5593",
  decimals: 9,
  note: "Active DBC curve — buy 0.01 WETH quotes full",
};

export const TWO_D_CURVE: Address = "0x44f3a328db4968cCEE9050565A71bD22efb1c67A";
export const TWO_D_TOKEN: TestnetToken = {
  symbol: "2D",
  name: "2D (bonding curve, Active)",
  address: "0x5bC400c39b4Ee40d4bF54541c2c18794b12F7Bf5",
  decimals: 9,
  note: "Active DBC curve — buy 0.01 WETH quotes full",
};

export const TESTD_CURVE: Address = "0x054062aaA25219Dd6B9038C4EE7c6117a1ed4201";
export const TESTD_TOKEN: TestnetToken = {
  symbol: "TESTD",
  name: "TESTD (bonding curve, Active)",
  address: "0x9332c322e9c0d40A8b30A175E93Ab6Ac0401b199",
  decimals: 9,
  note: "Active DBC curve — buy 0.01 WETH quotes full",
};

export const MARKETS: Market[] = [
  {
    id: "baekho-pool",
    label: "BAEKHO ⇄ WETH — graduated pool",
    model: "pool",
    base: BAEKHO_TOKEN,
    venue: BAEKHO_TOKEN.pool as Address,
    defaultAmount: "0.001",
    health: "Verified quoting: buy 0.001 WETH ≈ 1.89M BAEKHO.",
  },
  {
    id: "dkng-curve",
    label: "DKNG ⇄ WETH — bonding curve (Active)",
    model: "curve",
    base: DKNG_TOKEN,
    venue: DKNG_CURVE,
    defaultAmount: "0.01",
    health: "Verified quoting: buy 0.01 WETH ≈ 31.1M DKNG, full fill.",
  },
  {
    id: "icd-curve",
    label: "ICD ⇄ WETH — bonding curve (Active)",
    model: "curve",
    base: ICD_TOKEN,
    venue: ICD_CURVE,
    defaultAmount: "0.01",
    health: "Verified quoting: buy 0.01 WETH ≈ 106.9M ICD, full fill.",
  },
  {
    id: "2d-curve",
    label: "2D ⇄ WETH — bonding curve (Active)",
    model: "curve",
    base: TWO_D_TOKEN,
    venue: TWO_D_CURVE,
    defaultAmount: "0.01",
    health: "Verified quoting: buy 0.01 WETH ≈ 99.8M 2D, full fill.",
  },
  {
    id: "testd-curve",
    label: "TESTD ⇄ WETH — bonding curve (Active)",
    model: "curve",
    base: TESTD_TOKEN,
    venue: TESTD_CURVE,
    defaultAmount: "0.01",
    health: "Verified quoting: buy 0.01 WETH ≈ 165.3M TESTD, full fill.",
  },
  {
    id: "tndm-pool",
    label: "TNDM ⇄ WETH — graduated pool (thin)",
    model: "pool",
    base: TNDM_TOKEN,
    venue: TNDM_TOKEN.pool as Address,
    defaultAmount: "0.001",
    health: "Thin: buy 0.001 WETH quotes; buy 0.01 WETH reverts.",
    thin: true,
  },
  {
    id: "kgpt-pool",
    label: "KGPT ⇄ WETH — graduated pool (drained)",
    model: "pool",
    base: KGPT_TOKEN,
    venue: KGPT_TOKEN.pool as Address,
    defaultAmount: "0.000001",
    health: "Drained: WETH reserve ≈ 0.000001 — only micro-buys quote.",
    thin: true,
  },
];

export const DEFAULT_MARKET_ID = "baekho-pool";
