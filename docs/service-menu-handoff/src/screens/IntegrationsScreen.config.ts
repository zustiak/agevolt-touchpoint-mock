export const IntegrationsScreenConfig = {
  id: 'integrations',
  title: 'Integrácie',
  sections: ['status', 'ocpp', 'chargePointInfo', 'modbus'],
  quickActions: [
    'save',
    'connectOcpp',
    'disconnectOcpp',
    'connectModbus',
    'disconnectModbus',
    'connectMqtt',
    'disconnectMqtt',
    'openFirmwareUpdate',
    'openConnectorsConfig',
  ],
} as const;
