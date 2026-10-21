import artifact from '../../contracts/out/USDCEscrow.sol/USDCEscrow.json';

// Arc Testnet (5042002) — for development / testing
const TESTNET_ADDRESS = '0xed8c8c5ec0384b65ed54979f04e76d17265645ef' as const;
// Arc Mainnet (5042) — production
const MAINNET_ADDRESS = '0x2581E9F39e5CBB83f00f091Ee4B3018F17dFd4Ab' as const;

export const ESCROW_ADDRESSES: Record<number, `0x${string}`> = {
  5042002: TESTNET_ADDRESS,
  5042: MAINNET_ADDRESS,
};

/** Returns the escrow contract address for a given chainId, or undefined if unsupported. */
export function getEscrowAddress(chainId: number): `0x${string}` | undefined {
  return ESCROW_ADDRESSES[chainId];
}

// Default export points to Arc Testnet for backwards compat with existing components.
// Components should use getEscrowAddress(chainId) for chain-aware routing.
export const USDC_ESCROW = {
  address: TESTNET_ADDRESS,
  abi: artifact.abi,
} as const;

export const ESCROW_STATUS = {
  0: 'Open',
  1: 'Released',
  2: 'Refunded',
} as const;

export type EscrowStatusNum = 0 | 1 | 2;

export interface EscrowData {
  id: bigint;
  sender: string;
  recipient: string;
  amount: bigint;
  description: string;
  status: EscrowStatusNum;
  createdAt: bigint;
}
