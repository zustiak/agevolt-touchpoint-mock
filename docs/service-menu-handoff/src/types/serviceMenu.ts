export type ServiceRole = 'service' | 'admin';
export type ServiceMenuScreenId =
  | 'support'
  | 'settings'
  | 'general'
  | 'integrations'
  | 'mqtt'
  | 'browser'
  | 'firmwareUpdate'
  | 'connectorsConfig';

export type QuickActionId =
  | 'openHelpdeskChat'
  | 'enterSettings'
  | 'save'
  | 'resetTouchpoint'
  | 'restartApp'
  | 'connectOcpp'
  | 'disconnectOcpp'
  | 'connectModbus'
  | 'disconnectModbus'
  | 'connectMqtt'
  | 'disconnectMqtt'
  | 'openFirmwareUpdate'
  | 'openConnectorsConfig'
  | 'loadUrl'
  | 'downloadFirmware'
  | 'startUpdate'
  | 'stopUpdate'
  | 'readAgain';

export interface SupportScreenData {
  stationName: string;
  helpdeskName: string | null;
  helpdeskNumber: string | null;
  helpdeskMail: string | null;
  hasActiveCharging: boolean;
}

export interface GeneralScreenData {
  deviceId: string;
  version: string;
  prices: Record<number, number>;
  refundFee: number;
  isContrast: boolean;
  isInverseContrast: boolean;
  language: 'sk' | 'en';
}

export interface IntegrationsScreenData {
  ocppStatus: string;
  mqttStatus: string;
  modbusInitialized: boolean;
  ocppUrl: string;
  ocppPort: number;
  ocppPath: string;
  meterValueSampleInterval: number;
  vendor: string;
  model: string;
  stationSerialNumber: string;
  maxCurrent: number;
  connectorCount: number;
  modbusAddresses: {
    meter1: number;
    evm1: number;
    meter2: number;
    evm2: number;
  };
}

export interface FirmwareUpdateData {
  firmwareUrl?: string;
  connectorId?: number;
  isDownloading: boolean;
  isDownloadComplete: boolean;
  fileName: string;
  fileSize: number;
  fileVersion: string;
  sendProgress: number;
  isUpdatingFW: boolean;
  isCRCOK: boolean;
  currentFirmwareVersions: Record<number, string>;
}

export interface ConnectorsConfigRow {
  serialNumber: string;
  hardwareAddress: number;
  hardwareType: string;
  firmwareVersion: string;
  modulType: number;
  orderNumber: string;
  vendor: string;
  hardwareVersion: string;
  tfwVersion: string;
  maxAmpsLimit: number;
  minAmpsLimit: number;
  lightIntensity: number;
  simulateEnergyMeter: number;
  permanentLock: number;
  freeMode: number;
  ledMode: number;
  sampleInterval: number;
  residualUsed: number;
  kwhPerImpulse: number;
}
