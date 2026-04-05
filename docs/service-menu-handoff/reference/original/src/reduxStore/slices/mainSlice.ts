import {createSlice, current, PayloadAction} from '@reduxjs/toolkit';
import {
  BeAddressAction,
  ConnectorLiveStats,
  EthernetIpAction,
  GeneralColumnConfig,
  GeneralInsertUpdateDeleteConfig,
  IsSecureWebSocketAction,
  IsWebSocketServerRunningAction,
  LocalServerPortAction,
  MainSliceProps,
  RfidIdentifier,
  SampleIntervalAction,
  SelectedSpace,
  SetConfigAction,
  SetConnectorPinAction,
  SetIsModbusPollingSuspendedAction,
  TagOption,
  UpdateConnectedConnectorsAction,
} from './types';
import {ConnectorData} from '../../screens/Home/types';
import {Environment} from '../../screens/Settings/Mqtt/types';
import {environments} from '../../screens/Settings/Mqtt/utils';
import {logDiff} from '../../hooks/webSocketServer/utils';
import {StationConnectorModel} from '../../rqStore/hooks/bffApi';
import {appConfig} from '../../../app.config';
import {Vehicle} from '../../screens/VehicleDetail/types';

const initialState: MainSliceProps = {
  beAddress: 'ocpp.my.agevolt.com',
  /** ⬇︎ NOVÉ */
  bePath: '',
  isWebSocketServerRunning: false,
  ethernetIp: '',
  localServerPort: 8443,
  isSecureWebSocket: true,
  sampleInterval: 10,
  tpSampleIntervalSec: 600,
  tpVersion: '',
  connectorPins: {},
  connectedConnectors: {},
  connectors: [],
  chargerType: null,
  chargingTimes: {},
  beWsWssType: 'wss',
  bePort: 443,
  shoudWebsocketAutostart: true,
  isMqttRunning: false,
  shoudMqttAutostart: false,
  mqttEnvironment: environments[0],
  mqttDeviceId: '',
  mqttConnectionId: '',
  mqttPassword: '',
  mqttBrokerUrl: '',
  mqttTopicPublish: '',
  mqttTopicSubscribe: '',
  touchpointConfigured: false,
  rfidIdentifiers: [],
  isOnline: true,
  transactionIdsForApi: {},
  config: {
    tag: 'NOA',
    prices: {1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5},
    isContrast: true,
    isInverseContrast: false,
    refundFee: 0.75,
    stationName: 'Default Station',
    language: appConfig.language,
    vendor: '',
    model: '',
    serialNumber: '',
    stationDeviceId: '',
    connectorCount: undefined,
    connectorModbusAddresses: {
      meter1: 1,
      evm1: 2,
      meter2: 3,
      evm2: 4,
    },
    connectorPowers: {},
  },
  lastRefundTimestamp: null,
  selectedConnectors: [],
  liveSseByConnectorId: {},
  tagOptions: [],
  selectedTagId: null,
  vehicles: [],
  selectedVehicle: null,
  selectedSpace: null,
  transactionIdsForApiByUuid: {},
  staySignedIn: true,
  hasRehydrated: false,
  generalConfigByView: {},
  isFirmwareUpdating: false,
  isModbusPollingSuspended: false,
  helpdesk: null,
};

