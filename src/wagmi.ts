/**
 * wagmi config — injected connector only (MetaMask etc.), WalletConnect-free.
 * Client-side only. No private key / seed anywhere.
 */
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { giwaSepolia, RPC_URL } from "./lib/ammora";

export const wagmiConfig = createConfig({
  chains: [giwaSepolia],
  connectors: [injected()],
  transports: {
    [giwaSepolia.id]: http(RPC_URL),
  },
});
