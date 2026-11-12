import type { VoiceCommand } from '../services/api/voiceCommands';

export function confirmedListingId(command: VoiceCommand): number | null {
  // The voice engine serializes listing IDs as strings; images requires an integer.
  const value = command.result?.listing_id;
  const listingId = typeof value === 'string' && /^[0-9]+$/.test(value)
    ? Number(value)
    : value;
  return command.status === 'SUCCEEDED' &&
    typeof listingId === 'number' &&
    Number.isSafeInteger(listingId) &&
    listingId > 0
    ? listingId
    : null;
}

// Only the latest server snapshot decides price/status. Time fields stay in the command.
export function commandProductPresentation(command: VoiceCommand) {
  const previewing = ['READY', 'NEEDS_CONFIRMATION'].includes(command.status);
  if (!previewing && command.status !== 'SUCCEEDED')
    return { price: null, saleActive: null };
  const snapshot =
    command.status === 'SUCCEEDED'
      ? command.result
      : (command.preview.after ?? command.analysis_result);
  return {
    price:
      typeof snapshot?.effective_price === 'number' &&
      Number.isFinite(snapshot.effective_price) &&
      snapshot.effective_price >= 0
        ? snapshot.effective_price
        : previewing &&
            snapshot === command.analysis_result &&
            !['SALE_CREATE', 'SALE_UPDATE'].includes(command.intent ?? '') &&
            typeof snapshot?.price === 'number' &&
            Number.isFinite(snapshot.price) &&
            snapshot.price >= 0
          ? snapshot.price
          : null,
    saleActive:
      typeof snapshot?.sale_active === 'boolean' ? snapshot.sale_active : null,
  };
}
