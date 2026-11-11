import type { VoiceCommand } from '../services/api/voiceCommands';

// Only the latest server snapshot decides price/status. Time fields stay in the command.
export function commandProductPresentation(command: VoiceCommand) {
  const snapshot =
    command.status === 'SUCCEEDED'
      ? command.result
      : (command.analysis_result ??
        command.preview.after ??
        command.preview.before);
  return {
    price:
      typeof snapshot?.effective_price === 'number' &&
      Number.isFinite(snapshot.effective_price) &&
      snapshot.effective_price >= 0
        ? snapshot.effective_price
        : command.status === 'READY' &&
            command.analysis_result &&
            typeof snapshot?.price === 'number' &&
            Number.isFinite(snapshot.price) &&
            snapshot.price >= 0
          ? snapshot.price
          : null,
    saleActive:
      typeof snapshot?.sale_active === 'boolean' ? snapshot.sale_active : null,
  };
}
