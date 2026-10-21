/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Arc Mainnet — chain ID 5042 (not yet in viem/chains, defined inline)
const ARC_MAINNET_ID = 5042
const ARC_MAINNET_RPC = 'https://rpc.mainnet.arc.io'

const arcMainnet = {
  id: ARC_MAINNET_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_MAINNET_RPC] as readonly [string, ...string[]] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
} as const

// Pre-register chain RPC URLs so trace events show correct chain names
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(ARC_MAINNET_ID, ARC_MAINNET_RPC)

export const config = createConfig({
  chains: [arcMainnet, arcTestnet, mainnet],
  connectors: [injected()],
  transports: {
    [ARC_MAINNET_ID]: http(ARC_MAINNET_RPC),
    [arcTestnet.id]: http('https://rpc.testnet.arc.io'),
    [mainnet.id]: http(), // ENS resolution
  },
})
