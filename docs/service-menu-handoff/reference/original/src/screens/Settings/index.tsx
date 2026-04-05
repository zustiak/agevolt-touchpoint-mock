import React, {FC, useState} from 'react';
import {styles} from './styles';
import {View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {AppGridButton} from '../../components/AppGridButton';
import Integrations from './Integrations';
import Mqtt from './Mqtt';
import General from './General';
import StanHeader from '../../components/StanHeader';
import {useAppSelector} from '../../reduxStore';
import {contrastStyles} from './contrastStyles';

const SettingsScreen: FC = () => {
  const {t} = useTranslation();
  const [tabIndex, setTabIndex] = useState<number>(0);
  const buttonsData = [{name: t('common.general')}, {name: t('integrations')}];
  const {isContrast} = useAppSelector(state => state.mainSlice.config);
  const c: Partial<typeof contrastStyles> = isContrast ? contrastStyles : {};

  return (
    <View style={[styles.content, c.content]}>
      <StanHeader statusText={t('settingsScreen.title')} isLeftBack />
      <AppGridButton
        btnWidth={'50%'}
        list={buttonsData}
        currentIndex={tabIndex}
        onClick={i => {
          setTabIndex(i);
        }}
      />
      {tabIndex === 0 && <General />}
      {tabIndex === 1 && <Integrations />}
      {/* {tabIndex === 2 && <Mqtt />} */}
    </View>
  );
};

export default SettingsScreen;
