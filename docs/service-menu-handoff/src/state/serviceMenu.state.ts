export interface ServiceMenuConfigState {
  prices: Record<number, number>;
  refundFee: number;
  isContrast: boolean;
  isInverseContrast: boolean;
  language: 'sk' | 'en';
  vendor?: string;
  model?: string;
  serialNumber?: string;
  maxCurrent?: number;
  connectorModbusAddresses?: {
    meter1: number;
    evm1: number;
    meter2: number;
    evm2: number;
  };
}

export interface ServiceMenuConnectivityState {
  ocpp: {
    url: string | null;
    connected: boolean;
    lastError: string | null;
    phase: string;
  };
  mqtt: {
    url: string | null;
    connected: boolean;
    lastError: string | null;
    phase: string;
  };
  modbusInitialized: boolean;
}

export interface ServiceMenuRuntimeState {
  hasActiveCharging: boolean;
  currentFirmwareVersions: Record<number, string>;
  connectorsConfig: Record<number, unknown>;
}
