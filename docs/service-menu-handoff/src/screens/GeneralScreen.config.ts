export const GeneralScreenConfig = {
  id: 'general',
  title: 'Všeobecné',
  fields: [
    'deviceId',
    'version',
    'prices',
    'refundFee',
    'isContrast',
    'isInverseContrast',
    'language',
  ],
  quickActions: ['save', 'resetTouchpoint', 'restartApp'],
} as const;
