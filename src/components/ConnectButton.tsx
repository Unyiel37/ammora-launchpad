import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { CHAIN_ID } from "../lib/ammora";
import { shortAddr } from "../lib/ammora";

export default function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== CHAIN_ID;

  if (!isConnected) {
    return (
      <div className="connect-wrap">
        <button
          className="btn primary"
          disabled={isPending}
          onClick={() => connect({ connector: injected() })}
        >
          {isPending ? "Connecting…" : "Connect Wallet"}
        </button>
        {error && <div className="error">{error.message}</div>}
      </div>
    );
  }

  return (
    <div className="connect-wrap">
      <span className="addr" title={address}>{shortAddr(address ?? "")}</span>
      {wrongChain ? (
        <button className="btn warn" onClick={() => switchChain({ chainId: CHAIN_ID })}>
          Switch to GIWA Sepolia
        </button>
      ) : (
        <span className="chain-ok">GIWA Sepolia ✓</span>
      )}
      <button className="btn" onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
