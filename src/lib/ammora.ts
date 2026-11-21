/**
 * Bosqu Launchpad — Ammora on GIWA
 * SDK access layer. All contract addresses come from the SDK deployment
 * catalog (`giwaSepoliaAutoRouteDeployment`), NEVER hardcoded guesses.
 * Source of truth: ~/workspace/ammora-builder/research/RESEARCH.md
 *
 * Wallet-connect only. No private key / seed / signer material anywhere.
 */
import {
  createPublicClient,
  defineChain,
  http,
  parseUnits,
  formatUnits,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  giwaSepoliaAutoRouteDeployment,
  giwaSepoliaAutoRoutePoolProfiles,
  giwaSepoliaAutoRoute,
  resolveAmmoraFinalizedHead,
  verifyAmmoraV4CoreAtBlock,
  getAmmoraV4ConfigAtBlock,
  AmmoraV4LaunchCurveClient,
  AmmoraSwapClient,
  ammConcentratedPoolV3Abi,
  classifyAmmoraV4ExactInputFill,
  buildCreateAmmoraV4Launch,
  parseAmmoraV4LaunchCreatedReceipt,
  ammoraLaunchFactoryV4Abi,
  AMMORA_FEE_POLICY_VERSION,
  type PreparedExactInputSwap,
  type AmmoraV4ConfigSnapshot,
  type AmmoraV4LaunchCurveState,
  type AmmoraV4ExactInputQuote,
} from "@ammora-protocol/sdk";

export type {
  PreparedExactInputSwap,
  AmmoraV4ConfigSnapshot,
} from "@ammora-protocol/sdk";

export const deployment = giwaSepoliaAutoRouteDeployment;
export const RPC_URL = "https://sepolia-rpc.giwa.io";
export const EXPLORER_URL = "https://sepolia-explorer.giwa.io";
export const CHAIN_ID = 91342;

export const giwaSepolia = defineChain({
  id: deployment.chain.id,
  name: deployment.chain.name,
  nativeCurrency: deployment.chain.nativeCurrency,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "GIWA Sepolia Explorer", url: EXPLORER_URL },
  },
});

export const publicClient: PublicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(RPC_URL),
});

