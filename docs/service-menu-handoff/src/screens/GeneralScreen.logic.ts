/**
 * Extracted behavior from Settings/General/tpClient.tsx.
 * This is not UI code. It is the behavior contract for a new screen.
 */
export interface SaveGeneralInput {
  prices: Record<number, string>;
  refundFee: string;
  isContrast: boolean;
  isInverseContrast: boolean;
  language: 'sk' | 'en';
}

export const normalizeGeneralInput = (input: SaveGeneralInput) => {
  const prices = Object.fromEntries(
    Object.entries(input.prices).map(([k, v]) => {
      const num = Number(String(v).replace(',', '.'));
      return [Number(k), Number.isNaN(num) ? 0 : num];
    }),
  );
  const refundFeeNum = Math.max(0, Number(input.refundFee.replace(',', '.')) || 0.75);
  return {
    prices,
    refundFee: refundFeeNum,
    isContrast: input.isContrast,
    isInverseContrast: input.isInverseContrast,
    language: input.language,
  };
};

export const generalQuickActions = {
  save: 'Persist config and restart app',
  resetTouchpoint: 'Reset touchpointConfigured + connectivity related state',
  restartApp: 'Immediate app restart',
} as const;
