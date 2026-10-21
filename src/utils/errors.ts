export function parseOnchainError(error: unknown): string {
  const message = (error as { message?: string })?.message?.toLowerCase() ?? '';

  if (message.includes('user rejected') || message.includes('denied')) {
    return 'Transaction cancelled.';
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient balance. Please add funds and try again.';
  }
  if (message.includes('zeroaddressrecipient')) {
    return 'Recipient address cannot be zero.';
  }
  if (message.includes('amountmustbegreaterthan')) {
    return 'Amount must be greater than zero.';
  }
  if (message.includes('notescrowsender')) {
    return 'Only the escrow creator can perform this action.';
  }
  if (message.includes('escrownotopen')) {
    return 'This escrow is no longer open.';
  }
  if (message.includes('invalidescrowid')) {
    return 'Escrow not found.';
  }
  if (message.includes('reverted')) {
    return 'Transaction failed. Please try again.';
  }
  if (message.includes('network') || message.includes('timeout')) {
    return 'Network error. Please check your connection and retry.';
  }
  return 'Something went wrong. Please try again.';
}
