import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useReadContract,
} from 'wagmi';
import { erc20Abi } from 'viem';
import { toast } from 'sonner';
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts';
import { parseAmount, Amount } from '@/onchain-money';
import { USDC_ESCROW, getEscrowAddress } from '@/contracts/escrow';
import { parseOnchainError } from '@/utils/errors';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  chainId?: number;
}

const springs = {
  sheet: { type: 'spring' as const, damping: 30, stiffness: 350, mass: 0.8 },
};

export default function CreateEscrowSheet({ open, onClose, onCreated, chainId: propChainId }: Props) {
  const TARGET_CHAIN_ID = propChainId ?? 5042002;
  const usdcFact = getUsdc(TARGET_CHAIN_ID)!;
  const USDC_ADDRESS = usdcFact.address as `0x${string}`;
  const escrowAddress = getEscrowAddress(TARGET_CHAIN_ID) ?? USDC_ESCROW.address;
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Deposit args are stored so the approve-success effect can fire the deposit
  // without relying on stale closure values.
  const pendingCreate = useRef<{
    recipient: `0x${string}`;
    amount: bigint;
    description: string;
  } | null>(null);

  // Guard flags so effects only fire once per tx lifecycle.
  const approveHandled = useRef(false);
  const createHandled = useRef(false);

  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = chainId !== TARGET_CHAIN_ID;

  // ---------- reads ----------

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, escrowAddress] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  });

  // ---------- approve write ----------

  const {
    writeContract: sendApprove,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveWriteError,
    reset: resetApprove,
  } = useWriteContract();

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveSuccess,
    isError: isApproveReceiptError,
  } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // ---------- create-escrow write ----------

  const {
    writeContract: sendCreate,
    data: createTxHash,
    isPending: isCreatePending,
    error: createWriteError,
    reset: resetCreate,
  } = useWriteContract();

  const {
    isLoading: isCreateConfirming,
    isSuccess: isCreateSuccess,
    isError: isCreateReceiptError,
  } = useWaitForTransactionReceipt({ hash: createTxHash });

  // ---------- derived state ----------

  const formattedBalance =
    usdcBalance !== undefined
      ? Amount.fromRaw(usdcBalance, usdcFact.decimals).toFixed(2)
      : null;

  const parsedAmount = (() => {
    try {
      return amount ? parseAmount(TARGET_CHAIN_ID, amount) : null;
    } catch {
      return null;
    }
  })();

  // allowance === undefined means the RPC hasn't responded yet — treat as
  // "needs approval" so we never skip the approve step.
  const needsApproval =
    parsedAmount !== null &&
    (allowance === undefined || allowance < parsedAmount.raw);

  const isValidForm =
    recipient.startsWith('0x') &&
    recipient.length === 42 &&
    parsedAmount !== null &&
    description.trim().length > 0;

  // Derive step purely from wagmi state — no manual step enum that can race
  // with wallet dispatches.
  const isApproving = isApprovePending || isApproveConfirming;
  const isDepositing = isCreatePending || isCreateConfirming;
  const isLoading = isApproving || isDepositing;
  const isDone = isCreateSuccess && !!createTxHash;

  // ---------- effects ----------

  // Approve confirmed → auto-fire deposit, no setState in the same microtask
  useEffect(() => {
    if (!isApproveSuccess || approveHandled.current) return;
    approveHandled.current = true;
    toast.success('USDC approved — confirming deposit...');
    void refetchAllowance().then(() => {
      const args = pendingCreate.current;
      if (!args) {
        toast.error('Lost deposit args — please try again.');
        return;
      }
      sendCreate({
        address: escrowAddress,
        abi: USDC_ESCROW.abi,
        functionName: 'createEscrow',
        args: [args.recipient, args.amount, args.description],
      });
    });
  }, [isApproveSuccess, refetchAllowance, sendCreate, escrowAddress]);

  // Approve receipt error
  useEffect(() => {
    if (!isApproveReceiptError || approveHandled.current) return;
    approveHandled.current = true;
    toast.error('Approval transaction failed. Please try again.');
  }, [isApproveReceiptError]);

  // Approve write rejected / wallet error
  useEffect(() => {
    if (!approveWriteError) return;
    const msg = parseOnchainError(approveWriteError);
    if (msg !== 'Transaction cancelled.') toast.error(msg);
    approveHandled.current = true;
  }, [approveWriteError]);

  // Create confirmed → notify parent
  useEffect(() => {
    if (!isCreateSuccess || createHandled.current || !createTxHash) return;
    createHandled.current = true;
    onCreated();
  }, [isCreateSuccess, createTxHash, onCreated]);

  // Create receipt error
  useEffect(() => {
    if (!isCreateReceiptError || createHandled.current) return;
    createHandled.current = true;
    toast.error('Deposit transaction failed. Please try again.');
  }, [isCreateReceiptError]);

  // Create write rejected / wallet error
  useEffect(() => {
    if (!createWriteError) return;
    const msg = parseOnchainError(createWriteError);
    if (msg !== 'Transaction cancelled.') toast.error(msg);
    createHandled.current = true;
  }, [createWriteError]);

  // ---------- handlers ----------

  const handleClose = () => {
    if (isLoading) return;
    setRecipient('');
    setAmount('');
    setDescription('');
    pendingCreate.current = null;
    approveHandled.current = false;
    createHandled.current = false;
    resetApprove();
    resetCreate();
    onClose();
  };

  const handleProceed = () => {
    if (!isValidForm || !parsedAmount || isLoading) return;
    if (wrongChain) {
      switchChain({ chainId: TARGET_CHAIN_ID });
      return;
    }

    const args = {
      recipient: recipient as `0x${string}`,
      amount: parsedAmount.raw,
      description,
    };
    pendingCreate.current = args;
    approveHandled.current = false;
    createHandled.current = false;

    if (needsApproval) {
      // Fire approve directly — do NOT call setStep or any other setState
      // before or after this call. Any synchronous state update between the
      // button click and writeContract reaching the wallet can cancel the
      // pending mutation before MetaMask shows the popup.
      sendApprove({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [escrowAddress, parsedAmount.raw],
      });
    } else {
      sendCreate({
        address: escrowAddress,
        abi: USDC_ESCROW.abi,
        functionName: 'createEscrow',
        args: [args.recipient, args.amount, args.description],
      });
    }
  };

  const chain = requireChain(TARGET_CHAIN_ID);
  const txUrl = createTxHash
    ? buildTxExplorerUrl(TARGET_CHAIN_ID, createTxHash)
    : null;

  // Status line shown while a tx is in-flight
  const statusLine = isApprovePending
    ? 'Check MetaMask — confirm USDC approval...'
    : isApproveConfirming
    ? 'Approval submitted, waiting for confirmation...'
    : isCreatePending
    ? 'Check MetaMask — confirm deposit...'
    : isCreateConfirming
    ? 'Deposit submitted, waiting for confirmation...'
    : null;

  // CTA label
  const chainName = TARGET_CHAIN_ID === 5042 ? 'Arc Mainnet' : 'Arc Testnet';
  const ctaLabel = wrongChain
    ? `Switch to ${chainName}`
    : isApprovePending
    ? 'Confirm in MetaMask...'
    : isApproveConfirming
    ? 'Confirming approval...'
    : isCreatePending
    ? 'Confirm in MetaMask...'
    : isCreateConfirming
    ? 'Confirming deposit...'
    : needsApproval
    ? 'Approve & Deposit USDC'
    : 'Deposit into Escrow';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
            style={{
              background: 'rgba(255,255,255,0.94)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              border: '1px solid var(--border)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            {/* spectral strip */}
            <div
              className="h-1"
              style={{
                background:
                  'linear-gradient(90deg, #60a5fa 0%, #a78bfa 50%, #34d399 100%)',
              }}
            />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-6 pt-3">
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <h2
                  className="display text-xl font-bold"
                  style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
                >
                  {isDone ? 'Escrow Created' : 'Create Escrow'}
                </h2>
                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 disabled:opacity-40"
                  aria-label="Close"
                >
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              {/* Success state */}
              {isDone ? (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div
                    className="flex size-14 items-center justify-center rounded-2xl"
                    style={{ background: 'rgba(26,128,71,0.1)' }}
                  >
                    <CheckCircle2
                      className="size-7"
                      style={{ color: 'var(--success)' }}
                    />
                  </div>
                  <div className="text-center">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: 'var(--ink)' }}
                    >
                      USDC deposited into escrow
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      Release to send funds to the recipient, or refund to
                      cancel.
                    </p>
                  </div>
                  {txUrl && (
                    <a
                      href={txUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: 'var(--accent-hover)' }}
                    >
                      View on {chain.name} Explorer
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  <button
                    onClick={handleClose}
                    className="mt-2 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: 'var(--accent)' }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                /* Form */
                <div className="flex flex-col gap-4">
                  {/* Recipient */}
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--muted)' }}
                    >
                      Recipient Address
                    </label>
                    <div
                      className="rounded-2xl p-3.5"
                      style={{
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <input
                        className="mono w-full bg-transparent text-sm outline-none placeholder:font-sans"
                        style={{
                          color: 'var(--ink)',
                          caretColor: 'var(--accent)',
                        }}
                        placeholder="0x..."
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value.trim())}
                        disabled={isLoading}
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--muted)' }}
                    >
                      Amount
                    </label>
                    <div
                      className="rounded-2xl p-3.5"
                      style={{
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <input
                        inputMode="decimal"
                        className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
                        style={{ color: 'var(--ink)' }}
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '');
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
                        }}
                        disabled={isLoading}
                      />
                      <div className="mt-1.5 flex items-center justify-between">
                        <span
                          className="text-xs font-medium"
                          style={{ color: 'var(--subtle)' }}
                        >
                          USDC
                        </span>
                        {formattedBalance !== null && (
                          <button
                            onClick={() => setAmount(formattedBalance ?? '')}
                            disabled={!formattedBalance || isLoading}
                            className="text-xs font-semibold disabled:opacity-40"
                            style={{ color: 'var(--accent-hover)' }}
                          >
                            Balance: {formattedBalance} · Max
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--muted)' }}
                    >
                      Description
                    </label>
                    <div
                      className="rounded-2xl p-3.5"
                      style={{
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <input
                        className="w-full bg-transparent text-sm outline-none"
                        style={{ color: 'var(--ink)' }}
                        placeholder="e.g. Freelance payment for logo design"
                        maxLength={120}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  {/* Steps hint */}
                  {needsApproval && !isLoading && (
                    <div
                      className="flex items-start gap-2 rounded-xl p-3"
                      style={{
                        background: 'rgba(16,97,166,0.06)',
                        border: '1px solid rgba(16,97,166,0.12)',
                      }}
                    >
                      <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--accent-hover)' }}>1</div>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>Two steps required</p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          MetaMask will show two popups: first approve USDC spending, then deposit into escrow.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* In-flight status */}
                  {statusLine && (
                    <div
                      className="flex items-center gap-2.5 rounded-xl p-3"
                      style={{
                        background: 'rgba(16,97,166,0.06)',
                        border: '1px solid rgba(16,97,166,0.15)',
                      }}
                    >
                      <Loader2
                        className="size-4 shrink-0 animate-spin"
                        style={{ color: 'var(--accent-hover)' }}
                      />
                      <p
                        className="text-xs font-medium"
                        style={{ color: 'var(--accent-hover)' }}
                      >
                        {statusLine}
                      </p>
                    </div>
                  )}

                  {/* CTA */}
                  <button
                    disabled={!isValidForm || isLoading}
                    onClick={handleProceed}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        {ctaLabel}
                      </span>
                    ) : (
                      ctaLabel
                    )}
                  </button>
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
