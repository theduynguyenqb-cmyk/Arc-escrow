import { useState, useCallback } from 'react';
import { Plus, Inbox, Loader2, ShieldCheck, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useReadContracts, useReadContract } from 'wagmi';
import { erc20Abi, type Abi } from 'viem';
import { TokenUSDC } from '@web3icons/react';
import { getUsdc } from '@/onchain-facts';
import { Amount } from '@/onchain-money';
import { USDC_ESCROW, getEscrowAddress, EscrowData } from '@/contracts/escrow';
import CreateEscrowSheet from './CreateEscrowSheet';
import EscrowCard from './EscrowCard';

const ARC_MAINNET = 5042;
const ARC_TESTNET = 5042002;

type NetworkId = 'mainnet' | 'testnet';
const NETWORKS: { id: NetworkId; label: string; chainId: number }[] = [
  { id: 'mainnet', label: 'Mainnet', chainId: ARC_MAINNET },
  { id: 'testnet', label: 'Testnet', chainId: ARC_TESTNET },
];

const ESCROW_ABI = USDC_ESCROW.abi as Abi;

type Role = 'sent' | 'received';
type Filter = 'All' | 'Open' | 'Released' | 'Refunded';
const FILTERS: Filter[] = ['All', 'Open', 'Released', 'Refunded'];
const STATUS_MAP: Record<Filter, number | null> = { All: null, Open: 0, Released: 1, Refunded: 2 };

// How many total escrows to scan when looking for received ones.
// Keeps the RPC batch bounded; increase if needed.
const MAX_SCAN = 500;

