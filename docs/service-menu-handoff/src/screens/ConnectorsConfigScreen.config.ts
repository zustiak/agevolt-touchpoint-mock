export const ConnectorsConfigScreenConfig = {
  id: 'connectorsConfig',
  title: 'Konfigurácia konektorov',
  sections: [
    'communication',
    'identification',
    'versions',
    'parameters',
    'flags',
    'energyMeter',
  ],
  quickActions: ['readAgain'],
  note: 'Before reading EVM config, suspend meter polling on RS-485.',
} as const;
