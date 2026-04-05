import React, {FC, useEffect, useMemo, useState} from 'react';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {navigationRef, SCREENS} from '../../navigation';
import {styles} from './styles';
import {contrastStyles} from './contrastStyles';
import {
  store,
  updateConnectedConnectors,
  updateConnectors,
  useAppDispatch,
  useAppSelector,
} from '../../reduxStore';
import {useTranslation} from 'react-i18next';
import {ConnectorData} from './types';
import FastImage from 'react-native-fast-image';
import {csobLogo, homeBackground} from '../../assets/images';
import DateTimeDisplay from '../../components/DateTimeDisplay';
import {SvgXml} from 'react-native-svg';
import {Icons} from '../../assets/SvgIcons';
import {applyFillToSvg} from './utils';
import AlphaButton from '../../components/AlphaButton';
import ConnectorBox from '../../components/ConnectorBox/tpClient';
import connectorBoxStyles from '../../components/ConnectorBox/styles';
import RfidAuthTpClient from '../../components/RfidAuth/tpClient';
import {FontAwesomeIcon} from '@fortawesome/react-native-fontawesome';
import {faMobileScreenButton} from '@fortawesome/pro-light-svg-icons';
import {useIsFocused} from '@react-navigation/native';
import NfcManager from 'react-native-nfc-manager';
import {
  isConnectorStatusEligibleForRfidAuth,
  shouldSuppressAutoRfidModalOnConnectorConnect,
  usePrevious,
} from './utils';
import {modbusRuntime} from '../../services/tpVariables/modbusRuntime';
import {COLORS} from '../../utils/colors';
import StanButton from '../../components/StanButton';
import {toCents} from '../Charging/utils';
import {useOcpp} from '../../services/ocpp/OcppContext';
import {evm1, isModbusInitialized} from '../../services/modbus';

/**
 * Home Screen pre TOUCHPOINT_CLIENT.
 * Používa OcppContext namiesto useWebSocketServer a useMqtt.
 */
