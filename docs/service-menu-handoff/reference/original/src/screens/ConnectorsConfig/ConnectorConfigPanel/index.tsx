import React, {FC, useMemo} from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import ItemDetail from '../../../components/ItemDetail';
import {useAppSelector} from '../../../reduxStore';
import {useModbusEvm, useModbusMeter} from '../../../services/tpVariables/hooks';
import {styles as parentStyles} from '../styles';
import {formatHardwareAddress} from '../utils';
import type {ConnectorsConfigData} from '../types';
import type {ConnectorConfigPanelProps} from './types';
import {
  formatTotalEnergyFromWh,
  formatTripleNumeric,
  translateEvmCommState,
  translateMeterCommState,
} from './utils';

/** Spoločné props pre ItemDetail (predvolene jeden riadok label | hodnota). */
type ConnectorsConfigItemDetailShared = {
  isContrast: boolean;
  nameStyle: object;
  valueTextStyle: object;
};

const renderIdentificationSection = (
  data: ConnectorsConfigData,
  t: ReturnType<typeof useTranslation>['t'],
  textColor: string,
  shared: ConnectorsConfigItemDetailShared,
) => (
  <View>
    <Text
      style={[
        parentStyles.sectionTitle,
        shared.isContrast && {color: textColor},
      ]}>
      {t('connectorsConfig.sectionIdentification')}
    </Text>
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.serialNumber')}:`}
      value={data.serialNumber}
      topRadius
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.hardwareAddress')}:`}
      value={formatHardwareAddress(data.hardwareAddress)}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.hardwareType')}:`}
      value={data.hardwareType}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.orderNumber')}:`}
      value={data.orderNumber}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.vendor')}:`}
      value={data.vendor}
      bottomRadius
    />
  </View>
);

const renderVersionSection = (
  data: ConnectorsConfigData,
  t: ReturnType<typeof useTranslation>['t'],
  textColor: string,
  shared: ConnectorsConfigItemDetailShared,
) => (
  <View>
    <Text
      style={[
        parentStyles.sectionTitle,
        shared.isContrast && {color: textColor},
      ]}>
      {t('connectorsConfig.sectionVersions')}
    </Text>
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.firmwareVersion')}:`}
      value={data.firmwareVersion}
      topRadius
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.hardwareVersion')}:`}
      value={data.hardwareVersion}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.tfwVersion')}:`}
      value={data.tfwVersion}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.modulType')}:`}
      value={data.modulType}
      bottomRadius
    />
  </View>
);

const renderParametersSection = (
  data: ConnectorsConfigData,
  t: ReturnType<typeof useTranslation>['t'],
  textColor: string,
  shared: ConnectorsConfigItemDetailShared,
) => (
  <View>
    <Text
      style={[
        parentStyles.sectionTitle,
        shared.isContrast && {color: textColor},
      ]}>
      {t('connectorsConfig.sectionParameters')}
    </Text>
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.maxAmpsLimit')}:`}
      value={`${data.maxAmpsLimit} A`}
      topRadius
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.minAmpsLimit')}:`}
      value={`${data.minAmpsLimit} A`}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.lightIntensity')}:`}
      value={data.lightIntensity}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.sampleInterval')}:`}
      value={`${data.sampleInterval} s`}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.kwhPerImpulse')}:`}
      value={data.kwhPerImpulse}
      bottomRadius
    />
  </View>
);

const renderFlagsSection = (
  data: ConnectorsConfigData,
  t: ReturnType<typeof useTranslation>['t'],
  textColor: string,
  shared: ConnectorsConfigItemDetailShared,
) => (
  <View>
    <Text
      style={[
        parentStyles.sectionTitle,
        shared.isContrast && {color: textColor},
      ]}>
      {t('connectorsConfig.sectionFlags')}
    </Text>
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.simulateEnergyMeter')}:`}
      value={data.simulateEnergyMeter ? 'ON' : 'OFF'}
      topRadius
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.permanentLock')}:`}
      value={data.permanentLock ? 'ON' : 'OFF'}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.freeMode')}:`}
      value={data.freeMode ? 'ON' : 'OFF'}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.ledMode')}:`}
      value={data.ledMode}
    />
    <ItemDetail
      {...shared}
      name={`${t('connectorsConfig.residualUsed')}:`}
      value={data.residualUsed ? 'ON' : 'OFF'}
      bottomRadius
    />
  </View>
);

/**
 * Jeden konektor na obrazovke ConnectorsConfig: RS-485 adresy, CMD 72 a runtime elektromer.
 */
