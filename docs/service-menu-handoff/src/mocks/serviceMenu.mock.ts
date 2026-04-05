import type {
  ConnectorsConfigRow,
  FirmwareUpdateData,
  GeneralScreenData,
  IntegrationsScreenData,
  SupportScreenData,
} from '../types/serviceMenu';

export const supportMock: SupportScreenData = {
  stationName: 'Default Station',
  helpdeskName: 'AgeVolt Helpdesk',
  helpdeskNumber: '+421 2 221 222 11',
  helpdeskMail: 'support@agevolt.com',
  hasActiveCharging: false,
};

export const generalMock: GeneralScreenData = {
  deviceId: 'TP-DEVICE-001',
  version: '4.6.0 (160)',
  prices: { 1: 0.5, 2: 0.5 },
  refundFee: 0.75,
  isContrast: true,
  isInverseContrast: false,
  language: 'sk',
};

export const integrationsMock: IntegrationsScreenData = {
  ocppStatus: 'OCPP_CONNECTED_STATE',
  mqttStatus: 'MQTT_CONNECT_ERROR',
  modbusInitialized: true,
  ocppUrl: 'ocpp.my.agevolt.com',
  ocppPort: 443,
  ocppPath: 'ocpp',
  meterValueSampleInterval: 10,
  vendor: 'AgeVolt',
  model: 'Touchpoint CSMS',
  stationSerialNumber: 'TP-001',
  maxCurrent: 32,
  connectorCount: 2,
  modbusAddresses: { meter1: 1, evm1: 2, meter2: 3, evm2: 4 },
};

export const firmwareMock: FirmwareUpdateData = {
  firmwareUrl: 'https://bucket/fw/C-EV-2505M-TP-115200+7.tfw',
  connectorId: 1,
  isDownloading: false,
  isDownloadComplete: true,
  fileName: 'C-EV-2505M-TP-115200+7.tfw',
  fileSize: 262144,
  fileVersion: '1.0.24',
  sendProgress: 57.3,
  isUpdatingFW: false,
  isCRCOK: true,
  currentFirmwareVersions: { 0: '5.3', 1: '5.3' },
};

export const connectorsConfigMock: Record<number, ConnectorsConfigRow> = {
  1: {
    serialNumber: 'TP123456',
    hardwareAddress: 2,
    hardwareType: 'C-EV-2505M-TP',
    firmwareVersion: '5.3',
    modulType: 1,
    orderNumber: 'ORD-000123',
    vendor: 'TECO',
    hardwareVersion: '1.0',
    tfwVersion: '2505M',
    maxAmpsLimit: 32,
    minAmpsLimit: 6,
    lightIntensity: 50,
    simulateEnergyMeter: 0,
    permanentLock: 0,
    freeMode: 0,
    ledMode: 1,
    sampleInterval: 10,
    residualUsed: 0,
    kwhPerImpulse: 1,
  },
};
