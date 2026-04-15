/**
 * Dátová štruktúra odpovede z CMD 72 (EVM_FW_HW_INFO, 0x48) EV modulu (ConnectorsConfig).
 */
export interface ConnectorsConfigData {
  /** Sériové číslo modulu (string, 7 bytes) */
  serialNumber: string;
  /** Hardvérová adresa modulu (UINT16) */
  hardwareAddress: number;
  /** Typ hardvéru / názov binárky (string, 16 bytes) */
  hardwareType: string;
  /** Verzia firmware (string, 6 bytes) */
  firmwareVersion: string;
  /** Typ modulu (UINT16) */
  modulType: number;
  /** Objednávacie číslo (string, 10 bytes) */
  orderNumber: string;
  /** Výrobca (string, 10 bytes) */
  vendor: string;
  /** Verzia hardvéru (string, 5 bytes) */
  hardwareVersion: string;
  /** Verzia TFW (string, 6 bytes) */
  tfwVersion: string;
  /** Maximálny prúdový limit (UINT8, ampéry) */
  maxAmpsLimit: number;
  /** Minimálny prúdový limit (UINT8, ampéry) */
  minAmpsLimit: number;
  /** Intenzita svetla (UINT8) */
  lightIntensity: number;
  /** Simulácia elektromeru (UINT8) */
  simulateEnergyMeter: number;
  /** Permanentný zámok (UINT8) */
  permanentLock: number;
  /** Voľný režim (UINT8) */
  freeMode: number;
  /** LED režim (UINT8) */
  ledMode: number;
  /** Interval vzorkovania v sekundách (UINT8) */
  sampleInterval: number;
  /** Reziduálny prúd použitý (UINT8) */
  residualUsed: number;
  /** kWh na impulz (UINT16) */
  kwhPerImpulse: number;
}

/**
 * Modbus adresy pre jeden konektor – z `mainSlice.config.connectorModbusAddresses` (bez nových polí v Reduxe).
 */
export interface ConnectorModbusAddresses {
  readonly evmAddress: number;
  readonly meterAddress: number;
}

/**
 * Návratový typ hooku useConnectorsConfig.
 */
export interface ConnectorsConfigHookReturn {
  /** Načítané konfiguračné dáta modulu pre jednotlivé konektory (kľúč je connectorId: 1, 2) */
  configData: Record<number, ConnectorsConfigData | null>;
  /** Modbus adresy EV modulu a elektromera podľa konektora (z existujúcej konfigurácie) */
  modbusAddressesByConnector: Record<number, ConnectorModbusAddresses>;
  /** Indikátor načítania */
  isLoading: boolean;
  /** Chybová správa */
  errorMessage: string;
  /** Stavová správa */
  statusMessage: string;
  /** Funkcia na opätovné načítanie konfigurácie */
  readConfig: () => Promise<void>;
}