export const mainSlice = createSlice({
  name: 'Main',
  initialState,
  reducers: {
    resetMainState: (): MainSliceProps => initialState,
    setStaySignedIn: (state, {payload}: PayloadAction<boolean>) => {
      state.staySignedIn = payload;
    },
    markRehydrated: state => {
      state.hasRehydrated = true;
    },

    setBeAddress: (state, action: BeAddressAction) => {
      state.beAddress = action.payload;
    },
    /** ⬇︎ NOVÉ: setter pre path */
    setBePath: (state, {payload}: PayloadAction<string | undefined>) => {
      state.bePath = payload ?? '';
    },

    setIsWebSocketServerRunning: (
      state,
      action: IsWebSocketServerRunningAction,
    ) => {
      state.isWebSocketServerRunning = action.payload;
    },
    setEthernetIp: (state, action: EthernetIpAction) => {
      state.ethernetIp = action.payload;
    },
    setLocalServerPort: (state, action: LocalServerPortAction) => {
      state.localServerPort = action.payload;
    },
    setIsSecureWebSocket: (state, action: IsSecureWebSocketAction) => {
      state.isSecureWebSocket = action.payload;
    },
    setSampleInterval: (state, action: SampleIntervalAction) => {
      state.sampleInterval = action.payload;
      state.config.sampleInterval = action.payload;
    },
    setTpSampleIntervalSec: (state, action: PayloadAction<number>) => {
      state.tpSampleIntervalSec = action.payload;
    },

    setTpVersion: (state, action: PayloadAction<string | undefined>) => {
      state.tpVersion = action.payload ?? '';
    },
    setConnectorPin: (state, action: SetConnectorPinAction) => {
      const {connectorId, pin} = action.payload;
      state.connectorPins[connectorId] = pin;
    },
    resetConnectorPins: state => {
      state.connectorPins = {};
    },

    updateConnectedConnectors: (
      state,
      action: UpdateConnectedConnectorsAction,
    ) => {
      state.connectedConnectors = {
        ...state.connectedConnectors,
        ...action.payload,
      };
    },
    updateConnectors: (state, {payload}: PayloadAction<ConnectorData[]>) => {
      const before = current(state.connectors);
      const merged = [...state.connectors];
      payload.forEach(updatedConnector => {
        const existingIndex = merged.findIndex(
          connector => connector.connectorId === updatedConnector.connectorId,
        );
        if (existingIndex !== -1)
          merged[existingIndex] = {
            ...merged[existingIndex],
            ...updatedConnector,
          };
        else merged.push(updatedConnector);
      });
      logDiff('mainSlice/updateConnectors', before, merged);
      state.connectors = merged;
    },
    updateChargerType: (state, action: PayloadAction<string | null>) => {
      state.chargerType = action.payload;
    },
    resetConnectors: state => {
      state.connectors = [];
    },
    updateChargingTime: (
      state,
      action: PayloadAction<{connectorId: number; chargingTime: number}>,
    ) => {
      const {connectorId, chargingTime} = action.payload;
      state.chargingTimes[connectorId] = chargingTime;
    },
    setBeWsWssType: (state, action: PayloadAction<string>) => {
      state.beWsWssType = action.payload;
    },
    setBePort: (state, action: PayloadAction<number>) => {
      state.bePort = action.payload;
    },
    setWebsocketAutostart: (state, action: PayloadAction<boolean>) => {
      state.shoudWebsocketAutostart = action.payload;
    },
    setIsMqttRunning: (state, action: PayloadAction<boolean>) => {
      state.isMqttRunning = action.payload;
    },
    setMqttAutostart: (state, action: PayloadAction<boolean>) => {
      state.shoudMqttAutostart = action.payload;
    },
    setMqttEnvironment: (state, action: PayloadAction<Environment>) => {
      state.mqttEnvironment = action.payload;
    },
    setMqttDeviceId: (state, action: PayloadAction<string>) => {
      state.mqttDeviceId = action.payload;
    },
    setMqttConnectionId: (state, action: PayloadAction<string>) => {
      state.mqttConnectionId = action.payload;
    },
    setMqttPassword: (state, action: PayloadAction<string>) => {
      state.mqttPassword = action.payload;
    },
    setMqttBrokerUrl: (state, action: PayloadAction<string>) => {
      state.mqttBrokerUrl = action.payload;
    },
    setTouchpointConfigured: (state, action: PayloadAction<boolean>) => {
      state.touchpointConfigured = action.payload;
    },
    addRfidIdentifier: (state, action: PayloadAction<RfidIdentifier>) => {
      const index = state.rfidIdentifiers.findIndex(
        record => record.identifier === action.payload.identifier,
      );
      if (index !== -1) {
        state.rfidIdentifiers[index] = action.payload;
        return;
      }
      if (state.rfidIdentifiers.length >= 1000) state.rfidIdentifiers.shift();
      state.rfidIdentifiers.push(action.payload);
    },
    removeRfidIdentifier: (state, action: PayloadAction<string>) => {
      state.rfidIdentifiers = state.rfidIdentifiers.filter(
        record => record.identifier !== action.payload,
      );
    },
    setIsOnline: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    setTransactionIdForApi: (
      state,
      action: PayloadAction<{
        connectorId?: number | null;
        connectorUUID?: string;
        transactionId: string;
      }>,
    ) => {
      const {connectorId, connectorUUID, transactionId} = action.payload;

      if (connectorUUID) {
        const numericId =
          typeof connectorId === 'number' && Number.isFinite(connectorId)
            ? connectorId
            : undefined;

        state.transactionIdsForApiByUuid[connectorUUID] = {
          transactionId,
          ...(numericId !== undefined ? {connectorId: numericId} : {}),
        };
        return;
      }

      if (typeof connectorId === 'number' && Number.isFinite(connectorId)) {
        state.transactionIdsForApi[connectorId] = transactionId;
      }
    },
    setConfig: (state, action: SetConfigAction) => {
      state.config = {
        ...state.config,
        ...action.payload,
      };
    },
    setLastRefundTimestamp: (
      state,
      {payload}: PayloadAction<number | null>,
    ) => {
      state.lastRefundTimestamp = payload;
    },
    setSelectedConnectors: (
      state,
      {payload}: PayloadAction<StationConnectorModel[]>,
    ) => {
      state.selectedConnectors = payload;
    },
    setStationName: (state, action: PayloadAction<string | undefined>) => {
      state.config.stationName = action.payload;
    },
    upsertConnectorLiveStats: (
      state,
      {
        payload,
      }: PayloadAction<{connectorUid: string; sample: ConnectorLiveStats}>,
    ) => {
      const previous = state.liveSseByConnectorId[payload.connectorUid] ?? {};
      state.liveSseByConnectorId = {
        ...state.liveSseByConnectorId,
        [payload.connectorUid]: {
          ...previous,
          ...payload.sample,
          lastUpdateAt: payload.sample.lastUpdateAt ?? Date.now(),
        },
      };
    },
    incrementChargingTime: (
      state,
      {payload}: PayloadAction<{connectorId: number; deltaSeconds?: number}>,
    ) => {
      const {connectorId, deltaSeconds = 1} = payload;
      const currentSeconds = state.chargingTimes[connectorId] ?? 0;
      state.chargingTimes[connectorId] = currentSeconds + deltaSeconds;
    },
    setTagOptions: (state, {payload}: PayloadAction<TagOption[]>) => {
      state.tagOptions = payload;
    },
    setSelectedTagId: (state, {payload}: PayloadAction<string | null>) => {
      state.selectedTagId = payload;
    },
    setVehicles: (state, {payload}: PayloadAction<Vehicle[]>) => {
      state.vehicles = payload;
    },
    setSelectedVehicle: (state, {payload}: PayloadAction<Vehicle | null>) => {
      state.selectedVehicle = payload;
    },
    setSelectedSpace: (
      state,
      {payload}: PayloadAction<SelectedSpace | null>,
    ) => {
      state.selectedSpace = payload;
    },
    setGeneralConfigForView: (
      state,
      {
        payload,
      }: PayloadAction<{
        viewKey: string;
        generalColumns: GeneralColumnConfig[];
        insertUpdateDelete: GeneralInsertUpdateDeleteConfig[];
      }>,
    ) => {
      state.generalConfigByView = {
        ...state.generalConfigByView,
        [payload.viewKey]: {
          generalColumns: payload.generalColumns,
          insertUpdateDelete: payload.insertUpdateDelete,
        },
      };
    },

    setStationDeviceId: (state, action: PayloadAction<string>) => {
      state.config.stationDeviceId = action.payload;
    },

    // CSMS Configuration setters
    setCsmsVendor: (state, {payload}: PayloadAction<string>) => {
      state.config.vendor = payload;
    },
    setCsmsModel: (state, {payload}: PayloadAction<string>) => {
      state.config.model = payload;
    },
    setCsmsSerialNumber: (state, {payload}: PayloadAction<string>) => {
      state.config.serialNumber = payload;
    },
    setCsmsMaxCurrent: (state, {payload}: PayloadAction<number>) => {
      state.config.maxCurrent = payload;
    },
    setModbusEvmAddress: (state, {payload}: PayloadAction<number>) => {
      state.config.modbusEvmAddress = payload;
      if (state.config.connectorModbusAddresses) {
        state.config.connectorModbusAddresses.evm1 = payload;
      }
    },
    setModbusMeterAddress: (state, {payload}: PayloadAction<number>) => {
      state.config.modbusMeterAddress = payload;
      if (state.config.connectorModbusAddresses) {
        state.config.connectorModbusAddresses.meter1 = payload;
      }
    },
    setModbusEvm2Address: (state, {payload}: PayloadAction<number>) => {
      if (state.config.connectorModbusAddresses) {
        state.config.connectorModbusAddresses.evm2 = payload;
      }
    },
    setModbusMeter2Address: (state, {payload}: PayloadAction<number>) => {
      if (state.config.connectorModbusAddresses) {
        state.config.connectorModbusAddresses.meter2 = payload;
      }
    },
    setIsFirmwareUpdating: (state, action: PayloadAction<boolean>) => {
      state.isFirmwareUpdating = action.payload;
    },
    setIsModbusPollingSuspended: (
      state,
      action: SetIsModbusPollingSuspendedAction,
    ) => {
      state.isModbusPollingSuspended = action.payload;
    },
  },
});

