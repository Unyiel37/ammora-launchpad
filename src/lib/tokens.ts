/**
 * Testnet tokens known from Ammora docs / example runs (RESEARCH.md).
 * WETH is the default quote token from the SDK catalog.
 * KGPT is the graduated token from the fresh-partner run 2026-11-05
 * (Config #25, RESEARCH.md §8.4) — reference only, its concentrated pool
 * is a real post-graduation pool usable for Exchange testing.
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

export const KNOWN_TOKENS: TestnetToken[] = [WETH_TOKEN, KGPT_TOKEN];
