import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./wagmi";
import ConnectButton from "./components/ConnectButton";
import Exchange from "./components/Exchange";
import Launchpad from "./components/Launchpad";
import { CHAIN_ID, RPC_URL, EXPLORER_URL, FACTORY, REGISTRY, shortAddr, explorerAddress } from "./lib/ammora";

const queryClient = new QueryClient();

export default function App() {
  const [tab, setTab] = useState<"exchange" | "launchpad">("exchange");

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="page">
          <header className="header">
            <div>
              <h1>Bosqu Launchpad <span className="thin">— Ammora on GIWA</span></h1>
              <p className="subtitle">
                Exchange + Launchpad on the Ammora protocol (SDK 0.3.9, auto-route V4)
              </p>
            </div>
            <ConnectButton />
          </header>

          <div className="badges">
            <span className="badge">GIWA Sepolia Testnet · Chain {CHAIN_ID}</span>
            <span className="badge">RPC: {RPC_URL.replace("https://", "")}</span>
            <a className="badge link" href="https://ammora.org/waitlist" target="_blank" rel="noreferrer">
              Ammora waitlist ↗
            </a>
            <a className="badge link" href="https://ammora-docs.vercel.app/guides/launchpad" target="_blank" rel="noreferrer">
              Ammora docs — Launchpad ↗
            </a>
            <a className="badge link" href="https://ammora-docs.vercel.app/guides/partner-quickstart" target="_blank" rel="noreferrer">
              Partner quickstart ↗
            </a>
            <a className="badge link" href={EXPLORER_URL} target="_blank" rel="noreferrer">
              Explorer ↗
            </a>
          </div>

          <nav className="tabs">
            <button className={tab === "exchange" ? "tab active" : "tab"} onClick={() => setTab("exchange")}>
              Exchange
            </button>
            <button className={tab === "launchpad" ? "tab active" : "tab"} onClick={() => setTab("launchpad")}>
              Launchpad
            </button>
          </nav>

          <main>
            {tab === "exchange" ? <Exchange /> : <Launchpad />}
          </main>

          <footer className="footer">
            <p>
              <b>Testnet only — no real money, no mainnet.</b> All transactions are signed
              in your own wallet (injected connector). This app never
              asks for, stores, or transmits a private key or seed phrase.
            </p>
            <p className="muted small">
              Contracts are read from the Ammora SDK 0.3.9 deployment catalog (auto-route V4):
              Factory <a href={explorerAddress(FACTORY)} target="_blank" rel="noreferrer">{shortAddr(FACTORY)}</a>
              {" "}· Registry <a href={explorerAddress(REGISTRY)} target="_blank" rel="noreferrer">{shortAddr(REGISTRY)}</a>
              {" "}· Research: <code>research/RESEARCH.md</code> · X: @Bosqu99
            </p>
          </footer>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