/** Contract addresses — read from the SDK catalog, not invented. */
export const LAUNCH = deployment.contracts.launch;
export const WETH: Address = deployment.contracts.tokens.wrappedNative;
export const REGISTRY: Address = LAUNCH.configRegistry;
export const FACTORY: Address = LAUNCH.factory;
export const FEE_POLICY: Address = LAUNCH.feePolicy;

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER_URL}/address/${addr}`;

/* ------------------------------------------------------------------ */
/* Config safety — RESEARCH.md §8. Config #6 is BANNED for new launches */
/* ------------------------------------------------------------------ */
export const BLOCKED_CONFIG_ID = 6n;
export const BLOCKED_CONFIG_HASH =
  "0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667" as Hex;

export function isBlockedConfig(configId: bigint, configHash?: string): boolean {
  if (configId === BLOCKED_CONFIG_ID) return true;
  if (configHash && configHash.toLowerCase() === BLOCKED_CONFIG_HASH.toLowerCase())
    return true;
  return false;
}

/** Quote-only payer placeholder used when no wallet is connected.
 *  The SDK rejects the zero address as payer, so read-only quotes use this
 *  non-zero placeholder. It never signs anything — it is only an address
 *  the quoter simulates against. When a wallet is connected, the real
 *  address is used instead. */
export const QUOTE_PAYER_PLACEHOLDER: Address =
  "0x0000000000000000000000000000000000000001";
export async function finalizedHead(): Promise<bigint> {
  return resolveAmmoraFinalizedHead([publicClient], giwaSepoliaAutoRoute.finality);
}

export async function assertChain(): Promise<void> {
  const id = await publicClient.getChainId();
  if (id !== CHAIN_ID) throw new Error(`RPC chain mismatch: got ${id}, expected ${CHAIN_ID}`);
}

/** Verify the V4 core (registry/factory/adapter/feePolicy) at one block. */
export async function verifyCore(blockNumber: bigint): Promise<void> {
  await verifyAmmoraV4CoreAtBlock(publicClient, {
    configRegistry: LAUNCH.configRegistry,
    launchFactory: LAUNCH.factory,
    graduationAdapter: LAUNCH.graduationAdapter,
    feePolicy: LAUNCH.feePolicy,
  }, blockNumber);
}

/* ------------------------------------------------------------------ */
/* Config read (read-only)                                             */
/* ------------------------------------------------------------------ */
export async function loadConfig(configId: bigint): Promise<{
  snapshot: AmmoraV4ConfigSnapshot;
  blockNumber: bigint;
}> {
  const blockNumber = await finalizedHead();
  const snapshot = await getAmmoraV4ConfigAtBlock(
    publicClient,
    REGISTRY,
    configId,
    blockNumber,
  );
  return { snapshot, blockNumber };
}

/* ------------------------------------------------------------------ */
/* Curve (DBC) quote — read-only, no wallet needed                     */
/* ------------------------------------------------------------------ */
export const CURVE_STATUS = ["Uninitialized", "Active", "ReadyToMigrate", "Migrated"] as const;

export interface CurveQuoteResult {
  state: AmmoraV4LaunchCurveState;
  quote: AmmoraV4ExactInputQuote | null;
  fillKind: string | null;
  blockNumber: bigint;
}

export async function getCurveQuote(
  curve: Address,
  amountIn: bigint,
  isSell: boolean,
): Promise<CurveQuoteResult> {
  const blockNumber = await finalizedHead();
  const core = { launchFactory: FACTORY, feePolicy: FEE_POLICY };
  const sdk = new AmmoraV4LaunchCurveClient(publicClient, curve, core);
  const state = await sdk.getStateAtBlock(blockNumber);
  if (state.status !== 1) return { state, quote: null, fillKind: null, blockNumber };
  // Bind the curve to the reviewed V4 factory + fee policy (RESEARCH.md §7.2).
  const factoryToken = await publicClient.readContract({
    address: FACTORY,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: "tokenForCurve",
    args: [curve],
    blockNumber,
  });
  if (
    factoryToken === zeroAddress ||
    factoryToken.toLowerCase() !== state.baseToken.toLowerCase() ||
    state.feePolicy.toLowerCase() !== FEE_POLICY.toLowerCase() ||
    state.feePolicyVersion !== AMMORA_FEE_POLICY_VERSION
  ) {
    throw new Error("Curve is not bound to the reviewed V4 factory and fee policy");
  }
  const quote = await sdk.quoteExactInputAtBlock(amountIn, isSell, blockNumber);
  const fill = classifyAmmoraV4ExactInputFill(quote, isSell);
  return { state, quote, fillKind: fill.kind, blockNumber };
}

/* ------------------------------------------------------------------ */
/* Swap — AmmoraSwapClient (dbc / concentrated / compounding)          */
/* ------------------------------------------------------------------ */
let swapClientPromise: Promise<AmmoraSwapClient> | null = null;

export function getSwapClient(): Promise<AmmoraSwapClient> {
  if (!swapClientPromise) {
    swapClientPromise = AmmoraSwapClient.create(publicClient, {
      deploymentCatalog: { [CHAIN_ID]: deployment },
      factoryProfiles: giwaSepoliaAutoRoutePoolProfiles,
    });
  }
  return swapClientPromise;
}

export interface SwapQuoteParams {
  model: "dbc" | "concentrated" | "compounding" | "almm";
  pool: Address;
  tokenIn: Address;
  amountInHuman: string;
  tokenInDecimals: number;
  payer: Address;
  slippageBps?: number;
}

export async function prepareSwap(
  params: SwapQuoteParams,
): Promise<PreparedExactInputSwap> {
  const amountIn = parseUnits(params.amountInHuman, params.tokenInDecimals);
  if (amountIn <= 0n) throw new Error("Amount must be greater than 0");
  const swaps = await getSwapClient();
  // The SDK only accepts an explicit quoteBlockNumber for concentrated /
  // compounding pools. DBC (bonding-curve) quotes must omit it — the SDK
  // then quotes at the latest block. Passing a block for "dbc" throws
  // "explicit-block swap quotes currently support concentrated and
  // compounding pools only".
  const quoteBlockNumber =
    params.model === "dbc" ? undefined : await finalizedHead();
  return swaps.prepareExactIn({
    model: params.model,
    pool: params.pool,
    tokenIn: params.tokenIn,
    inputAsset: "erc20", // native route is disabled on auto-route generation
    amountIn,
    payer: params.payer,
    recipient: params.payer,
    slippageBps: params.slippageBps ?? 50, // 0.5% default (docs example)
    deadlineSeconds: 1200, // 20 minutes
    executionMode: "direct-wallet",
    ...(quoteBlockNumber !== undefined ? { quoteBlockNumber } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* Concentrated-pool state + partial fill (read-only)                  */
/* ------------------------------------------------------------------ */

export interface PoolState {
  baseToken: Address;
  quoteToken: Address;
  sqrtPrice: bigint;
  totalLiquidity: bigint;
  reserveBase: bigint;
  reserveQuote: bigint;
  isActive: boolean;
  currentFeeBps: number;
  blockNumber: bigint;
}

/** Read a graduated concentrated pool's reserves and liveness. */
export async function getPoolState(pool: Address): Promise<PoolState> {
  const blockNumber = await finalizedHead();
  const [baseToken, quoteToken, sqrtPrice, totalLiquidity, reserveBase, reserveQuote, isActive, currentFeeBps] =
    await Promise.all([
      publicClient.readContract({ address: pool, abi: ammConcentratedPoolV3Abi, functionName: "baseToken", blockNumber }),
      publicClient.readContract({ address: pool, abi: ammConcentratedPoolV3Abi, functionName: "quoteToken", blockNumber }),
      publicClient.readContract({ address: pool, abi: ammConcentratedPoolV3Abi, functionName: "sqrtPrice", blockNumber }),
      publicClient.readContract({ address: pool, abi: ammConcentratedPoolV3Abi, functionName: "totalLiquidity", blockNumber }),
      publicClient.readContract({ address: pool, abi: ammConcentratedPoolV3Abi, functionName: "reserveBase", blockNumber }),
      publicClient.readContract({ address: pool, abi: ammConcentratedPoolV3Abi, functionName: "reserveQuote", blockNumber }),
      publicClient.readContract({ address: pool, abi: ammConcentratedPoolV3Abi, functionName: "isActive", blockNumber }),
      publicClient.readContract({ address: pool, abi: ammConcentratedPoolV3Abi, functionName: "currentFeeBps", blockNumber }),
    ]);
  return { baseToken, quoteToken, sqrtPrice, totalLiquidity, reserveBase, reserveQuote, isActive, currentFeeBps, blockNumber };
}

export interface PartialFill {
  amountIn: bigint;
  amountOut: bigint;
  amountLeft: bigint;
  fee: bigint;
  nextSqrtPrice: bigint;
}

/** How much of an exact-in amount a concentrated pool can actually fill.
 *  Used when the full quote reverts with PriceRangeViolation: the pool's
 *  price range only fits part of the trade. Returns null when even the
 *  partial quote reverts. */
export async function getPartialFill(
  pool: Address,
  tokenIn: Address,
  amountIn: bigint,
): Promise<PartialFill | null> {
  const blockNumber = await finalizedHead();
  try {
    const [filledIn, filledOut, amountLeft, fee, nextSqrtPrice] =
      await publicClient.readContract({
        address: pool,
        abi: ammConcentratedPoolV3Abi,
        functionName: "quoteExactInPartial",
        args: [tokenIn, amountIn],
        blockNumber,
      });
    return {
      amountIn: filledIn,
      amountOut: filledOut,
      amountLeft,
      fee,
      nextSqrtPrice,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Create launch (token + ALC curve) — build only, wallet signs        */
/* ------------------------------------------------------------------ */
export interface CreateLaunchInput {
  name: string;
  symbol: string;
  metadataURI: string;
  tokenDecimals: number;
  configId: bigint;
  poolCreationFee: bigint;
}

export function buildLaunchTx(input: CreateLaunchInput): { data: Hex; value: bigint } {
  return buildCreateAmmoraV4Launch(
    {
      name: input.name,
      symbol: input.symbol,
      metadataURI: input.metadataURI,
      creatorMetadataURI: input.metadataURI,
      tokenDecimals: input.tokenDecimals,
    },
    input.configId,
    input.poolCreationFee,
  );
}

export function parseLaunchReceipt(
  receipt: Parameters<typeof parseAmmoraV4LaunchCreatedReceipt>[0],
) {
  return parseAmmoraV4LaunchCreatedReceipt(receipt, FACTORY);
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */
export const fmt = (raw: bigint, decimals: number, maxFrac = 6): string => {
  const s = formatUnits(raw, decimals);
  const [i, f = ""] = s.split(".");
  return f ? `${i}.${f.slice(0, maxFrac)}` : i;
};

export const shortAddr = (addr: string) =>
  addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
