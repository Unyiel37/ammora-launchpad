import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { parseUnits, zeroAddress, type Address } from "viem";
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
  CURVE_STATUS,
  type PreparedExactInputSwap,
} from "../lib/ammora";
import { KGPT_TOKEN, WETH_TOKEN } from "../lib/tokens";

type Mode = "pool" | "curve";

export default function Exchange() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [mode, setMode] = useState<Mode>("pool");
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.001");
  const [slippageBps, setSlippageBps] = useState("50");
  const [curveAddr, setCurveAddr] = useState("");
  const [baseAddr, setBaseAddr] = useState<string>(KGPT_TOKEN.address);
  const [baseDecimals, setBaseDecimals] = useState("9");

  const [quote, setQuote] = useState<PreparedExactInputSwap | null>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [curveInfo, setCurveInfo] = useState<{
    status: number;
    fillKind: string | null;
    baseToken: string;
    quoteToken: string;
    blockNumber: bigint;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [txHash, setTxHash] = useState("");
  const [received, setReceived] = useState("");

  const payer = address ?? zeroAddress;
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Token in/out for the current selection.
  const tokenIn = useMemo(() => {
    if (mode === "pool") return direction === "buy" ? WETH_TOKEN : KGPT_TOKEN;
    return direction === "buy"
      ? WETH_TOKEN
      : { symbol: "BASE", name: "Curve base token", address: baseAddr as Address, decimals: Number(baseDecimals) || 0, note: "" };
  }, [mode, direction, baseAddr, baseDecimals]);
  const tokenOut = useMemo(() => {
    if (mode === "pool") return direction === "buy" ? KGPT_TOKEN : WETH_TOKEN;
    return direction === "buy"
      ? { symbol: "BASE", name: "Curve base token", address: baseAddr as Address, decimals: Number(baseDecimals) || 0, note: "" }
      : WETH_TOKEN;
  }, [mode, direction, baseAddr, baseDecimals]);

  const poolAddr: Address = mode === "pool" ? (KGPT_TOKEN.pool as Address) : (curveAddr as Address);
  const model = mode === "pool" ? "concentrated" : "dbc";

  const validPool = /^0x[0-9a-fA-F]{40}$/.test(poolAddr ?? "");
  const validBase = mode === "pool" || /^0x[0-9a-fA-F]{40}$/.test(baseAddr);

  // Live quote (read-only, no wallet needed). Debounced.
  useEffect(() => {
    setQuote(null);
    setQuoteErr("");
    setCurveInfo(null);
    if (!validPool || !validBase || !amount || Number(amount) <= 0) return;
    if (mode === "curve" && (!baseDecimals || Number(baseDecimals) <= 0)) return;
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
          setQuoteErr(e instanceof Error ? e.message : String(e));
          setQuote(null);
        } finally {
          setQuoting(false);
        }
      })();
    }, 600);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, direction, amount, slippageBps, curveAddr, baseAddr, baseDecimals, payer]);

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
        <label className="field">
          <span>Market</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="pool">Graduated pool — KGPT ⇄ WETH (concentrated)</option>
            <option value="curve">Bonding curve — paste a curve address (DBC)</option>
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

      {mode === "pool" ? (
        <p className="muted">
          Pool: <a href={explorerAddress(KGPT_TOKEN.pool ?? "")} target="_blank" rel="noreferrer">{shortAddr(KGPT_TOKEN.pool ?? "")}</a>
          {" "}· KGPT <a href={explorerAddress(KGPT_TOKEN.address)} target="_blank" rel="noreferrer">{shortAddr(KGPT_TOKEN.address)}</a>
          {" "}(9 decimals, graduated from Config #25 fresh-partner run)
        </p>
      ) : (
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
        {quoteErr && <div className="error">Quote error: {quoteErr}</div>}
        {!quoting && !quoteErr && !q && (
          <div className="muted">
            {validPool ? "Enter an amount to get a live quote." : "Enter a valid pool / curve address."}
            {!isConnected && " (Quote works without a wallet; payer shown as zero address until you connect.)"}
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
        {" "}· Finalized-head snapshots (12 confirmations) are used for quotes.
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