export default function EscrowDashboard() {
  const { address, isConnected } = useAccount();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [role, setRole] = useState<Role>('sent');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkId>('mainnet');

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const net = NETWORKS.find((n) => n.id === selectedNetwork)!;
  const activeChainId = net.chainId;
  const usdcFact = getUsdc(activeChainId)!;
  const usdcAddress = usdcFact.address as `0x${string}`;
  const escrowAddress = getEscrowAddress(activeChainId)!;

  // ── USDC balance ──────────────────────────────────────────────────────────
  const { data: usdcBalance, isLoading: balanceLoading } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: activeChainId,
    scopeKey: `balance-${refreshKey}-${activeChainId}`,
    query: { enabled: !!address },
  });

  // ── SENT: escrow IDs by sender ────────────────────────────────────────────
  const { data: sentIds, isLoading: sentIdsLoading } = useReadContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'getEscrowsBySender',
    args: address ? [address] : undefined,
    chainId: activeChainId,
    scopeKey: `sentIds-${refreshKey}-${activeChainId}`,
    query: { enabled: !!address },
  });

  const sentIdList = (sentIds as bigint[] | undefined) ?? [];

  const { data: sentRaw, isLoading: sentLoading } = useReadContracts({
    contracts: sentIdList.map((id) => ({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'getEscrow',
      args: [id],
      chainId: activeChainId,
    })),
    query: { enabled: sentIdList.length > 0 },
    scopeKey: `sent-${sentIdList.join(',')}-${refreshKey}-${activeChainId}`,
  });

  const sentEscrows: EscrowData[] = (sentRaw ?? [])
    .filter((r) => r.status === 'success')
    .map((r) => r.result as EscrowData)
    .reverse();

  // ── RECEIVED: scan total count, batch-read, filter by recipient ───────────
  const { data: escrowCountRaw, isLoading: countLoading } = useReadContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'escrowCount',
    chainId: activeChainId,
    scopeKey: `count-${refreshKey}-${activeChainId}`,
    query: { enabled: !!address && role === 'received' },
  });

  const totalCount = Number((escrowCountRaw as bigint | undefined) ?? 0n);
  const scanCount = Math.min(totalCount, MAX_SCAN);
  // IDs are 1-based; scan the latest `scanCount` IDs
  const scanIds: bigint[] = Array.from(
    { length: scanCount },
    (_, i) => BigInt(totalCount - i),
  );

  const { data: receivedRaw, isLoading: receivedLoading } = useReadContracts({
    contracts: scanIds.map((id) => ({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'getEscrow',
      args: [id],
      chainId: activeChainId,
    })),
    query: { enabled: role === 'received' && scanIds.length > 0 && !!address },
    scopeKey: `received-${totalCount}-${refreshKey}-${activeChainId}`,
  });

  const receivedEscrows: EscrowData[] = (receivedRaw ?? [])
    .filter((r) => r.status === 'success')
    .map((r) => r.result as EscrowData)
    .filter((e) => e.recipient.toLowerCase() === address?.toLowerCase());

  // ── Active list based on role ─────────────────────────────────────────────
  const activeEscrows = role === 'sent' ? sentEscrows : receivedEscrows;
  const filtered =
    filter === 'All'
      ? activeEscrows
      : activeEscrows.filter((e) => e.status === STATUS_MAP[filter]);

  const isLoadingEscrows =
    role === 'sent'
      ? sentIdsLoading || sentLoading
      : countLoading || receivedLoading;

  // ── Stats (always based on sent escrows for the balance card) ─────────────
  const openCount = sentEscrows.filter((e) => e.status === 0).length;
  const totalLocked = sentEscrows
    .filter((e) => e.status === 0)
    .reduce((acc, e) => acc + e.amount, 0n);
  const pendingReceived = receivedEscrows.filter((e) => e.status === 0).length;

  const formattedBalance =
    usdcBalance !== undefined
      ? Amount.fromRaw(usdcBalance, usdcFact.decimals).toFixed(2)
      : null;
  const formattedLocked = Amount.fromRaw(totalLocked, usdcFact.decimals).toFixed(2);

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-10 px-4 py-3"
        style={{
          background: 'rgba(249,249,252,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <TokenUSDC variant="branded" size={22} />
            <span
              className="display text-[15px] font-bold"
              style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              USDC Escrow
            </span>
          </div>

          {/* Network toggle */}
          <div
            className="flex items-center rounded-xl p-0.5 gap-0.5"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
          >
            {NETWORKS.map((n) => {
              const active = selectedNetwork === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setSelectedNetwork(n.id);
                    setFilter('All');
                    setRole('sent');
                  }}
                  className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs font-semibold transition-all"
                  style={
                    active
                      ? {
                          background: n.id === 'mainnet' ? 'var(--accent)' : '#e8f0fb',
                          color: n.id === 'mainnet' ? '#fff' : 'var(--accent-hover)',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                        }
                      : { color: 'var(--muted)', background: 'transparent' }
                  }
                >
                  <span
                    className="size-1.5 rounded-full shrink-0"
                    style={{
                      background: active
                        ? n.id === 'mainnet' ? '#86efac' : '#93c5fd'
                        : 'var(--border)',
                    }}
                  />
                  Arc {n.label}
                </button>
              );
            })}
          </div>

          <ConnectKitButton />
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
        {!isConnected ? (
          /* ── Not connected ─────────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-6 pt-16 text-center">
            <div
              className="flex size-20 items-center justify-center rounded-[28px]"
              style={{
                background: 'var(--surface-strong)',
                border: '1px solid var(--border)',
                boxShadow: '0 2px 16px rgba(18,45,69,0.06)',
              }}
            >
              <TokenUSDC variant="branded" size={40} />
            </div>
            <div className="max-w-xs">
              <h1
                className="display text-2xl font-bold"
                style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
              >
                USDC Escrow
              </h1>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                Create trustless escrows on Arc. Deposit USDC, release to the recipient, or refund
                yourself — no intermediary needed.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 w-full max-w-xs">
              <ConnectKitButton label="Connect Wallet to Start" />
              <div className="flex items-center gap-1.5" style={{ color: 'var(--subtle)' }}>
                <ShieldCheck className="size-3.5" />
                <span className="text-xs">Non-custodial · Onchain · Trustless</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ── Balance card ──────────────────────────────────────────── */}
            <section
              className="mb-3 overflow-hidden rounded-3xl"
              style={{
                background: 'var(--surface-strong)',
                border: '1px solid var(--border)',
                boxShadow: '0 2px 12px rgba(18,45,69,0.05)',
              }}
            >
              <div className="px-5 pt-5 pb-4">
                <div className="mb-3 flex items-center gap-1.5">
                  <TokenUSDC variant="branded" size={16} />
                  <span
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--muted)' }}
                  >
                    Balance on Arc {net.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="display text-[2.6rem] font-bold tabular-nums leading-none"
                    style={{ color: 'var(--ink)' }}
                  >
                    {balanceLoading ? (
                      <span
                        className="inline-block h-10 w-28 animate-pulse rounded-xl"
                        style={{ background: 'var(--surface-muted)' }}
                      />
                    ) : (
                      formattedBalance ?? '—'
                    )}
                  </span>
                  <span className="text-base font-semibold" style={{ color: 'var(--subtle)' }}>
                    USDC
                  </span>
                </div>
              </div>

              {(sentEscrows.length > 0 || pendingReceived > 0) && (
                <div
                  className="grid grid-cols-3 divide-x border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {[
                    { label: 'Sent Open', value: String(openCount) },
                    { label: 'Locked', value: `${formattedLocked} USDC` },
                    { label: 'Awaiting Me', value: String(pendingReceived) },
                  ].map(({ label, value }) => (
                    <div key={label} className="px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--muted)' }}
                      >
                        {label}
                      </p>
                      <p
                        className="display mt-0.5 text-sm font-bold tabular-nums"
                        style={{ color: 'var(--ink)' }}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── New Escrow CTA ────────────────────────────────────────── */}
            <button
              onClick={() => setSheetOpen(true)}
              className="mb-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 2px 12px rgba(18,45,69,0.18)',
              }}
            >
              <Plus className="size-4" strokeWidth={2.5} />
              New Escrow
            </button>

            {/* ── Role tabs: Sent / Received ────────────────────────────── */}
            <div
              className="mb-4 flex rounded-2xl p-1 gap-1"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
            >
              {(
                [
                  { id: 'sent' as Role, label: 'Sent by me', icon: ArrowUpRight },
                  { id: 'received' as Role, label: 'Received', icon: ArrowDownLeft },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const active = role === id;
                const count = id === 'sent' ? sentEscrows.length : receivedEscrows.length;
                return (
                  <button
                    key={id}
                    onClick={() => { setRole(id); setFilter('All'); }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all"
                    style={
                      active
                        ? {
                            background: 'var(--surface-strong)',
                            color: 'var(--ink)',
                            boxShadow: '0 1px 4px rgba(18,45,69,0.08)',
                          }
                        : { color: 'var(--muted)', background: 'transparent' }
                    }
                  >
                    <Icon className="size-3.5" strokeWidth={2.5} />
                    {label}
                    {count > 0 && (
                      <span
                        className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
                        style={{
                          background: active ? 'var(--accent)' : 'var(--border)',
                          color: active ? '#fff' : 'var(--muted)',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Status filter chips ───────────────────────────────────── */}
            {activeEscrows.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {FILTERS.map((f) => {
                  const count =
                    f === 'All'
                      ? activeEscrows.length
                      : activeEscrows.filter((e) => e.status === STATUS_MAP[f]).length;
                  const active = filter === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all"
                      style={
                        active
                          ? {
                              background: 'var(--accent)',
                              color: '#fff',
                              boxShadow: '0 1px 6px rgba(18,45,69,0.15)',
                            }
                          : {
                              background: 'var(--surface-strong)',
                              color: 'var(--ink-2)',
                              border: '1px solid var(--border)',
                            }
                      }
                    >
                      {f}
                      <span
                        className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums"
                        style={{ background: active ? 'rgba(255,255,255,0.2)' : 'var(--border)' }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Escrow list ───────────────────────────────────────────── */}
            {isLoadingEscrows ? (
              <div
                className="flex items-center justify-center gap-2 py-16"
                style={{ color: 'var(--muted)' }}
              >
                <Loader2 className="size-5 animate-spin" />
                <span className="text-sm">
                  {role === 'received' ? 'Scanning for received escrows…' : 'Loading escrows…'}
                </span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div
                  className="flex size-14 items-center justify-center rounded-2xl"
                  style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
                >
                  <Inbox className="size-6" style={{ color: 'var(--subtle)' }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                  {role === 'received'
                    ? filter === 'All'
                      ? 'No received escrows'
                      : `No ${filter.toLowerCase()} received escrows`
                    : filter === 'All'
                    ? 'No escrows yet'
                    : `No ${filter.toLowerCase()} escrows`}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {role === 'received'
                    ? "Escrows where your address is set as the recipient will appear here."
                    : filter === 'All'
                    ? 'Create your first escrow to get started.'
                    : 'Switch to "All" to see all escrows.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((e) => (
                  <EscrowCard
                    key={String(e.id)}
                    escrow={e}
                    chainId={activeChainId}
                    onActionDone={refresh}
                    viewerRole={role}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <CreateEscrowSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={() => {
          setSheetOpen(false);
          refresh();
        }}
        chainId={activeChainId}
      />
    </div>
  );
}