const ConnectorConfigPanel: FC<ConnectorConfigPanelProps> = ({
  connectorId,
  data,
  evmModbusAddress,
  meterModbusAddress,
  showConnectorTitle,
  isContrast,
  textColor,
}) => {
  const {t, i18n} = useTranslation();
  const isPhysicalModbusEnergyMeter = useAppSelector(
    s => s.tpVariablesSlice.station.modbusMeter ?? false,
  );
  const isSimulatedEnergyMeter = !isPhysicalModbusEnergyMeter;
  const meterRuntime = useModbusMeter(connectorId);
  const evmRuntime = useModbusEvm(connectorId);

  const nameStyle = useMemo(() => ({fontSize: 22, color: textColor}), [textColor]);
  const valueTextStyle = useMemo(
    () => ({fontSize: 22, color: textColor}),
    [textColor],
  );

  const sharedDetailProps = useMemo<ConnectorsConfigItemDetailShared>(
    () => ({
      isContrast,
      nameStyle,
      valueTextStyle,
    }),
    [isContrast, nameStyle, valueTextStyle],
  );

  const lastResponseLabel = useMemo(() => {
    if (meterRuntime.lastResponse === null) {
      return '—';
    }
    const d = new Date(meterRuntime.lastResponse);
    return d.toLocaleString(i18n.language);
  }, [meterRuntime.lastResponse, i18n.language]);

  const phaseEnergyLabel = useMemo(() => {
    const ep = meterRuntime.energyPhase;
    return `${formatTripleNumeric(ep, 3)} kWh`;
  }, [meterRuntime.energyPhase]);

  return (
    <View style={parentStyles.connectorContainer}>
      {showConnectorTitle && (
        <Text
          style={[
            parentStyles.connectorTitle,
            isContrast && {color: textColor},
          ]}>
          {t('chargingPaper.connector').toUpperCase()} {connectorId}
        </Text>
      )}
      {!data ? (
        <Text style={parentStyles.errorText}>
          {t('connectorsConfig.readFailedForConnector', {
            connectorId,
          })}
        </Text>
      ) : (
        <>
          <View>
            <Text
              style={[
                parentStyles.sectionTitle,
                isContrast && {color: textColor},
              ]}>
              {t('connectorsConfig.sectionCommunication')}
            </Text>
            <ItemDetail
              {...sharedDetailProps}
              name={`${t('connectorsConfig.evmModbusAddress')}:`}
              value={String(evmModbusAddress)}
              topRadius
            />
            <ItemDetail
              {...sharedDetailProps}
              isTwoRows
              name={`${t('connectorsConfig.evmCommState')}:`}
              value={translateEvmCommState(t, evmRuntime.state)}
            />
            {isSimulatedEnergyMeter ? (
              <ItemDetail
                {...sharedDetailProps}
                isTwoRows
                name={`${t('connectorsConfig.meterSimulatedRowLabel')}:`}
                value={t('connectorsConfig.meterSimulatedRowValue')}
                bottomRadius
              />
            ) : (
              <>
                <ItemDetail
                  {...sharedDetailProps}
                  name={`${t('connectorsConfig.meterModbusAddress')}:`}
                  value={String(meterModbusAddress)}
                />
                <ItemDetail
                  {...sharedDetailProps}
                  isTwoRows
                  name={`${t('connectorsConfig.meterCommState')}:`}
                  value={translateMeterCommState(t, meterRuntime.state)}
                  bottomRadius
                />
              </>
            )}
          </View>

          {renderIdentificationSection(
            data,
            t,
            textColor,
            sharedDetailProps,
          )}
          {renderVersionSection(data, t, textColor, sharedDetailProps)}
          {renderParametersSection(data, t, textColor, sharedDetailProps)}
          {renderFlagsSection(data, t, textColor, sharedDetailProps)}

          <View>
            <Text
              style={[
                parentStyles.sectionTitle,
                isContrast && {color: textColor},
              ]}>
              {isSimulatedEnergyMeter
                ? t('connectorsConfig.sectionEnergyPowerLive')
                : t('connectorsConfig.sectionEnergyMeter')}
            </Text>
            <ItemDetail
              {...sharedDetailProps}
              name={`${t('connectorsConfig.meterEnergyTotal')}:`}
              value={formatTotalEnergyFromWh(meterRuntime.energy)}
              topRadius
            />
            <ItemDetail
              {...sharedDetailProps}
              name={`${t('connectorsConfig.meterPowerTotal')}:`}
              value={`${Math.round(meterRuntime.power)} W`}
            />
            {isSimulatedEnergyMeter ? (
              <ItemDetail
                {...sharedDetailProps}
                isTwoRows
                name={`${t('connectorsConfig.liveDataLastResponse')}:`}
                value={lastResponseLabel}
                bottomRadius
              />
            ) : (
              <>
                <ItemDetail
                  {...sharedDetailProps}
                  isTwoRows
                  name={`${t('connectorsConfig.meterVoltagePhases')}:`}
                  value={`${formatTripleNumeric(meterRuntime.voltagePhase, 1)} V`}
                />
                <ItemDetail
                  {...sharedDetailProps}
                  isTwoRows
                  name={`${t('connectorsConfig.meterCurrentPhases')}:`}
                  value={`${formatTripleNumeric(meterRuntime.currentPhase, 2)} A`}
                />
                <ItemDetail
                  {...sharedDetailProps}
                  isTwoRows
                  name={`${t('connectorsConfig.meterPowerPhases')}:`}
                  value={`${formatTripleNumeric(meterRuntime.powerPhase, 0)} W`}
                />
                <ItemDetail
                  {...sharedDetailProps}
                  isTwoRows
                  name={`${t('connectorsConfig.meterEnergyPhases')}:`}
                  value={phaseEnergyLabel}
                />
                <ItemDetail
                  {...sharedDetailProps}
                  isTwoRows
                  name={`${t('connectorsConfig.meterLastResponse')}:`}
                  value={lastResponseLabel}
                  bottomRadius
                />
              </>
            )}
            {meterRuntime.state === 'UNAVAILABLE' &&
              meterRuntime.lastResponse === null && (
                <Text
                  style={[
                    parentStyles.statusText,
                    {fontSize: 18, marginTop: 8},
                    isContrast && {color: textColor},
                  ]}>
                  {t('connectorsConfig.meterNoModbusHint')}
                </Text>
              )}
          </View>
        </>
      )}
    </View>
  );
};

export default ConnectorConfigPanel;
