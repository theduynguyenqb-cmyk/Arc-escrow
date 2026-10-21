# USDC Escrow

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

A trustless USDC Escrow app on Arc (Testnet + Mainnet). Senders deposit USDC into escrow, then can release funds to the recipient or refund themselves. Each escrow has a unique ID, description, and status (Open / Released / Refunded).

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity ^0.8.20 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`.
- Wallet: injected (MetaMask, etc.)
- Chains: Arc Testnet (Chain ID: 5042002) + Arc Mainnet (Chain ID: 5042)
- Token: USDC (6 decimals), Address: 0x3600000000000000000000000000000000000000 (both chains)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Thin root, renders EscrowDashboard
- `src/components/EscrowDashboard.tsx` - Main dashboard, balance card, escrow list, filters (chain-aware)
- `src/components/EscrowCard.tsx` - Individual escrow card with release/refund actions (chain-aware)
- `src/components/CreateEscrowSheet.tsx` - Bottom sheet for creating a new escrow (approve + deposit flow, chain-aware)
- `src/contracts/escrow.ts` - Contract addresses (testnet + mainnet), ABI import, types
- `src/utils/errors.ts` - Onchain error parser

## Deployed Contracts

- **USDCEscrow** on Arc Mainnet
  - Address: `0x2581E9F39e5CBB83f00f091Ee4B3018F17dFd4Ab`
  - TxHash: `0x3f0900bcdaf6962a8351071deff67fe228071abba4491afaf358e15271bb0931`
  - Deployer: `0x47ade5805ba18bbf88051b6803e242f197a2afb5`
  - Metadata: `contracts/contract-metadata/USDCEscrow.json`

- **USDCEscrow** on Arc Testnet
  - Address: `0xed8c8c5ec0384b65ed54979f04e76d17265645ef`
  - Explorer: https://explorer.testnet.arc.io/address/0xed8c8c5ec0384b65ed54979f04e76d17265645ef
  - TxHash: `0xc1dfdb9f31c6a45c6aa2127c47ebc994f44268940bfc5744f8ccf5480224455c`
  - Metadata: `contracts/contract-metadata/USDCEscrow.json`

## To Run

```bash
bun install
bun run dev
```

## Contract Commands

```bash
bun run contracts:build   # forge build
bun run contracts:test    # forge test
```
