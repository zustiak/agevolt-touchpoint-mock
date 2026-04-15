import React, {FC, useState} from 'react';
import {Linking, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {styles} from './styles';
import {contrastStyles} from './contrastStyles';
import StanHeader from '../../components/StanHeader';
import StanButton from '../../components/StanButton';
import AppModal from '../../components/AppModal';
import AppTextInput from '../../components/AppTextInput';
import {navigationRef, SCREENS} from '../../navigation';
import {Icons} from '../../assets/SvgIcons';
import SvgUri from 'react-native-svg-uri';
import FastImage from 'react-native-fast-image';
import {supportLady} from '../../assets/images';
import {useAppSelector} from '../../reduxStore';
import {COLORS} from '../../utils/colors';
import {useErrorAlert} from '../../utils/AppAlertProvider';
import {CON_STATE} from '../../hooks/webSocketServer/utils';

const ADMIN_PASSWORD = 'h';

const SupportScreen: FC = () => {
  const {t} = useTranslation();

  /** kontrastný režim */
  const {isContrast} = useAppSelector(state => state.mainSlice.config);
  const c: Partial<typeof contrastStyles> = isContrast ? contrastStyles : {};
  const connectors = useAppSelector(state => state.mainSlice.connectors);
  /** redux – stationName z mainSlice (môže byť z BFF), helpdesk z tpVariablesSlice (z init) */
  const stationName = useAppSelector(
    state => state.mainSlice.config.stationName,
  );
  const operator = useAppSelector(state => state.tpVariablesSlice.operator);

  /** modal state */
  const [modalVisible, setModalVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const errorAlert = useErrorAlert();

  /** handlers */
  const callLiveAgent = () => {
    navigationRef.navigate(SCREENS.BROWSER, {
      webAddress:
        'https://agevolt.ladesk.com/scripts/inline_chat.php?cwid=3393y54b',
    });
  };
  const handleConfirm = () => {
    if (password === ADMIN_PASSWORD) {
      setModalVisible(false);
      setPassword('');
      setError('');
      navigationRef.navigate(SCREENS.SETTINGS);
    } else setError(t('wrongPassword'));
  };
  const closeModal = () => {
    setModalVisible(false);
    setPassword('');
    setError('');
  };

  const handleRightButtonPress = () => {
    /** aspoň jeden konektor má rozbehnutú transakciu → zákaz prechodu */
    const isAnyConnectorBusy: boolean = connectors.some(
      ({transactionId}) => transactionId != null,
    );

    if (isAnyConnectorBusy) {
      errorAlert(t('denied'), t('chargingOngoingError'));
      return;
    }

    // setModalVisible(true); // odkomentovat ak chcem ist cez heslo
    navigationRef.navigate(SCREENS.SETTINGS); // zakomentovat ak chcem ist cez heslo
  };

  /* ---------------- render ---------------- */
  return (
    <View style={[styles.content, c.content]}>
      <View style={[styles.mainView, c.card]}>
        <StanHeader
          statusText={isContrast ? t('support') : stationName || ''}
          onRightButtonPress={handleRightButtonPress}
          isLeftBack
          icon={Icons.ShieldMan}
          iconWidth={isContrast ? '33' : '22'}
          iconHeight={isContrast ? '33' : '22'}
        />

        {/* lady + headline */}
        <View style={styles.ladyView}>
          {!isContrast && (
            <FastImage
              style={styles.supportLady}
              source={supportLady}
              resizeMode={FastImage.resizeMode.contain}
            />
          )}
          <Text style={[styles.statusText, c.mainText]}>
            {t('isEverythingOkay')}
          </Text>
        </View>

        {/* bottom blocks */}
        <View style={styles.bottomView}>
          {/* failures */}
          <View style={[styles.customerSupportView, c.box]}>
            <View style={[styles.phoneView, c.badge]}>
              {!isContrast && (
                <SvgUri width="16" height="16" svgXmlData={Icons.Phone} />
              )}
              <Text style={[styles.hoursText, c.smallText]}>08:00 - 23:00</Text>
            </View>

            <Text style={[styles.customerSupportText, c.smallText]}>
              {t('helpForFailures').toUpperCase()}
            </Text>
            {operator?.helpdeskName ? (
              <Text style={[styles.helpdeskName, c.bigText]}>
                {operator.helpdeskName}
              </Text>
            ) : null}
            <Text style={[styles.mailText, c.bigText]}>
              {operator?.helpdeskNumber ?? '+421 2 221 222 11'}
            </Text>

            <StanButton
              text={t('call').toUpperCase()}
              onPress={callLiveAgent}
              customButtonStyle={[styles.callButton, c.stanButton]}
            />
          </View>

          {/* customer support */}
          <View style={[styles.customerSupportView, c.box]}>
            <Text style={[styles.customerSupportText, c.smallText]}>
              {t('customerSupport').toUpperCase()}
            </Text>
            {operator?.helpdeskName ? (
              <Text style={[styles.helpdeskName, c.bigText]}>
                {operator.helpdeskName}
              </Text>
            ) : null}
            <Text style={[styles.mailText, c.bigText]}>
              {operator?.helpdeskMail ?? 'support@agevolt.com'}
            </Text>
          </View>
        </View>
      </View>

      {/* ---------- modal ---------- */}
      <AppModal visible={modalVisible} closeModal={closeModal}>
        <View style={{paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24}}>
          <Text style={[styles.modalTitle, c.modalText]}>
            {t('enterAdminPassword')}
          </Text>

          <AppTextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={!!error}
            style={{marginTop: 12}}
            textInputStyle={[styles.textInputStyle, c.inputText]}
            onSubmitEditing={handleConfirm}
            autoCapitalize="none"
          />

          {error && (
            <Text style={[styles.errorText, {color: COLORS.totemPole}]}> 
              {error}
            </Text>
          )}

          <StanButton
            text={t('confirm').toUpperCase()}
            onPress={handleConfirm}
            customButtonStyle={[{marginTop: 20}, c.stanButton]}
          />
        </View>
      </AppModal>
    </View>
  );
};

export default SupportScreen;
