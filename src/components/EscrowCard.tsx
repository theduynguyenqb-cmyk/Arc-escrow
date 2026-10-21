import { useState, useEffect } from 'react';
import { ArrowUpRight, RotateCcw, Loader2, ExternalLink, ChevronDown } from 'lucide-react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { Amount } from '@/onchain-money';
import { getEscrowAddress, USDC_ESCROW, ESCROW_STATUS, EscrowData } from '@/contracts/escrow';
import { parseOnchainError } from '@/utils/errors';

const USDC_DECIMALS = 6;

const statusConfig = {
  Open:     { bg: 'rgba(16,97,166,0.08)',   color: '#1061a6', dot: '#1061a6' },
  Released: { bg: 'rgba(26,128,71,0.08)',   color: '#1a8047', dot: '#1a8047' },
  Refunded: { bg: 'rgba(138,132,156,0.10)', color: '#6b6580', dot: '#8a849c' },
};

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDate(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface Props {
  escrow: EscrowData;
  chainId: number;
  onActionDone: () => void;
  /** 'sent' = viewer is the sender (show Release/Refund); 'received' = viewer is recipient (read-only) */
  viewerRole?: 'sent' | 'received';
}

export default function EscrowCard({ escrow, chainId, onActionDone, viewerRole = 'sent' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const statusLabel = ESCROW_STATUS[escrow.status];
  const sc = statusConfig[statusLabel];
  const isOpen = escrow.status === 0;
  const isSender = viewerRole === 'sent';

  const escrowAddress = getEscrowAddress(chainId) ?? USDC_ESCROW.address;
  const formattedAmount = Amount.fromRaw(escrow.amount, USDC_DECIMALS).toFixed(2);

  // Release
  const { writeContract: release, data: releaseTxHash, isPending: isReleasePending, error: releaseError, reset: resetRelease } =
    useWriteContract();
  const { isLoading: isReleaseConfirming, isSuccess: isReleaseSuccess } =
    useWaitForTransactionReceipt({ hash: releaseTxHash });

  // Refund
  const { writeContract: refund, data: refundTxHash, isPending: isRefundPending, error: refundError, reset: resetRefund } =
    useWriteContract();
  const { isLoading: isRefundConfirming, isSuccess: isRefundSuccess } =
    useWaitForTransactionReceipt({ hash: refundTxHash });

  useEffect(() => {
    if (isReleaseSuccess) { toast.success('Escrow released to recipient'); onActionDone(); resetRelease(); }
  }, [isReleaseSuccess, onActionDone, resetRelease]);

  useEffect(() => {
    if (isRefundSuccess) { toast.success('Escrow refunded to you'); onActionDone(); resetRefund(); }
  }, [isRefundSuccess, onActionDone, resetRefund]);

  useEffect(() => {
    if (releaseError) toast.error(parseOnchainError(releaseError));
  }, [releaseError]);

  useEffect(() => {
    if (refundError) toast.error(parseOnchainError(refundError));
  }, [refundError]);

  const isLoading = isReleasePending || isReleaseConfirming || isRefundPending || isRefundConfirming;
  const releaseTxUrl = releaseTxHash ? buildTxExplorerUrl(chainId, releaseTxHash) : null;
  const refundTxUrl  = refundTxHash  ? buildTxExplorerUrl(chainId, refundTxHash)  : null;

  // In received view, show the sender address instead of the recipient
  const counterpartyLabel = isSender ? 'Recipient' : 'Sender';
  const counterpartyAddr  = isSender ? escrow.recipient : escrow.sender;

  return (
    <div
      className="overflow-hidden rounded-2xl transition-all"
      style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', backdropFilter: 'blur(20px)' }}
    >
      {/* ── Row summary ── */}
      <button
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-black/[0.02]"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold tabular-nums"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
        >
          #{String(escrow.id)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="mono truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {isSender ? formatAddress(escrow.recipient) : formatAddress(escrow.sender)}
            </span>
            <span className="display shrink-0 text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {formattedAmount}{' '}
              <span className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs" style={{ color: 'var(--muted)' }}>
              {escrow.description || '—'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                {formatDate(escrow.createdAt)}
              </span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: sc.bg, color: sc.color }}
              >
                <span
                  className="mr-1 inline-block size-1.5 rounded-full"
                  style={{ background: sc.dot, verticalAlign: 'middle' }}
                />
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        <ChevronDown
          className="size-4 shrink-0 transition-transform"
          style={{ color: 'var(--subtle)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* ── Expanded detail ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                    {counterpartyLabel}
                  </p>
                  <p className="mono mt-0.5 text-xs break-all" style={{ color: 'var(--ink-2)' }}>
                    {counterpartyAddr}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Amount</p>
                  <p className="display mt-0.5 text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {formattedAmount} USDC
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Created</p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-2)' }}>{formatDate(escrow.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Status</p>
                  <span
                    className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: sc.bg, color: sc.color }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: sc.dot }} />
                    {statusLabel}
                  </span>
                </div>
                {/* In received view, always show who sent it */}
                {!isSender && (
                  <div className="col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Recipient (you)</p>
                    <p className="mono mt-0.5 text-xs break-all" style={{ color: 'var(--ink-2)' }}>{escrow.recipient}</p>
                  </div>
                )}
              </div>

              {(releaseTxUrl || refundTxUrl) && (
                <div className="mb-3">
                  <a
                    href={(releaseTxUrl ?? refundTxUrl) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    View transaction <ExternalLink className="size-3" />
                  </a>
                </div>
              )}

              {/* Action buttons — only shown to the sender on open escrows */}
              {isOpen && isSender && (
                <div className="flex gap-2">
                  <button
                    disabled={isLoading}
                    onClick={() => {
                      release({
                        address: escrowAddress,
                        abi: USDC_ESCROW.abi,
                        functionName: 'releaseEscrow',
                        args: [escrow.id],
                      });
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--success)' }}
                  >
                    {isReleasePending || isReleaseConfirming ? (
                      <><Loader2 className="size-3.5 animate-spin" /> {isReleasePending ? 'Confirm...' : 'Releasing...'}</>
                    ) : (
                      <><ArrowUpRight className="size-3.5" /> Release</>
                    )}
                  </button>
                  <button
                    disabled={isLoading}
                    onClick={() => {
                      refund({
                        address: escrowAddress,
                        abi: USDC_ESCROW.abi,
                        functionName: 'refundEscrow',
                        args: [escrow.id],
                      });
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
                  >
                    {isRefundPending || isRefundConfirming ? (
                      <><Loader2 className="size-3.5 animate-spin" /> {isRefundPending ? 'Confirm...' : 'Refunding...'}</>
                    ) : (
                      <><RotateCcw className="size-3.5" /> Refund</>
                    )}
                  </button>
                </div>
              )}

              {/* Received + open: informational only */}
              {isOpen && !isSender && (
                <div
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(16,97,166,0.06)', border: '1px solid rgba(16,97,166,0.12)' }}
                >
                  <p className="text-xs font-medium" style={{ color: 'var(--accent-hover)' }}>
                    Waiting for the sender to release or refund this escrow.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