const HomeTpClientScreen: FC = () => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();
  const isFocused = useIsFocused();

  // OcppContext
  const {isConnected, connect} = useOcpp();
  // Aktívne transakcie z tpVariablesSlice (SSOT)
  const tpConnectors = useAppSelector(s => s.tpVariablesSlice.connectors);
  const stationBoundSn = useAppSelector(
    s => s.tpVariablesSlice.station.boundSn ?? '',
  );

  // Redux selectors
  const {isContrast, serialNumber, connectorModbusAddresses} = useAppSelector(
    state => state.mainSlice.config,
  );

  /** Rovnaká priorita ako Settings → Integrácie: boundSn, potom config.serialNumber */
  const mergedStationSerial = useMemo(
    () => stationBoundSn.trim() || serialNumber?.trim() || '',
    [stationBoundSn, serialNumber],
  );
  const connectorCount = useAppSelector(
    s =>
      s.tpVariablesSlice.station.connectorCount ??
      (Object.keys(s.tpVariablesSlice.connectors).length ||
        (s.mainSlice.config?.connectorCount ?? 1)),
  );
  const connectors = useAppSelector(state => state.mainSlice.connectors);
  const connectedConnectors = useAppSelector(
    state => state.mainSlice.connectedConnectors,
  );
  const chargerType = useAppSelector(state => state.mainSlice.chargerType);
  const sampleInterval = useAppSelector(
    state => state.mainSlice.sampleInterval,
  );

  const c: Partial<typeof contrastStyles> = isContrast ? contrastStyles : {};
  const prevConnected = usePrevious(connectedConnectors);

  // Local state
  const [isRfidModalVisible, setIsRfidModalVisible] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<number | null>(
    null,
  );
  const [isCarConnected, setIsCarConnected] = useState<boolean>(false);
  const [isModbusPolling, setIsModbusPolling] = useState(false);

  // Connect to OCPP on mount
  useEffect(() => {
    if (!isConnected) {
      connect();
    }
  }, []);

  // Handle connector connection changes
  useEffect(() => {
    if (!isFocused) return;

    const newlyConnected = Object.entries(connectedConnectors).find(
      ([id, connected]) =>
        connected &&
        (!prevConnected ||
          !prevConnected[id as unknown as keyof typeof prevConnected]),
    );

    if (newlyConnected) {
      const connectorId = Number(newlyConnected[0]);
      const tpConn = store.getState().tpVariablesSlice.connectors[connectorId];
      const cpV = modbusRuntime.getConnector(connectorId).evm.cpV;
      const suppressModal = shouldSuppressAutoRfidModalOnConnectorConnect({
        activeTxLocalId: tpConn?.activeTx?.id,
        ocppStatus: tpConn?.ocpp?.status ?? '',
        cpVoltageVolts: cpV,
      });
      if (suppressModal) {
        return;
      }
      setSelectedConnectorId(connectorId);
      setIsCarConnected(true);
      setIsRfidModalVisible(true);
      dispatch(updateConnectors([{connectorId, isActive: true}]));
    } else if (
      isRfidModalVisible &&
      selectedConnectorId !== null &&
      prevConnected &&
      prevConnected[selectedConnectorId] === true &&
      connectedConnectors[selectedConnectorId] === false
    ) {
      setIsRfidModalVisible(false);
      setIsCarConnected(false);
      setSelectedConnectorId(null);

      const allIds = Object.keys(connectedConnectors).map(id => ({
        connectorId: Number(id),
        isActive: false,
      }));
      dispatch(updateConnectors(allIds));
    }
  }, [connectedConnectors, isFocused]);

  /** Zatvorí RfidAuth, ak na vybranom konektore začala transakcia (napr. RemoteStart). */
  useEffect(() => {
    if (!isFocused || !isRfidModalVisible || selectedConnectorId === null) {
      return;
    }
    const activeConnectorId = selectedConnectorId;
    const row = connectors.find(c => c.connectorId === activeConnectorId);
    const hasActiveTransaction =
      row?.transactionId != null ||
      !!tpConnectors[activeConnectorId]?.activeTx?.id;
    if (!hasActiveTransaction) {
      return;
    }
    setIsRfidModalVisible(false);
    NfcManager.cancelTechnologyRequest();
    setSelectedConnectorId(null);
    setIsCarConnected(false);
    dispatch(
      updateConnectors([{connectorId: activeConnectorId, isActive: true}]),
    );
  }, [
    connectors,
    dispatch,
    isFocused,
    isRfidModalVisible,
    selectedConnectorId,
    tpConnectors,
  ]);

  const handleConnectorPress = (selectedConnector: ConnectorData): void => {
    const {status, connectorId, transactionId} = selectedConnector;

    // If there's an ongoing transaction, go to Authorization
    const hasOngoingSession =
      transactionId != null || !!tpConnectors[connectorId]?.activeTx?.id;
    if (hasOngoingSession) {
      dispatch(updateConnectors([{connectorId, isActive: true}]));
      navigationRef.navigate(SCREENS.AUTHORIZATION, {connectorId});
      return;
    }

    if (!isConnectorStatusEligibleForRfidAuth(status)) {
      return;
    }

    dispatch(updateConnectors([{connectorId, isActive: true}]));
    setSelectedConnectorId(connectorId);
    setIsCarConnected(!!connectedConnectors[connectorId]);
    setIsRfidModalVisible(true);
  };

  const handlePayAndCharge = (): void => {
    const id = selectedConnectorId || 1;
    const isCarConn = !!connectedConnectors[id];

    console.log('[HomeTpClient] handlePayAndCharge called', {id, isCarConn});

    // 1. Spustíme navigáciu OKAMŽITE, kým sú všetky dáta v state prítomné
    if (navigationRef.isReady()) {
      console.log('[HomeTpClient] Navigating now to SCREENS.PAY_CHARGE...');
      navigationRef.navigate(SCREENS.PAY_CHARGE, {
        connectorId: id,
        isCarConnected: isCarConn,
      });
    } else {
      console.error('[HomeTpClient] navigationRef is NOT ready!');
    }

    // 2. Modal zatvoríme a state vyčistíme až s miernym oneskorením
    // aby sa predišlo orezaniu parametrov navigácie pri resetovaní state
    setTimeout(() => {
      setIsRfidModalVisible(false);
      setSelectedConnectorId(null);
      setIsCarConnected(false);
    }, 150);
  };

  const handleCloseModal = (): void => {
    dispatch(
      updateConnectors([
        {connectorId: selectedConnectorId || 0, isActive: false},
      ]),
    );
    setIsRfidModalVisible(false);
    NfcManager.cancelTechnologyRequest();
  };

  const handleModalClose = (): void => {
    setIsRfidModalVisible(false);
    if (selectedConnectorId !== null) {
      dispatch(
        updateConnectedConnectors({
          [selectedConnectorId]: false,
        }),
      );
    }
    setSelectedConnectorId(null);
    setIsCarConnected(false);
  };

  // Build connectors based on connectorCount – cena iba z tpVariablesSlice (SSOT)
  const displayConnectors: ConnectorData[] = Array.from(
    {length: connectorCount ?? 1},
    (_, i) => {
      const connectorId = i + 1;
      const existingConnector = connectors.find(
        c => c.connectorId === connectorId,
      );
      const connectorPrice =
        tpConnectors[connectorId]?.publicPolicy?.price ?? undefined;
      return {
        ...(existingConnector || {
          connectorId,
          meterValues: [],
        }),
        price: connectorPrice,
      };
    },
  );

  return (
    <View style={[styles.container, c.container]}>
      {!isContrast && (
        <FastImage style={styles.backgroundImage} source={homeBackground} />
      )}

      {/* Top bar */}
      <View style={styles.topView}>
        <DateTimeDisplay />
        <SvgXml
          xml={applyFillToSvg(
            Icons.AgevoltPoveredBy,
            isContrast ? COLORS.contrastSecondary : COLORS.white,
          )}
          width={160}
          height={40}
        />
        <TouchableOpacity
          style={styles.phones}
          onPress={() => navigationRef.navigate(SCREENS.SUPPORT)}>
          <View style={styles.backgroundOverlay} />
          <SvgXml
            xml={applyFillToSvg(
              Icons.HeadPhones,
              isContrast ? COLORS.contrastSecondary : COLORS.white,
            )}
            width={isContrast ? 45 : 30}
            height={isContrast ? 55 : 40}
          />
        </TouchableOpacity>
      </View>

      {/* Title section */}
      {!isContrast && (
        <View>
          <Text style={styles.easyChargeText}>EasyCharge</Text>
          <Text style={styles.touchpointText}>TOUCHPOINT</Text>
        </View>
      )}

      {/* White board / main content */}
      <View style={[styles.whiteBoard, c.whiteBoard]}>
        {!isContrast && (
          <>
            <View style={styles.boardTop}>
              <View style={styles.boardTopLeft}>
                <View style={styles.station}>
                  <SvgXml xml={Icons.Station} width={16} height={16} />
                  <Text style={styles.charginStationText}>
                    {t('chargingStation').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.stationNameText}>
                  {mergedStationSerial || '—'}
                </Text>
              </View>
              <FastImage style={styles.csobImage} source={csobLogo} />
            </View>
          </>
        )}

        {/* Station serial number button for contrast mode */}
        {isContrast && mergedStationSerial.length > 0 && (
          <StanButton text={mergedStationSerial} onPress={() => {}} />
        )}

        {/* Connectors list */}
        <ScrollView contentContainerStyle={[styles.scrollview, c.scrollview]}>
          {displayConnectors.map(conn => (
            <ConnectorBox
              key={conn.connectorId}
              connectorData={conn}
              typeText={chargerType || '—'}
              isContrast={isContrast}
              onPress={() => handleConnectorPress(conn)}
            />
          ))}
          <TouchableOpacity
            activeOpacity={0.75}
            style={[
              connectorBoxStyles.container,
              styles.mobileChargeRow,
              isContrast && contrastStyles.cBox,
            ]}
            onPress={() => navigationRef.navigate(SCREENS.MOBILE_STATION_QR)}>
            <View style={connectorBoxStyles.topView}>
              <View
                style={[
                  styles.mobileChargeIconWrap,
                  isContrast && contrastStyles.mobileChargeIconWrap,
                ]}>
                <FontAwesomeIcon
                  icon={faMobileScreenButton}
                  size={isContrast ? 48 : 36}
                  color={
                    isContrast ? COLORS.contrastSecondary : COLORS.grape
                  }
                />
              </View>
              <View style={connectorBoxStyles.statusView}>
                <Text
                  style={[
                    styles.mobileChargeTitle,
                    isContrast && contrastStyles.mobileChargeTitle,
                  ]}>
                  {t('chargeWithMobileMultiline')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* RFID Auth Modal */}
      {isRfidModalVisible && (
        <RfidAuthTpClient
          onClose={handleCloseModal}
          isCarConnected={isCarConnected}
          connectorId={selectedConnectorId}
          // onPayAndCharge={handlePayAndCharge}
          onPayAndCharge={() => {}}
          closeModal={handleModalClose}
        />
      )}
    </View>
  );
};

export default HomeTpClientScreen;
