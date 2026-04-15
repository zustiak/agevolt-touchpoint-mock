export const SERVICE_MENU_ROUTES = {
  support: 'Support',
  settings: 'Settings',
  general: 'General',
  integrations: 'Integrations',
  mqtt: 'Mqtt',
  browser: 'Browser',
  firmwareUpdate: 'FirmwareUpdate',
  connectorsConfig: 'ConnectorsConfig',
} as const;

export type ServiceMenuRouteName =
  (typeof SERVICE_MENU_ROUTES)[keyof typeof SERVICE_MENU_ROUTES];

export type ServiceMenuRouteParams = {
  Support: undefined;
  Settings: undefined;
  General: undefined;
  Integrations: undefined;
  Mqtt: undefined;
  Browser: { webAddress?: string } | undefined;
  FirmwareUpdate:
    | { firmwareUrl?: string; mqttAutoStart?: boolean; connectorId?: number }
    | undefined;
  ConnectorsConfig: undefined;
};