const {reducer} = mainSlice;
export const {
  resetMainState,
  setStaySignedIn,
  markRehydrated,
  setBeAddress,
  setBePath,
  setIsWebSocketServerRunning,
  setEthernetIp,
  setLocalServerPort,
  setIsSecureWebSocket,
  setSampleInterval,
  setTpSampleIntervalSec,
  setTpVersion,
  updateConnectedConnectors,
  updateConnectors,
  updateChargerType,
  resetConnectors,
  updateChargingTime,
  setBeWsWssType,
  setBePort,
  setWebsocketAutostart,
  setIsMqttRunning,
  setMqttAutostart,
  setMqttEnvironment,
  setMqttDeviceId,
  setMqttConnectionId,
  setMqttPassword,
  setMqttBrokerUrl,
  setTouchpointConfigured,
  addRfidIdentifier,
  removeRfidIdentifier,
  setIsOnline,
  setTransactionIdForApi,
  setConfig,
  setLastRefundTimestamp,
  setSelectedConnectors,
  setStationName,
  upsertConnectorLiveStats,
  incrementChargingTime,
  setTagOptions,
  setSelectedTagId,
  setVehicles,
  setSelectedVehicle,
  setSelectedSpace,
  setGeneralConfigForView,
  setCsmsVendor,
  setCsmsModel,
  setCsmsSerialNumber,
  setCsmsMaxCurrent,
  setModbusEvmAddress,
  setModbusMeterAddress,
  setModbusEvm2Address,
  setModbusMeter2Address,
  setStationDeviceId,
  setConnectorPin,
  resetConnectorPins,
  setIsFirmwareUpdating,
  setIsModbusPollingSuspended,
} = mainSlice.actions;

export default reducer;
