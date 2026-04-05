import type { ConnectorStatus } from './i18n';

export type StationCardAccessMode = 'private' | 'shared' | 'public';

export type MockVehicle = {
  id: string;
  plate: string;
  name?: string;
};

/** Priestor (workspace), kde má účet rolu správcu — výber pri párovaní karty. */
export type MockSpaceRole = 'admin' | 'owner';

export type MockSpace = {
  id: string;
  name: string;
  role: MockSpaceRole;
};

export type MockAccount = {
  id: string;
  login: string;
  password: string;
  driverName: string;
  driverEmail: string;
  /** Priestory s rolou Admin alebo Owner (mock). */
  spaces: MockSpace[];
  vehicles: MockVehicle[];
};

export type MockRfidCard = {
  uid: string;
  known: boolean;
  accountId?: string | null;
  /** Priestor, ku ktorému je karta priradená (mock po „Pridať kartu“). */
  spaceId?: string | null;
  vehicleId?: string | null;
  /** Ak true, karta je blokovaná (štart zakázaný). */
  blocked?: boolean;
  /** Nadradený RFID tag (pool / skupina) pre párovanie s TX. */
  parentTag?: string | null;
};

export type ConnectorRfidAccountPolicy = {
  accountId: string;
  allowedStart: boolean;
  accessMode: StationCardAccessMode;
  pricePerKwh?: number | null;
  priceLabel?: string | null;
  hasAdditionalFees?: boolean;
  denyReasonKey?: string | null;
};

export type StationCardSnapshot = {
  uid: string;
  known: boolean;
  blocked: boolean;
  card: MockRfidCard | null;
  /** Z mocku: parent tag karty (autorizácia voči TX.rfidTag / TX.parentTag). */
  cardParentTag: string | null;
  account: MockAccount | null;
  vehicle: MockVehicle | null;
  driverName: string | null;
  driverEmail: string | null;
};

export type StationConnectorDecision = {
  connectorId: string;
  parkingSpot: string;
  status: ConnectorStatus;
  txActive: boolean;
  linkedActiveTx: boolean;
  canMoreInfo: boolean;
  canStop: boolean;
  canStart: boolean;
  canStartRoaming: boolean;
  noAction: boolean;
  accessMode: StationCardAccessMode | 'eroaming' | null;
  priceLabel: string | null;
  pricePerKwh: number | null;
  denyReasonKey: string | null;
  /** Celková suma aktívnej TX na konektore (iba ak > 0), pre zobrazenie v RFID modáli. */
  txTotalCostLabel: string | null;
};
