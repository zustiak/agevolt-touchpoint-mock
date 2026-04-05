export const SupportScreenConfig = {
  id: 'support',
  title: 'Podpora',
  sections: ['helpdesk', 'customerSupport'],
  quickActions: ['openHelpdeskChat', 'enterSettings'],
  guard: 'blockIfAnyConnectorHasActiveTransaction',
} as const;
