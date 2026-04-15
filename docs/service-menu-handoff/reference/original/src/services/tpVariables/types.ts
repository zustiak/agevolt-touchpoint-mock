import type {ChargePointStatus} from '../ocpp/types';

// ---------------------------------------------------------------------------
// Source of truth – podľa ENUM SOURCE sheetu
// ---------------------------------------------------------------------------

export type SourceOfTruth =
  | 'SYSTEM_VENDOR'
  | 'SYSTEM_ANDROID_NET'
  | 'SYSTEM_ANDROID_GPS'
  | 'SYSTEM_ANDROID_TRAFFIC'
  | 'INIT'
  | 'INIT_OCPP_KEY'
  | 'OCPP_KEY'
  | 'OCPP_RUNTIME'
  | 'EVM'
  | 'ELM'
  | 'ELM_OR_EVM'
  | 'DERIVED'
  | 'LOCAL_ACCUMULATOR';

export type AccessMode = 'R' | 'RW';

export type VariableValueType =
  | 'string'
  | 'boolean'
  | 'number'
  | 'json_array'
  | 'json_object'
  | 'datetime'
  | 'time';

// ---------------------------------------------------------------------------
// Variable definition (registry záznam)
// ---------------------------------------------------------------------------

export interface VariableDef {
  /** Číselné ID z Excelu */
  readonly id: number;
  /** Čitateľný kľúč, napr. 'system.online', 'connector.evm.cpV' */
  readonly key: string;
  readonly type: VariableValueType;
  readonly defaultValue: unknown;
  readonly persistent: boolean;
  readonly access?: AccessMode;
  readonly ocppKeyName?: string;
  readonly source: SourceOfTruth;
  /** Ak true, premenná existuje per-connector (connector[].xxx) */
  readonly perConnector: boolean;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Pravidlá zápisu podľa ENUM SOURCE
// ---------------------------------------------------------------------------
//
// 1. INIT + OCPP_KEY  → INIT = insert only, OCPP_KEY = upsert, OCPP_KEY má prednosť
// 2. Iba INIT          → INIT = upsert
// 3. OCPP_RUNTIME      → priamy zápis aktuálneho stavu
// 4. EVM / ELM         → lokálna Modbus komunikácia zapisuje aktuálny stav
// 5. DERIVED           → nikdy nie je source of truth; vždy sa počíta z iných
// 6. LOCAL_ACCUMULATOR → základ prírastku z runtime zdroja, výsledok persistuje

// ---------------------------------------------------------------------------
// System state
// ---------------------------------------------------------------------------

export interface SystemState {
  model: string | null;
  product: string | null;
  deviceId: string | null;
  cellularInternet: boolean;
  wifiInternet: boolean;
  ethernetInternet: boolean;
  activeNetwork: string | null;
  online: boolean;
  dataMetered: boolean;
  stationBound: boolean;
  ocppConnected: boolean;
  mqttConnected: boolean;
  stat: {
    net: {
      totalRxBytes: number;
      totalTxBytes: number;
      totalRxBytesLast: number;
      totalTxBytesLast: number;
    };
  };
  locationPoint: string | null;
  rs485ready: boolean;
  fwUpdate: {
    status: string;
    fileVersion: number;
    moduleProgress: number;
  };
  tpLifecycleState: TpLifecycleState;
}

export const TP_LIFECYCLE_STATE = {
  STARTING: 'STARTING',
  WAIT_INIT: 'WAIT_INIT',
  WAIT_OCPP_CONNECT: 'WAIT_OCPP_CONNECT',
  WAIT_OCPP_BOOT: 'WAIT_OCPP_BOOT',
  WAIT_OFFLINE_CACHE_SENDING: 'WAIT_OFFLINE_CACHE_SENDING',
  READY: 'READY',
} as const;

export type TpLifecycleState =
  (typeof TP_LIFECYCLE_STATE)[keyof typeof TP_LIFECYCLE_STATE];

export const FW_UPDATE_STATUS = {
  IDLE: 'IDLE',
  READY: 'READY',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

export type FwUpdateStatus =
  (typeof FW_UPDATE_STATUS)[keyof typeof FW_UPDATE_STATUS];

// ---------------------------------------------------------------------------
// Operator state
// ---------------------------------------------------------------------------

export interface OperatorState {
  paymentAllowed: boolean;
  ownerName: string | null;
  helpdeskNumber: string | null;
  /** Helpdesk meno (z init info.emp.helpdesk) */
  helpdeskName: string | null;
  /** Helpdesk e‑mail (z init info.emp.helpdesk) */
  helpdeskMail: string | null;
  appleStoreLink: string | null;
  androidStoreLink: string | null;
  chargingLink: string | null;
}

// ---------------------------------------------------------------------------
// Connectivity state
// ---------------------------------------------------------------------------

export interface MqttConnectivityState {
  url: string | null;
  topicPublish: string | null;
  topicSubscribe: string | null;
  connectionId: string | null;
  deviceId: string | null;
  password: string | null;
  user: string | null;
  /** Runtime stav — MQTT klient je pripojený */
  connected: boolean;
  /** Posledná chyba pripojenia */
  lastError: string | null;
}

export interface OcppConnectivityState {
  version: string | null;
  url: string | null;
  deviceId: string | null;
  basicAuth: string | null;
  registrationAccepted: boolean;
  serverTimeOffsetMs: number;
  heartbeatIntervalSec: number;
  bootRetryIntervalSec: number;
  /** Runtime stav — OCPP klient je pripojený (WebSocket OPEN) */
  connected: boolean;
  /** Posledná chyba pripojenia */
  lastError: string | null;
  keys: OcppKeysState;
}

export interface OcppKeysState {
  AllowOfflineTxForUnknownId: boolean;
  AuthorizationCacheEnabled: boolean;
  AuthorizeRemoteTxRequests: boolean;
  BlinkRepeat: number;
  ClockAlignedDataInterval: number;
  ConnectionTimeOut: number;
  GetConfigurationMaxKeys: number;
  HeartbeatInterval: number;
  LightIntensity: number;
  LocalAuthorizeOffline: boolean;
  LocalPreAuthorize: boolean;
  MaxEnergyOnInvalidId: number;
  MeterValuesAlignedData: string[];
  MeterValuesAlignedDataMaxLength: number;
  MeterValuesSampledData: string[];
  MeterValuesSampledDataMaxLength: number;
  MeterValueSampleInterval: number;
  MinimumStatusDuration: number;
  NumberOfConnectors: number;
  ResetRetries: number;
  ConnectorPhaseRotation: Record<number, string>;
  ConnectorPhaseRotationMaxLength: number;
  StopTransactionOnEVSideDisconnect: boolean;
  StopTransactionOnInvalidId: boolean;
  StopTxnAlignedData: string[];
  StopTxnAlignedDataMaxLength: number;
  StopTxnSampledData: string[];
  StopTxnSampledDataMaxLength: number;
  SupportedFeatureProfiles: string[];
  SupportedFeatureProfilesMaxLength: number;
  TransactionMessageAttempts: number;
  TransactionMessageRetryInterval: number;
  UnlockConnectorOnEVSideDisconnect: boolean;
  WebSocketPingInterval: number;
  LocalAuthListEnabled: boolean;
  LocalAuthListMaxLength: number;
  SendLocalListMaxLength: number;
  ReserveConnectorZeroSupported: boolean;
  ChargeProfileMaxStackLevel: number;
  ChargingScheduleAllowedChargingRateUnit: string[];
  ChargingScheduleMaxPeriods: number;
  ConnectorSwitch3to1PhaseSupported: boolean;
  MaxChargingProfilesInstalled: number;
}

export interface ConnectivityState {
  mqtt: MqttConnectivityState;
  ocpp: OcppConnectivityState;
  /** Runtime stav — Modbus (RS485) je inicializovaný */
  modbusInitialized: boolean;
}

// ---------------------------------------------------------------------------
// Station state
// ---------------------------------------------------------------------------

export interface StationState {
  boundSn: string | null;
  vendor: string | null;
  model: string | null;
  country: string | null;
  vatRate: number | null;
  defaultLanguage: string | null;
  timeZone: string | null;
  currency: string | null;
  fxToEurRate: number | null;
  modbusMeter: boolean;
  meterS0count: number;
  /** Počet konektorov z init (init.connectors.length) */
  connectorCount: number;
}

// ---------------------------------------------------------------------------
// Connector state (per connector, uložené v Redux)
// ---------------------------------------------------------------------------

export interface ConnectorEvmConfigState {
  lastResponse: string | null;
  budget: number;
  rcdEnabled: boolean;
  permanentLock: boolean;
  manual: {
    enabled: boolean;
    budget: number;
    do1: boolean;
    do2: boolean;
    lock: boolean;
    ignoreRcd: boolean;
    cpg: boolean;
  };
  fw: {
    version: number;
  };
  hwAddress: string | null;
  /** HW verzia z INIT odpovede (adresa 0x43), UINT16 */
  hwVersion: number;
  /** Block size z EVM init (CMD 65), použité pri FW update */
  blockSize: number;
}

export interface ConnectorPublicPolicyState {
  price: number | null;
  validTo: string | null;
  policyEndUtc: string | null;
  withoutTimeSchedule: boolean;
  scheduleActiveNow: boolean;
  validNow: boolean;
  schedule: unknown[] | null;
}

export interface ConnectorActiveTxState {
  /** Lokálne UUID pre offline tracking (nahradilo localId z csmsSlice) */
  id: string | null;
  /** Server-pridelené OCPP transactionId (z StartTransaction.conf) */
  transactionId: number | null;
  hasReachedCharging: boolean;
  /** Hodnota elektromera pri štarte transakcie (Wh) */
  meterStart: number | null;
  meterValueStartWh: number | null;
  meterValueEndWh: number | null;
  /** RFID / autorizačný tag (idTag z OCPP) */
  tagId: string | null;
  userId: string | null;
  avPolicyType: string | null;
  priceMeta: Record<string, unknown> | null;
  chargingTime: string | null;
  suspendedByUserTime: string | null;
  vatRate: number | null;
  costWithVat: number | null;
  /** ISO 8601 timestamp začiatku transakcie */
  chargingStartTs: string | null;
  chargingEndTs: string | null;
}

export interface ConnectorOcppState {
  status: ChargePointStatus;
  statusLastSent: ChargePointStatus | null;
  statusChangedAt: string | null;
}

export interface ConnectorMeterPersistState {
  lastResponse: string | null;
  energy: number;
  energyPhase: number[];
  voltagePhase: number[];
  power: number;
  powerPhase: number[];
  currentPhase: number[];
  countImp: number;
  countImpLast: number;
}

export interface ConnectorState {
  evm: ConnectorEvmConfigState;
  evseCpoId: string | null;
  powerType: string | null;
  phases: number | null;
  maxAmps: number | null;
  plugType: string | null;
  parkingSpot: string | null;
  hasPublicPolicy: boolean;
  hasEroamingHubject: boolean;
  eroamingEmpList: string[] | null;
  publicPolicy: ConnectorPublicPolicyState;
  activeTx: ConnectorActiveTxState;
  ocpp: ConnectorOcppState;
  /** Perzistentné meter hodnoty (sync z ModbusRuntimeBuffer) */
  meterPersist: ConnectorMeterPersistState;
}

// ---------------------------------------------------------------------------
// Modbus runtime buffer – vysokofrekvenčné dáta mimo Redux
// ---------------------------------------------------------------------------

export type EvmRuntimeState =
  | 'COM_ERR'
  | 'INIT'
  | 'FW_UPDATE'
  | 'MANUAL'
  | 'AVAILABLE';
export type MeterRuntimeState = 'COM_ERR' | 'AVAILABLE' | 'UNAVAILABLE';

export interface EvmRuntimeData {
  cpV: number;
  rcdErr: boolean;
  do1: boolean;
  do2: boolean;
  lock: boolean;
  cibEnabled: boolean;
  state: EvmRuntimeState;
  powerW: number;
  countImp: number;
}

export interface MeterRuntimeData {
  energy: number;
  energyPhase: number[];
  voltagePhase: number[];
  power: number;
  powerPhase: number[];
  currentPhase: number[];
  state: MeterRuntimeState;
  lastResponse: number | null;
}

export interface ModbusConnectorSnapshot {
  evm: EvmRuntimeData;
  meter: MeterRuntimeData;
  lastSyncedAt: number;
}

// ---------------------------------------------------------------------------
// Celkový stav tpVariablesSlice
// ---------------------------------------------------------------------------

export interface TpVariablesState {
  system: SystemState;
  operator: OperatorState;
  connectivity: ConnectivityState;
  station: StationState;
  connectors: Record<number, ConnectorState>;
  /**
   * Throttlovaná kópia z ModbusRuntimeBuffer.
   * BLACKLISTED z redux-persist – nepersistuje sa.
   */
  modbusSnapshot: Record<number, ModbusConnectorSnapshot>;
}

// ---------------------------------------------------------------------------
// OCPP key registry typy
// ---------------------------------------------------------------------------

export interface OcppKeyDef {
  /** Cesta v TpVariablesState, napr. 'connectivity.ocpp.keys.HeartbeatInterval' */
  readonly statePath: string;
  readonly access: AccessMode;
  readonly type: VariableValueType;
  /** Ak true, key je per-connector a statePath obsahuje {n} placeholder */
  readonly perConnector: boolean;
  readonly validate?: (value: unknown) => boolean;
}

// ---------------------------------------------------------------------------
// Listener typy pre ModbusRuntimeBuffer
// ---------------------------------------------------------------------------

export type ModbusBufferListener = () => void;
export type Unsubscribe = () => void;
