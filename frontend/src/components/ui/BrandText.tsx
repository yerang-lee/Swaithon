import { useEffect } from 'react';
import { Text, type TextProps } from 'react-native';
import { useFonts } from 'expo-font';
import { logAppError } from '../../utils/appDiagnostics';

const brandFonts = {
  TmoneyRoundWindRegular: require(
    '../../../assets/fonts/TmoneyRoundWindRegular.ttf',
  ),
  TmoneyRoundWindExtraBold: require(
    '../../../assets/fonts/TmoneyRoundWindExtraBold.ttf',
  ),
};

/** 브랜드 이름과 로그인 로고 안내 문구에 사용하는 글꼴입니다. */
export function BrandText({
  style,
  variant = 'extraBold',
  ...props
}: TextProps & { variant?: 'extraBold' | 'regular' }) {
  const [loaded, error] = useFonts(brandFonts);
  useEffect(() => {
    if (error)
      logAppError('brand/font', new Error('브랜드 글꼴을 불러오지 못했어요.'));
  }, [error]);
  return (
    <Text
      {...props}
      style={[
        style,
        loaded && {
          fontFamily:
            variant === 'regular'
              ? 'TmoneyRoundWindRegular'
              : 'TmoneyRoundWindExtraBold',
          fontWeight: 'normal',
          fontStyle: 'normal',
        },
      ]}
    />
  );
}
