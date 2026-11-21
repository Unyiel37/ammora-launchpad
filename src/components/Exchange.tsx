import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { parseUnits, type Address } from "viem";
import {
  FACTORY,
  explorerTx,
  explorerAddress,
  shortAddr,
  fmt,
  getCurveQuote,
  prepareSwap,
  verifyCore,
  finalizedHead,
  getPoolState,
  getPartialFill,
  QUOTE_PAYER_PLACEHOLDER,
  CURVE_STATUS,
  type PreparedExactInputSwap,
  type PoolState,
  type PartialFill,
} from "../lib/ammora";
import {
  MARKETS,
  DEFAULT_MARKET_ID,
  WETH_TOKEN,
  type Market,
} from "../lib/tokens";

const CUSTOM_MARKET_ID = "custom-curve";

export default function Exchange() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [marketId, setMarketId] = useState<string>(DEFAULT_MARKET_ID);
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.001");
  const [slippageBps, setSlippageBps] = useState("50");
  const [curveAddr, setCurveAddr] = useState("");
  const [baseAddr, setBaseAddr] = useState<string>("");
  const [baseDecimals, setBaseDecimals] = useState("9");

  const [quote, setQuote] = useState<PreparedExactInputSwap | null>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [priceRangeNote, setPriceRangeNote] = useState("");
  const [partialFill, setPartialFill] = useState<PartialFill | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [curveInfo, setCurveInfo] = useState<{
    status: number;
    fillKind: string | null;
    baseToken: string;
    quoteToken: string;
    blockNumber: bigint;
  } | null>(null);
  const [poolState, setPoolState] = useState<PoolState | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [txHash, setTxHash] = useState("");
  const [received, setReceived] = useState("");

  const market: Market | null =
    marketId === CUSTOM_MARKET_ID
      ? null
      : (MARKETS.find((m) => m.id === marketId) ?? MARKETS[0]);
  const mode = market ? market.model : "curve";

  // The SDK rejects the zero address as payer, so read-only quotes made
  // without a connected wallet use a documented non-zero placeholder.
  // It never signs anything; the connected address is used once available.
  const payer = address ?? QUOTE_PAYER_PLACEHOLDER;
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onMarketChange(id: string) {
    setMarketId(id);
    const m = MARKETS.find((x) => x.id === id);
    if (m) setAmount(m.defaultAmount);
    setQuote(null);
    setQuoteErr("");
    setPriceRangeNote("");
    setPartialFill(null);
    setCurveInfo(null);
    setPoolState(null);
  }

  // Token in/out for the current selection.
  const tokenIn = useMemo(() => {
    if (mode === "pool") return direction === "buy" ? WETH_TOKEN : (market?.base ?? WETH_TOKEN);
    return direction === "buy"
      ? WETH_TOKEN
      : {
          symbol: market?.base.symbol ?? "BASE",
          name: market?.base.name ?? "Curve base token",
          address: (market?.base.address ?? baseAddr) as Address,
          decimals: (market?.base.decimals ?? Number(baseDecimals)) || 0,
          note: "",
        };
  }, [mode, direction, market, baseAddr, baseDecimals]);
  const tokenOut = useMemo(() => {
    if (mode === "pool") return direction === "buy" ? (market?.base ?? WETH_TOKEN) : WETH_TOKEN;
    return direction === "buy"
      ? {
          symbol: market?.base.symbol ?? "BASE",
          name: market?.base.name ?? "Curve base token",
          address: (market?.base.address ?? baseAddr) as Address,
          decimals: (market?.base.decimals ?? Number(baseDecimals)) || 0,
          note: "",
        }
      : WETH_TOKEN;
  }, [mode, direction, market, baseAddr, baseDecimals]);

  const poolAddr: Address = mode === "pool" ? ((market?.venue ?? "") as Address) : ((market?.venue ?? curveAddr) as Address);
  const model = mode === "pool" ? "concentrated" : "dbc";

  const validPool = /^0x[0-9a-fA-F]{40}$/.test(poolAddr ?? "");
  const validBase =
    mode === "pool" ||
    !!market ||
    /^0x[0-9a-fA-F]{40}$/.test(baseAddr);

  // Pool reserves (read-only) for graduated-pool markets.
  useEffect(() => {
    setPoolState(null);
    if (mode !== "pool" || !validPool) return;
    let cancelled = false;
    void (async () => {
      try {
        const st = await getPoolState(poolAddr);
        if (!cancelled) setPoolState(st);
      } catch {
        if (!cancelled) setPoolState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, poolAddr, validPool, quote?.quote.quoteBlockNumber]);

  // Live quote (read-only, no wallet needed). Debounced.
  useEffect(() => {
    setQuote(null);
    setQuoteErr("");
    setPriceRangeNote("");
    setPartialFill(null);
    setCurveInfo(null);
    if (!validPool || !validBase || !amount || Number(amount) <= 0) return;
    if (mode === "curve" && !market && (!baseDecimals || Number(baseDecimals) <= 0)) return;
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(() => {
      void (async () => {
        setQuoting(true);
        try {
          const prepared = await prepareSwap({
            model,
            pool: poolAddr,
            tokenIn: tokenIn.address,
            amountInHuman: amount,
            tokenInDecimals: tokenIn.decimals,
            payer,
            slippageBps: Math.min(9999, Math.max(0, Number(slippageBps) || 50)),
          });
          setQuote(prepared);
          setQuoteErr("");
          setPriceRangeNote("");
          setPartialFill(null);
          if (mode === "curve") {
            const raw = parseUnits(amount, tokenIn.decimals);
            const cq = await getCurveQuote(poolAddr, raw, direction === "sell");
            setCurveInfo({
              status: cq.state.status,
              fillKind: cq.fillKind,
              baseToken: cq.state.baseToken,
              quoteToken: cq.state.quoteToken,
              blockNumber: cq.blockNumber,
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setQuoteErr(msg);
          setQuote(null);
          // A PriceRangeViolation means the pool's price range cannot fit
          // this trade — usually because its quote-token reserve is nearly
          // drained. Explain it plainly and offer the fillable remainder.
          if (msg.includes("PriceRangeViolation")) {
            setPriceRangeNote(
              "This venue's price range cannot fit this trade: its WETH reserve is nearly drained, so the price would move outside the allowed range. Try a much smaller amount, the reverse direction, or another market.",
            );
            if (mode === "pool") {
              try {
                const raw = parseUnits(amount, tokenIn.decimals);
                const pf = await getPartialFill(poolAddr, tokenIn.address, raw);
                setPartialFill(pf);
              } catch {
                setPartialFill(null);
              }
            }
          }
        } finally {
          setQuoting(false);
        }
      })();
    }, 600);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, direction, amount, slippageBps, curveAddr, baseAddr, baseDecimals, payer, marketId]);

  const curveBlocked =
    mode === "curve" &&
    curveInfo !== null &&
    (curveInfo.status !== 1 || (curveInfo.fillKind !== null && curveInfo.fillKind !== "full"));

  const canSwap =
    isConnected &&
    !!walletClient &&
    !!quote &&
    !quoting &&
    !busy &&
    !curveBlocked &&
    !quote.isExpired();

  async function onSwap() {
    if (!quote || !walletClient || !address) return;
    setBusy(true);
    setTxHash("");
    setReceived("");
    setLog((l) => [...l, "Verifying V4 core at quote block…"]);
    try {
      await verifyCore(quote.quote.quoteBlockNumber);
      setLog((l) => [...l, "Core verified. Requesting signature in your wallet…"]);
      const result = await quote.execute(walletClient, {
        onStatus: (s: unknown) => setLog((l) => [...l, `status: ${String(s)}`]),
      });
      setTxHash(result.hash);
      setLog((l) => [...l, `Swap submitted: ${result.hash}`]);
      if (result.amountReceived === null) {
        setLog((l) => [...l, "WARNING: amountReceived is null — reconcile the receipt before trusting this trade."]);
      } else {
        setReceived(fmt(result.amountReceived, tokenOut.decimals));
        setLog((l) => [...l, `Received (receipt): ${fmt(result.amountReceived as bigint, tokenOut.decimals)} ${tokenOut.symbol}`]);
      }
      // Refresh quote after a trade.
      setQuote(null);
    } catch (e) {
      setLog((l) => [...l, `ERROR: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  }

  function usePartialFillAmount() {
    if (!partialFill) return;
    // Set the amount to the fillable remainder so the next quote succeeds.
    const human = fmt(partialFill.amountIn, tokenIn.decimals, 18).replace(/0+$/, "").replace(/\.$/, "");
    if (human && Number(human) > 0) setAmount(human);
  }

  const q = quote?.quote;
  const approvals = quote?.approvalRequirements ?? [];

  return (
    <section className="card">
      <h2>Exchange</h2>
      <p className="muted">
        Live quotes via the Ammora SDK (read-only — no wallet needed for a quote).
        Swaps are signed in your own wallet. Buy uses WETH (ERC-20); the native
        route is disabled on the auto-route generation, so wrap ETH to WETH first.
      </p>

      <div className="row">
        <label className="field wide">
          <span>Market</span>
          <select value={marketId} onChange={(e) => onMarketChange(e.target.value)}>
            {MARKETS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value={CUSTOM_MARKET_ID}>Bonding curve — paste a curve address (DBC)</option>
          </select>
        </label>
        <label className="field">
          <span>Direction</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as "buy" | "sell")}>
            <option value="buy">Buy (WETH → token)</option>
            <option value="sell">Sell (token → WETH)</option>
          </select>
        </label>
      </div>

      {market && <p className="muted">{market.health}</p>}
      {mode === "pool" && market && (
        <p className="muted">
          Pool: <a href={explorerAddress(market.venue)} target="_blank" rel="noreferrer">{shortAddr(market.venue)}</a>
          {" "}· {market.base.symbol}{" "}
          <a href={explorerAddress(market.base.address)} target="_blank" rel="noreferrer">{shortAddr(market.base.address)}</a>
          {" "}({market.base.decimals} decimals)
          {poolState && (
            <>
              {" "}· reserves: {fmt(poolState.reserveBase, market.base.decimals)} {market.base.symbol} / {fmt(poolState.reserveQuote, 18)} WETH
              {!poolState.isActive && " · pool is NOT active"}
            </>
          )}
        </p>
      )}
      {marketId === CUSTOM_MARKET_ID && (
        <div className="row">
          <label className="field wide">
            <span>Curve address (ALC, DBC)</span>
            <input value={curveAddr} onChange={(e) => setCurveAddr(e.target.value.trim())} placeholder="0x…" />
          </label>
          <label className="field">
            <span>Base token address</span>
            <input value={baseAddr} onChange={(e) => setBaseAddr(e.target.value.trim())} placeholder="0x…" />
          </label>
          <label className="field small">
            <span>Base decimals</span>
            <input value={baseDecimals} onChange={(e) => setBaseDecimals(e.target.value.trim())} inputMode="numeric" />
          </label>
        </div>
      )}

      <div className="row">
        <label className="field">
          <span>Amount in ({tokenIn.symbol})</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.trim())} inputMode="decimal" />
        </label>
        <label className="field small">
          <span>Slippage (bps)</span>
          <input value={slippageBps} onChange={(e) => setSlippageBps(e.target.value.trim())} inputMode="numeric" />
        </label>
      </div>

      {mode === "curve" && curveInfo && (
        <div className="info">
          Curve status: <b>{CURVE_STATUS[curveInfo.status] ?? `unknown (${curveInfo.status})`}</b>
          {curveInfo.fillKind && <> · fill: <b>{curveInfo.fillKind}</b></>}
          {" "}· block {curveInfo.blockNumber.toString()}
          <br />
          base <a href={explorerAddress(curveInfo.baseToken)} target="_blank" rel="noreferrer">{shortAddr(curveInfo.baseToken)}</a>
          {" "}· quote <a href={explorerAddress(curveInfo.quoteToken)} target="_blank" rel="noreferrer">{shortAddr(curveInfo.quoteToken)}</a>
          {curveInfo.status !== 1 && (
            <div className="error">Curve is not Active — trading is not offered.</div>
          )}
          {curveInfo.fillKind && curveInfo.fillKind !== "full" && (
            <div className="error">
              Fill is “{curveInfo.fillKind}”, not “full”. Ordinary swaps are blocked:
              a graduation-boundary buy needs the terminal-fill flow, a partial sell
              needs a smaller amount or a refresh. No signature will be requested.
            </div>
          )}
        </div>
      )}

      <div className="quote-box">
        {quoting && <div className="muted">Fetching live quote…</div>}
        {quoteErr && (
          <div className="error">
            Quote error: {quoteErr}
            {priceRangeNote && <div style={{ marginTop: 6 }}>{priceRangeNote}</div>}
            {partialFill && partialFill.amountIn > 0n && (
              <div style={{ marginTop: 6 }}>
                This pool can still fill {fmt(partialFill.amountIn, tokenIn.decimals, 18)} {tokenIn.symbol} →{" "}
                {fmt(partialFill.amountOut, tokenOut.decimals)} {tokenOut.symbol} (the rest would be left unfilled).{" "}
                <button className="btn" type="button" onClick={usePartialFillAmount}>
                  Use max fillable amount
                </button>
              </div>
            )}
            {partialFill && partialFill.amountIn === 0n && (
              <div style={{ marginTop: 6 }}>This pool cannot fill any of this trade right now — try another market.</div>
            )}
          </div>
        )}
        {!quoting && !quoteErr && !q && (
          <div className="muted">
            {validPool ? "Enter an amount to get a live quote." : "Enter a valid pool / curve address."}
            {!isConnected && " (Quote works without a wallet.)"}
          </div>
        )}
        {q && (
          <dl className="quote">
            <div><dt>You pay</dt><dd>{fmt(q.amountIn, tokenIn.decimals)} {tokenIn.symbol}</dd></div>
            <div><dt>You receive (expected)</dt><dd>{fmt(q.expectedAmountOut, tokenOut.decimals)} {tokenOut.symbol}</dd></div>
            <div><dt>Minimum out ({slippageBps} bps slippage)</dt><dd>{fmt(q.minimumAmountOut, tokenOut.decimals)} {tokenOut.symbol}</dd></div>
            {q.feeAmount !== null && <div><dt>Fee</dt><dd>{fmt(q.feeAmount, tokenOut.decimals)} {tokenOut.symbol}</dd></div>}
            {q.priceImpactBps !== null && <div><dt>Price impact</dt><dd>{(Number(q.priceImpactBps) / 100).toFixed(2)}%</dd></div>}
            <div><dt>Quote block</dt><dd>{q.quoteBlockNumber.toString()}</dd></div>
            <div><dt>Quote expires</dt><dd>{new Date(q.expiresAtMs).toLocaleTimeString()}</dd></div>
            {approvals.length > 0 && (
              <div><dt>Approval needed</dt><dd>
                {approvals.map((a, i) => (
                  <div key={i}>{fmt(a.amount, tokenIn.decimals)} {tokenIn.symbol} → {shortAddr(a.spender)}</div>
                ))}
              </dd></div>
            )}
          </dl>
        )}
      </div>

      <button className="btn primary big" disabled={!canSwap} onClick={() => void onSwap()}>
        {!isConnected
          ? "Connect wallet to swap"
          : busy
            ? "Waiting for signature / confirmation…"
            : quote && quote.isExpired()
              ? "Quote expired — refresh"
              : curveBlocked
                ? "Swap blocked (see curve state above)"
                : `Swap ${amount || "…"} ${tokenIn.symbol} → ${tokenOut.symbol}`}
      </button>
      {!isConnected && (
        <p className="muted">Swap is disabled until a wallet is connected. Quotes above are read-only.</p>
      )}
      <p className="muted small">
        Factory (from SDK catalog): <a href={explorerAddress(FACTORY)} target="_blank" rel="noreferrer">{shortAddr(FACTORY)}</a>
        {" "}· Finalized-head snapshots (12 confirmations) are used for pool quotes; curve quotes use the latest block.
      </p>

      {txHash && (
        <div className="success">
          Swap tx: <a href={explorerTx(txHash)} target="_blank" rel="noreferrer">{shortAddr(txHash)}</a>
          {received && <> · received {received} {tokenOut.symbol}</>}
        </div>
      )}
      {log.length > 0 && (
        <details className="log">
          <summary>Swap log ({log.length})</summary>
          <pre>{log.join("\n")}</pre>
          <button className="btn" onClick={async () => { const b = await finalizedHead(); setLog((l) => [...l, `finalized head: ${b}`]); }}>Check finalized head</button>
        </details>
      )}
    </section>
  );
}
