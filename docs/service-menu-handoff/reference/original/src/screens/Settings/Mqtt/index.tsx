import React, {FC, useState} from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Text,
  View,
  TextInput,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import AppButton from '../../../components/AppButton';
import StanButton from '../../../components/StanButton';
import ToggleButton from '../../../components/ToggleButton';
import ItemDetail from '../../../components/ItemDetail';
import Picker from '../../../components/Picker';
import AppTextInput from '../../../components/AppTextInput';
import RNRestart from 'react-native-restart';
import {styles} from './styles';
import {contrastStyles} from './contrastStyles';
import {COLORS} from '../../../utils/colors';
import {
  setIsMqttRunning,
  setMqttAutostart,
  setMqttDeviceId,
  setMqttEnvironment,
  useAppDispatch,
  useAppSelector,
} from '../../../reduxStore';
import useMqtt from '../../../hooks/mqtt/useMqtt';
import {environments, getValidationSchema} from './utils';
import * as Yup from 'yup';
import {Environment} from './types';

const Mqtt: FC = () => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();

  // kontrastný režim
  const {isContrast} = useAppSelector(s => s.mainSlice.config);
  const c: Partial<typeof contrastStyles> = isContrast ? contrastStyles : {};

  const isMqttRunning = useAppSelector(s => s.mainSlice.isMqttRunning);
  const shouldMqttAutostart = useAppSelector(
    s => s.mainSlice.shoudMqttAutostart,
  );
  const mqttEnvironment = useAppSelector(s => s.mainSlice.mqttEnvironment);
  const mqttDeviceIdFromStore = useAppSelector(s => s.mainSlice.mqttDeviceId);

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isEnvPickerVisible, setIsEnvPickerVisible] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<Environment>(
    mqttEnvironment || environments[0],
  );
  const [deviceId, setDeviceId] = useState<string>(mqttDeviceIdFromStore || '');
  const [deviceIdError, setDeviceIdError] = useState('');
  const [isAutostartMqtt, setIsAutostartMqtt] = useState(shouldMqttAutostart);

  const {start, stop} = useMqtt();

  const validateFields = (): boolean => {
    try {
      getValidationSchema(t).validateSync({deviceId}, {abortEarly: false});
      setDeviceIdError('');
      return true;
    } catch (error) {
      if (error instanceof Yup.ValidationError) {
        const errors = error.inner.reduce<Record<string, string>>(
          (acc, err) => {
            if (err.path) acc[err.path] = err.message;
            return acc;
          },
          {},
        );
        setDeviceIdError(errors.deviceId || '');
      }
      return false;
    }
  };

  const handleStartMqtt = async (): Promise<void> => {
    setIsStarting(true);
    if (validateFields()) {
      start(
        selectedEnv.brokerUrl,
        selectedEnv.brokerUsername,
        selectedEnv.brokerPassword,
        `station/agevolt/${deviceId}/#`,
      );
      dispatch(setMqttEnvironment(selectedEnv));
      dispatch(setMqttDeviceId(deviceId));
    }
    setIsStarting(false);
  };

  const handleStopMqtt = async (): Promise<void> => {
    setIsStopping(true);
    stop();
    dispatch(setIsMqttRunning(false));
    setIsStopping(false);
  };

  const handleRestartApp = (): void => {
    dispatch(setIsMqttRunning(false));
    RNRestart.Restart();
  };

  return (
    <View style={[styles.content, c.content]}>
      <KeyboardAvoidingView
        style={[styles.content, c.content]}
        behavior="height"
        keyboardVerticalOffset={120}>
        <ScrollView contentContainerStyle={[styles.scrollView, c.scrollView]}>
          <View>
            <ItemDetail
              name={t('mqttIsRunning')}
              value={isMqttRunning ? t('yes') : t('no')}
              topRadius
              bottomRadius
              isContrast={isContrast}
            />
          </View>

          {/* STOP MQTT */}
          {!isContrast ? (
            <AppButton
              name={t('stopMqtt')}
              gradientColor={[COLORS.primary, COLORS.secondary]}
              textColor={COLORS.white}
              onButtonPress={handleStopMqtt}
              loader={isStopping}
              loaderColor={COLORS.white}
              disabled={isStopping}
            />
          ) : (
            <StanButton
              text={t('stopMqtt').toUpperCase()}
              onPress={handleStopMqtt}
              loading={isStopping}
              customButtonStyle={[c.button]}
            />
          )}

          {/* výber prostredia */}
          <View style={styles.pickerWrapper}>
            <AppTextInput
              title={t('environment')}
              customPress={() => setIsEnvPickerVisible(vis => !vis)}
              value={selectedEnv.name}
              style={[styles.textInput, c.inputBox]}
              textInputStyle={c.inputText}
              dropdown
              editable={false}
              placeHolder={t('environment')}
              placeholderTextColor={COLORS.gray}
            />
          </View>

          {/* Device ID */}
          <View>
            <AppTextInput
              title={t('deviceId')}
              onChangeText={setDeviceId}
              value={deviceId}
              style={[styles.textInput, c.inputBox]}
              textInputStyle={c.inputText}
              autoCapitalize="none"
              returnKeyType="done"
              blurOnSubmit
              placeHolder={t('deviceId')}
              placeholderTextColor={COLORS.gray}
            />
            {deviceIdError ? (
              <Text style={[styles.errorText, c.error]}>{deviceIdError}</Text>
            ) : null}
          </View>

          {/* Autostart prepínač */}
          <View style={[styles.switchView, c.switchView]}>
            <Text style={[styles.secureEnabledText, c.label]}>
              {t('autostartMqttWhenAppRestarted')}
            </Text>
            <ToggleButton
              enable={isAutostartMqtt}
              onToggle={on => {
                setIsAutostartMqtt(on);
                dispatch(setMqttAutostart(on));
              }}
              isContrast={isContrast}
            />
          </View>

          {/* START MQTT */}
          {!isContrast ? (
            <AppButton
              name={t('startMqtt')}
              gradientColor={
                isMqttRunning || !selectedEnv
                  ? [COLORS.brightGray, COLORS.brightGray]
                  : [COLORS.primary, COLORS.secondary]
              }
              textColor={
                isMqttRunning || !selectedEnv ? COLORS.light_Gray : COLORS.white
              }
              onButtonPress={handleStartMqtt}
              loader={isStarting}
              loaderColor={COLORS.white}
              disabled={isStarting || isMqttRunning}
            />
          ) : (
            <StanButton
              text={t('startMqtt').toUpperCase()}
              onPress={handleStartMqtt}
              loading={isStarting}
              disabled={isStarting || isMqttRunning}
              customButtonStyle={[styles.startButton, c.button]}
            />
          )}

          {/* RESTART APP */}
          {!isContrast ? (
            <AppButton
              name={t('restartApp')}
              gradientColor={[COLORS.primary, COLORS.secondary]}
              textColor={COLORS.white}
              onButtonPress={handleRestartApp}
            />
          ) : (
            <StanButton
              text={t('restartApp').toUpperCase()}
              onPress={handleRestartApp}
              customButtonStyle={[c.button]}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Picker
        selectedItem={selectedEnv}
        onSelect={item => {
          setSelectedEnv(item);
          setIsEnvPickerVisible(false);
        }}
        pickerData={environments}
        visible={isEnvPickerVisible}
        onRequestClose={() => setIsEnvPickerVisible(false)}
      />
    </View>
  );
};

export default Mqtt;
