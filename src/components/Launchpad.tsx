import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { Address } from "viem";
import {
  REGISTRY,
  FACTORY,
  WETH,
  explorerTx,
  explorerAddress,
  shortAddr,
  fmt,
  loadConfig,
  isBlockedConfig,
  buildLaunchTx,
  parseLaunchReceipt,
  verifyCore,
  publicClient,
  giwaSepolia,
  BLOCKED_CONFIG_ID,
  BLOCKED_CONFIG_HASH,
  type AmmoraV4ConfigSnapshot,
} from "../lib/ammora";

const MIGRATION_MODES = ["concentrated", "compounding"] as const;

export default function Launchpad() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [configIdInput, setConfigIdInput] = useState("");
  const [configLoading, setConfigLoading] = useState(false);
  const [configErr, setConfigErr] = useState("");
  const [snapshot, setSnapshot] = useState<AmmoraV4ConfigSnapshot | null>(null);
  const [snapshotBlock, setSnapshotBlock] = useState<bigint | null>(null);
  const [configId, setConfigId] = useState<bigint | null>(null);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("9");
  const [metadataURI, setMetadataURI] = useState("");

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [created, setCreated] = useState<{ token: Address; curve: Address; hash: string } | null>(null);

  const blocked = snapshot !== null && configId !== null && isBlockedConfig(configId, snapshot.configHash);
  const decimalsMismatch =
    snapshot !== null && Number(decimals) !== snapshot.config.tokenDecimals;
  const canCreate =
    isConnected &&
    !!walletClient &&
    !!address &&
    snapshot !== null &&
    configId !== null &&
    !blocked &&
    snapshot.enabled &&
    !decimalsMismatch &&
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    !busy;

  async function onLoadConfig() {
    setConfigErr("");
    setSnapshot(null);
    setConfigId(null);
    setCreated(null);
    const id = BigInt(configIdInput.trim());
    if (id < 0n) {
      setConfigErr("Config ID must be a non-negative integer.");
      return;
    }
    if (isBlockedConfig(id)) {
      setConfigErr(
        `Config #${id.toString()} is BLOCKED for new launches (graduation-safety incident — see banner). No on-chain read is needed to know this.`,
      );
      return;
    }
    setConfigLoading(true);
    try {
      const { snapshot: snap, blockNumber } = await loadConfig(id);
      if (isBlockedConfig(id, snap.configHash)) {
        setConfigErr(
          `This Config's hash matches the blocked Config #6 hash (${BLOCKED_CONFIG_HASH}). Launch blocked.`,
        );
        return;
      }
      setSnapshot(snap);
      setSnapshotBlock(blockNumber);
      setConfigId(id);
      setDecimals(String(snap.config.tokenDecimals));
      setLog((l) => [...l, `Config #${id.toString()} loaded at block ${blockNumber}.`]);
    } catch (e) {
      setConfigErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConfigLoading(false);
    }
  }

  async function onCreate() {
    if (!snapshot || configId === null || !walletClient || !address) return;
    setBusy(true);
    setCreated(null);
    setLog((l) => [...l, "Verifying V4 core…"]);
    try {
      const block = snapshotBlock ?? (await publicClient.getBlockNumber());
      await verifyCore(block);
      const tx = buildLaunchTx({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        metadataURI: metadataURI.trim(),
        tokenDecimals: Number(decimals),
        configId,
        poolCreationFee: snapshot.config.poolCreationFee,
      });
      setLog((l) => [...l, `Built createLaunch calldata (value ${fmt(snapshot.config.poolCreationFee, 18)} ETH poolCreationFee). Requesting signature…`]);
      const hash = await walletClient.sendTransaction({
        account: address,
        chain: giwaSepolia,
        to: FACTORY,
        data: tx.data,
        value: tx.value,
      });
      setLog((l) => [...l, `Tx sent: ${hash} — waiting for receipt…`]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setLog((l) => [...l, `ERROR: receipt status is ${receipt.status}. Do NOT retry blindly — reconcile this hash first.`]);
        return;
      }
      const createdLaunch = parseLaunchReceipt(receipt);
      if (
        createdLaunch.configId !== configId ||
        createdLaunch.configHash.toLowerCase() !== snapshot.configHash.toLowerCase()
      ) {
        setLog((l) => [...l, "ERROR: receipt configId/configHash do not match the selected Config. Do not trust this launch."]);
        return;
      }
      setCreated({ token: createdLaunch.token, curve: createdLaunch.curve, hash });
      setLog((l) => [...l, `Launch created: token ${createdLaunch.token}, curve ${createdLaunch.curve}`]);
    } catch (e) {
      setLog((l) => [...l, `ERROR: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Launchpad — create a token launch</h2>

      <div className="banner warn">
        <b>⚠ Graduation-safety warning — read before launching.</b>
        <ul>
          <li>
            Config <b>#{BLOCKED_CONFIG_ID.toString()}</b> (hash{" "}
            <code>{shortAddr(BLOCKED_CONFIG_HASH)}</code>) is <b>BANNED</b> for new
            launches: it can sell all 1,000,000,000 base tokens while needing
            333,333,333 for the graduation pool, so migration fails
            (<code>MigrationNotReady</code>). This app refuses it in code, not just in the UI.
          </li>
          <li>
            Config #10 is only a test observation, <b>not</b> a safe default. The docs
            publish <b>no</b> “qualified” template ID/hash to copy — qualification is a
            process (raw-integer budget invariants, RESEARCH.md §8.3). There is{" "}
            <b>no preset Config</b> in this form on purpose: enter a Config ID you
            (or your operator) have qualified and reviewed.
          </li>
          <li>
            “Enabled” or “ReadyToMigrate” does <b>not</b> prove graduation will succeed.
            A launch is only “ready” after the full budget reconciliation.
          </li>
        </ul>
      </div>

      <h3>1 · Choose a Config</h3>
      <div className="row">
        <label className="field">
          <span>Config ID (from the on-chain Registry — no preset)</span>
          <input
            value={configIdInput}
            onChange={(e) => setConfigIdInput(e.target.value.trim())}
            placeholder="e.g. 25"
            inputMode="numeric"
          />
        </label>
        <button className="btn primary" disabled={configLoading || !configIdInput} onClick={() => void onLoadConfig()}>
          {configLoading ? "Loading…" : "Load Config"}
        </button>
      </div>
      <p className="muted small">
        Registry: <a href={explorerAddress(REGISTRY)} target="_blank" rel="noreferrer">{shortAddr(REGISTRY)}</a>
        {" "}· read at the finalized head (12 confirmations).
      </p>
      {configErr && <div className="error">{configErr}</div>}

      {snapshot && configId !== null && (
        <div className={blocked ? "banner danger" : "info"}>
          <dl className="quote">
            <div><dt>Config ID</dt><dd>#{configId.toString()}</dd></div>
            <div><dt>Enabled</dt><dd>{snapshot.enabled ? "yes" : "NO — new launches are blocked by this Config"}</dd></div>
            <div><dt>Config hash</dt><dd><code>{snapshot.configHash}</code></dd></div>
            <div><dt>Owner</dt><dd><a href={explorerAddress(snapshot.identity.owner)} target="_blank" rel="noreferrer">{shortAddr(snapshot.identity.owner)}</a></dd></div>
            <div><dt>Fee claimer (Partner)</dt><dd><a href={explorerAddress(snapshot.identity.feeClaimer)} target="_blank" rel="noreferrer">{shortAddr(snapshot.identity.feeClaimer)}</a></dd></div>
            <div><dt>Quote token</dt><dd><a href={explorerAddress(snapshot.config.quoteToken)} target="_blank" rel="noreferrer">{shortAddr(snapshot.config.quoteToken)}</a>{snapshot.config.quoteToken.toLowerCase() === WETH.toLowerCase() ? " (WETH)" : ""}</dd></div>
            <div><dt>Token decimals</dt><dd>{snapshot.config.tokenDecimals}</dd></div>
            <div><dt>Total supply (raw)</dt><dd>{snapshot.config.totalSupply.toString()}</dd></div>
            <div><dt>Migration quote threshold (raw)</dt><dd>{snapshot.config.migrationQuoteThreshold.toString()}</dd></div>
            <div><dt>Migration base threshold (raw)</dt><dd>{snapshot.config.migrationBaseThreshold.toString()}</dd></div>
            <div><dt>Creator share of non-protocol fee</dt><dd>{(snapshot.config.creatorShareOfNonProtocolBps / 100).toFixed(2)}%</dd></div>
            <div><dt>Migration mode</dt><dd>{MIGRATION_MODES[snapshot.config.migrationMode] ?? snapshot.config.migrationMode}</dd></div>
            <div><dt>Pool creation fee</dt><dd>{fmt(snapshot.config.poolCreationFee, 18)} ETH (native, paid by Creator)</dd></div>
            <div><dt>Partner recipient</dt><dd><a href={explorerAddress(snapshot.config.partnerRecipient)} target="_blank" rel="noreferrer">{shortAddr(snapshot.config.partnerRecipient)}</a></dd></div>
            <div><dt>Leftover receiver</dt><dd><a href={explorerAddress(snapshot.config.leftoverReceiver)} target="_blank" rel="noreferrer">{shortAddr(snapshot.config.leftoverReceiver)}</a></dd></div>
            <div><dt>Loaded at block</dt><dd>{snapshotBlock?.toString()}</dd></div>
          </dl>
          {blocked && <div className="error">This Config is BLOCKED. Creation is disabled.</div>}
          {!snapshot.enabled && <div className="error">This Config is disabled — it cannot be used for a new launch.</div>}
        </div>
      )}

      <h3>2 · Token details</h3>
      <div className="row">
        <label className="field">
          <span>Token name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bosqu Token" />
        </label>
        <label className="field">
          <span>Symbol</span>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BOSQU" />
        </label>
        <label className="field small">
          <span>Decimals (must match Config)</span>
          <input value={decimals} onChange={(e) => setDecimals(e.target.value.trim())} inputMode="numeric" />
        </label>
      </div>
      <label className="field">
        <span>Metadata URI (ipfs://… or https://…)</span>
        <input value={metadataURI} onChange={(e) => setMetadataURI(e.target.value.trim())} placeholder="ipfs://…" />
      </label>
      {decimalsMismatch && (
        <div className="error">Decimals must match the Config ({snapshot?.config.tokenDecimals}).</div>
      )}
      <p className="muted small">
        One <code>createLaunch</code> creates the ERC-20 token <b>and</b> its ALC bonding
        curve together. The token/curve addresses come from the transaction receipt —
        never from a prediction. Creator pays gas + the pool creation fee in native ETH.
      </p>

      <button className="btn primary big" disabled={!canCreate} onClick={() => void onCreate()}>
        {!isConnected
          ? "Connect wallet to launch"
          : !snapshot
            ? "Load a Config first"
            : blocked
              ? "Config blocked — cannot launch"
              : !snapshot.enabled
                ? "Config disabled — cannot launch"
                : decimalsMismatch
                  ? "Decimals must match Config"
                  : busy
                    ? "Waiting for signature / confirmation…"
                    : `Create launch (Config #${configId?.toString()})`}
      </button>

      {created && (
        <div className="success">
          <b>Launch created.</b>
          <br />
          Tx: <a href={explorerTx(created.hash)} target="_blank" rel="noreferrer">{shortAddr(created.hash)}</a>
          <br />
          Token: <a href={explorerAddress(created.token)} target="_blank" rel="noreferrer">{created.token}</a>
          <br />
          Curve: <a href={explorerAddress(created.curve)} target="_blank" rel="noreferrer">{created.curve}</a>
          <br />
          Save these addresses from this receipt. Trade the curve on the Exchange tab (DBC mode).
        </div>
      )}

      {log.length > 0 && (
        <details className="log">
          <summary>Launch log ({log.length})</summary>
          <pre>{log.join("\n")}</pre>
        </details>
      )}

      <h3>TODO — not in v1 (clearly marked, no mocks)</h3>
      <ul className="todo">
        <li>
          <b>Author a new Config</b> (recipient-only / fee-split / full authoring via{" "}
          <code>buildCreateAmmoraV4Config</code>): needs a <i>qualified</i> template
          + the §8.3 readiness reconciliation first. No template ID/hash is published
          by the docs, so this stays a guided operator flow, not a one-click form.
        </li>
        <li><b>Atomic Config + launch + first buy</b> (<code>createConfigAndPoolWithFirstBuy</code>) — after Config authoring lands.</li>
        <li><b>Graduation</b> (final buy → separate permissionless migrate) and <b>LP / FeeVault claims</b> — wired next, with receipt reconciliation.</li>
      </ul>
    </section>
  );
}
