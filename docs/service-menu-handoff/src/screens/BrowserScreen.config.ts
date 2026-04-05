export const BrowserScreenConfig = {
  id: 'browser',
  title: 'Prehliadač',
  fields: ['webAddress', 'loadUrl'],
  quickActions: ['loadUrl'],
  security: {
    defaultMode: 'allowlistedOnly',
    allowFreeUrlOnlyForAdmin: true,
  },
} as const;
