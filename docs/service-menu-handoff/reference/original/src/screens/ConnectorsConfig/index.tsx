import React, {FC} from 'react';
import {Text, View, ScrollView, ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {styles} from './styles';
import {useAppSelector} from '../../reduxStore';
import {COLORS} from '../../utils/colors';
import StanButton from '../../components/StanButton';
import StanHeader from '../../components/StanHeader';
import useConnectorsConfig from './useConnectorsConfig';
import ConnectorConfigPanel from './ConnectorConfigPanel';

/**
 * ConnectorsConfig Screen.
 * Zobrazuje konfiguračné údaje EV modulu načítané cez CMD 72 (EVM_FW_HW_INFO).
 * Štýl je zosúladený so Settings (tpClient.tsx) použitím ItemDetail.
 */
const ConnectorsConfig: FC = () => {
  const {t} = useTranslation();
  const {isContrast} = useAppSelector(s => s.mainSlice.config);

  const connectorCountFromStore = useAppSelector(
    s =>
      s.tpVariablesSlice.station.connectorCount ||
      Object.keys(s.tpVariablesSlice.connectors).length ||
      s.mainSlice.config?.connectorCount ||
      1,
  );

  const {
    configData,
    modbusAddressesByConnector,
    isLoading,
    errorMessage,
    statusMessage,
    readConfig,
  } = useConnectorsConfig();

  const bgColor = isContrast ? COLORS.contrastPrimary : COLORS.white;
  const textColor = isContrast ? COLORS.contrastSecondary : COLORS.darkGray;
  const borderColor = isContrast ? COLORS.contrastSecondary : COLORS.lightGray;

  return (
    <View style={[styles.container, {backgroundColor: bgColor}]}> 
      <StanHeader
        statusText={t('connectorsConfig.title')}
        isLeftBack
        spaceAfterBack={10}
      />
      <ScrollView
        contentContainerStyle={styles.scrollView}
        showsVerticalScrollIndicator={true}
        persistentScrollbar={true}>
        {statusMessage && !configData && (
          <Text style={[styles.statusText, {color: textColor}]}> 
            {statusMessage}
          </Text>
        )}

        {isLoading && (
          <ActivityIndicator
            size="large"
            color={isContrast ? COLORS.contrastSecondary : COLORS.primary}
          />
        )}

        {errorMessage !== '' && (
          <Text style={styles.errorText}>{errorMessage}</Text>
        )}

        {Object.entries(configData)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([cIdStr, data]) => {
            const connectorId = Number(cIdStr);
            const addresses = modbusAddressesByConnector[connectorId] ?? {
              evmAddress: 0,
              meterAddress: 0,
            };
            return (
              <ConnectorConfigPanel
                key={cIdStr}
                connectorId={connectorId}
                data={data}
                evmModbusAddress={addresses.evmAddress}
                meterModbusAddress={addresses.meterAddress}
                showConnectorTitle={connectorCountFromStore > 1}
                isContrast={isContrast}
                textColor={textColor}
              />
            );
          })}

        {!isLoading && (
          <StanButton
            text={t('connectorsConfig.readAgain').toUpperCase()}
            onPress={readConfig}
            disabled={isLoading}
            loading={isLoading}
            customButtonStyle={[
              styles.button,
              {
                backgroundColor: bgColor,
                borderColor,
                borderWidth: 3,
              },
            ]}
          />
        )}
      </ScrollView>
    </View>
  );
};

export default ConnectorsConfig;
