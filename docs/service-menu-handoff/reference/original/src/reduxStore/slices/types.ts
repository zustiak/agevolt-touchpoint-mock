import {StationConnectorModel} from '../../rqStore/hooks/bffApi';
import {ConnectorData} from '../../screens/Home/types';
import {Environment} from '../../screens/Settings/Mqtt/types';
import {Vehicle} from '../../screens/VehicleDetail/types';
import type {
  TouchpointInitData,
  TouchpointHelpdeskInfo,
} from '../../services/touchpointInit/types';

export type RfidIdentifier = {
  identifier: string;
  idTagInfo: {
    status: string;
    parentIdTag?: string;
  };
};

export type Config = {
  tag: string;
  prices: {[connectorId: number]: number};
  isContrast: boolean;
  isInverseContrast: boolean;
  refundFee: number;
  stationName?: string;
  language: string;
  vendor?: string;
  model?: string;
  serialNumber?: string;
  maxCurrent?: number;
  sampleInterval?: number;
  modbusEvmAddress?: number;
  modbusMeterAddress?: number;
  stationDeviceId?: string;
  connectorCount?: number;
  connectorModbusAddresses?: {
    meter1: number;
    evm1: number;
    meter2: number;
    evm2: number;
  };
  connectorPowers?: {[connectorId: number]: number};
  /** ⬇︎ NOVÉ: polia extrahované z init blocku pre SSOT */
  meterType?: string | null;
  meterS0count?: number | null;
  connectorMaxAmps?: Record<number, number>;
  /** DPH sadzba z init response (napr. 0.19 = 19 %) */
  vatRate?: number;
  /** Mena stanice z init response */
  currency?: string;
};

export type SelectedSpace = {
  id: string;
  name: string;
};

export type GeneralColumnUnit = {
  unit: string;
  multiplier: number;
};

export type GeneralColumnConfig = {
  pk: number;
  yup: string | null;
  type: string;
  view: string;
  units: GeneralColumnUnit[] | null;
  column: string;
  schema: string;
  fe_type: string;
  sql_type: string;
  invisible: number;
  render_as: string | null;
  value_label: number;
  order_number: number;
  dynamic_value: unknown;
  on_click_type: string | null;
  allowed_values: string[] | null;
  on_click_props: unknown;
  render_as_props: unknown;
  on_click_component: string | null;
  unit_default_index: number | null;
  allow_empty_columns: number;
  required_for_insert: number;
};

export type GeneralInsertUpdateDeleteConfig = {
  view: string | null;
  table: string;
  pk_colums: string[];
  schema_view: string | null;
  schema_table: string;
  delete_by_user: number;
  insert_by_user: number;
  update_by_user: number;
  delete_by_admin: number;
  insert_by_admin: number;
  update_by_admin: number;
  updatable_colums: string[] | null;
  insertable_colums: string[] | null;
  updatable_colums_by_user: string[] | null;
  insertable_colums_by_user: string[] | null;
  updatable_colums_by_admin: string[] | null;
  insertable_colums_by_admin: string[] | null;
  general_allowed_space_roles: string[] | null;
};

export type GeneralConfigView = {
  generalColumns: GeneralColumnConfig[];
  insertUpdateDelete: GeneralInsertUpdateDeleteConfig[];
};

export interface MainSliceProps {
  beAddress: string;
  /** ⬇︎ NOVÉ: voliteľná cesta pre OCPP backend */
  bePath?: string;
  isWebSocketServerRunning: boolean;
  ethernetIp: string;
  localServerPort?: number;
  isSecureWebSocket: boolean;
  sampleInterval?: number;
  tpSampleIntervalSec?: number;
  /** NOVÉ: verzia TP appky */
  tpVersion?: string;
  connectorPins: {[connectorId: number]: string};
  connectedConnectors: {[connectorId: number]: boolean};
  connectors: ConnectorData[];
  chargerType: string | null;
  chargingTimes: Record<number, number>;
  beWsWssType: string;
  bePort: number;
  shoudWebsocketAutostart: boolean;
  isMqttRunning: boolean;
  shoudMqttAutostart: boolean;
  mqttEnvironment: Environment;
  mqttDeviceId: string;
  mqttConnectionId: string;
  mqttPassword: string;
  /** URL adresa MQTT brokera z init odpovede */
  mqttBrokerUrl?: string;
  mqttTopicPublish?: string;
  mqttTopicSubscribe?: string;
  touchpointConfigured: boolean;
  rfidIdentifiers: RfidIdentifier[];
  isOnline: boolean;
  transactionIdsForApi: {[connectorId: number]: string};
  transactionIdsForApiByUuid: Record<
    string,
    {transactionId: string; connectorId?: number}
  >;
  config: Config;
  lastRefundTimestamp: number | null;
  selectedConnectors: StationConnectorModel[];
  liveSseByConnectorId: Record<string, ConnectorLiveStats>;
  tagOptions: TagOption[];
  selectedTagId: string | null;
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  selectedSpace: SelectedSpace | null;
  staySignedIn: boolean;
  hasRehydrated: boolean;
  generalConfigByView: Record<string, GeneralConfigView>;
  isFirmwareUpdating?: boolean;
  isModbusPollingSuspended?: boolean;
  /** Helpdesk kontaktné údaje z init response (info.emp.helpdesk) */
  helpdesk: TouchpointHelpdeskInfo | null;
}

export type BeAddressAction = {payload: string; type: string};
export type IsWebSocketServerRunningAction = {payload: boolean; type: string};
export type EthernetIpAction = {payload: string; type: string};
export type LocalServerPortAction = {payload: number; type: string};
export type SampleIntervalAction = {payload: number; type: string};
export type IsSecureWebSocketAction = {payload: boolean; type: string};
export type SetConnectorPinAction = {
  payload: {connectorId: number; pin: string};
  type: string;
};
export type UpdateConnectedConnectorsAction = {
  payload: {[connectorId: number]: boolean};
  type: string;
};
export type SetConfigAction = {payload: Config; type: string};

export type AuthTokenEntry = {
  connectorId?: number;
  token: string;
  refreshToken?: string | null;
};
export type AuthState = AuthTokenEntry[];

export type ConnectorLiveStats = {
  priceTotalDriverEur?: number;
  meterStartWh?: number;
  meterLastWh?: number;
  powerActiveImportW?: number;
  lastUpdateAt: number;
};

export type TagOption = {id: string; isDefault: boolean};

export type SetMqttDeviceIdAction = {payload: string; type: string};
export type SetMqttPasswordAction = {payload: string; type: string};
export type SetMqttConnectionIdAction = {payload: string; type: string};
export type SetTouchpointConfiguredAction = {payload: boolean; type: string};
export type SetIsModbusPollingSuspendedAction = {
  payload: boolean;
  type: string;
};
