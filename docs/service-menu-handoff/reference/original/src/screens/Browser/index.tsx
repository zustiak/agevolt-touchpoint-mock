import React, {FC, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import WebView from 'react-native-webview';
import FastImage from 'react-native-fast-image';
import {useTranslation} from 'react-i18next';
import AppTextInput from '../../components/AppTextInput';
import {styles} from './styles';
import {contrastStyles} from './contrastStyles';
import {rightArrow} from '../../assets/images';
import {COLORS} from '../../utils/colors';
import {useAppSelector} from '../../reduxStore';
import {BrowserProps} from './types';
import StanHeader from '../../components/StanHeader';
import {sendAppErrorEvent} from '../../services/mqtt/events';
import {SCREENS} from '../../navigation';

const BrowserScreen: FC<BrowserProps> = ({route}) => {
  const {t} = useTranslation();

  /* ---------- kontrastný režim ---------- */
  const {isContrast} = useAppSelector(s => s.mainSlice.config);
  const c: Partial<typeof contrastStyles> = isContrast ? contrastStyles : {};

  /* ---------- params & state ---------- */
  const webAddress = route?.params?.webAddress;
  const [address, setAddress] = useState<string>(webAddress || '');
  const [loadUrl, setLoadUrl] = useState<string>();
  const [key, setKey] = useState<number>(0);

  /* ---------- auto-load z parametra ---------- */
  useEffect(() => {
    if (webAddress) handleLoadPage();
  }, [webAddress]);

  /* ---------- helper komponenty ---------- */
  const renderLoader = () => (
    <View style={styles.webViewLoader}>
      <ActivityIndicator
        size="large"
        color={isContrast ? COLORS.contrastSecondary : COLORS.mortar}
      />
    </View>
  );

  const handleLoadPage = () => {
    if (address) {
      setKey(k => k + 1);
      setLoadUrl(address);
    }
  };

  const renderFallback = () => (
    <View style={[styles.defaultContent, c.defaultContent]}>
      <Text style={[styles.defaultText, c.defaultText]}>
        {t('noPageLoaded')}
      </Text>
    </View>
  );

  /* ---------- render ---------- */
  return (
    <KeyboardAvoidingView
      style={[styles.content, c.content]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.stanView]}>
        <StanHeader statusText={t('browser')} isLeftBack />
      </View>
      <View
        style={[
          {
            flexGrow: 1,
            top:
              webAddress && !isContrast
                ? -33
                : webAddress && isContrast
                ? 10
                : 0,
          },
          c.scrollView,
        ]}>
        {/* adresa + šípka (ak nemáme pevnú URL) */}
        {!webAddress && (
          <View style={[styles.rowView, c.rowView]}>
            <AppTextInput
              value={address}
              onChangeText={setAddress}
              editable
              style={[styles.textInput, c.inputBox]}
              textInputStyle={c.inputText}
              placeHolder={t('address')}
              placeholderTextColor={
                isContrast ? COLORS.contrastSecondary : COLORS.gray
              }
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleLoadPage}
              blurOnSubmit
            />
            {!isContrast && (
              <TouchableOpacity onPress={handleLoadPage}>
                <FastImage
                  style={styles.icon}
                  source={rightArrow}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </TouchableOpacity>
            )}
            {isContrast && <Text style={c.rightText}>➔</Text>}
          </View>
        )}
        {/* web-view alebo fallback */}
        <View style={[styles.webView, c.webView]}>
          {loadUrl ? (
            <WebView
              key={key}
              source={{uri: loadUrl}}
              allowsInsecureHttps
              mixedContentMode="always"
              originWhitelist={['*']}
              userAgent="Chrome/128.0.0.0 Mobile Safari/537.36"
              style={{flex: 1}}
              startInLoadingState
              renderLoading={renderLoader}
              onError={e => {
                sendAppErrorEvent(
                  e?.nativeEvent?.description || 'WebView error',
                  {
                    screenId: SCREENS.BROWSER,
                    scope: 'webview.onError',
                  },
                ).catch(() => {});
              }}
              onHttpError={e => {
                const msg = `HTTP ${e?.nativeEvent?.statusCode} – ${
                  e?.nativeEvent?.description || ''
                }`;
                sendAppErrorEvent(msg, {
                  screenId: SCREENS.BROWSER,
                  scope: 'webview.http',
                }).catch(() => {});
              }}
            />
          ) : (
            renderFallback()
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default BrowserScreen;
