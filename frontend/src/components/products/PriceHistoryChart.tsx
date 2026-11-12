import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import {
  getPriceHistory,
  type PriceHistory,
} from '../../services/api/priceHistory';
import { logAppError } from '../../utils/appDiagnostics';

const periods = [
  { label: '1주일', days: 7 },
  { label: '1개월', days: 30 },
  { label: '3개월', days: 90 },
  { label: '전체', days: 0 },
];
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const date = (s: string) =>
  new Date(s).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  });
export function PriceHistoryChart({
  listingId,
  saleActive = false,
}: {
  listingId: string;
  saleActive?: boolean;
}) {
  const [result, setResult] = useState<{
    id: string;
    data: PriceHistory;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [width, setWidth] = useState(350);
  const [days, setDays] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    setError('');
    setSelected(null);
    setDays(0);
    setLoading(true);
    void getPriceHistory(listingId)
      .then((data) => {
        if (active) setResult({ id: listingId, data });
      })
      .catch((e) => {
        logAppError('product/price-history', e);
        if (active)
          setError(
            e instanceof Error ? e.message : '가격 이력을 불러오지 못했어요.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listingId, retry]);
  const data = result?.id === listingId ? result.data : null;
  if (loading)
    return (
      <View style={styles.message}>
        <ActivityIndicator color="#53B175" />
      </View>
    );
  if (!data)
    return (
      <View style={styles.message}>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          onPress={() => setRetry((v) => v + 1)}
          accessibilityRole="button"
        >
          <Text style={styles.retry}>다시 시도</Text>
        </Pressable>
      </View>
    );
  const points = data.price_history.filter(
    (p) => !days || Date.parse(p.recorded_at) >= Date.now() - days * 86400000,
  );
  const chosen = selected === null ? null : points[selected];
  const values = points.map((p) => p.price);
  const low = values.length ? Math.min(...values) : 0,
    high = values.length ? Math.max(...values) : 0;
  const min = Math.max(0, Math.floor(low / 500) * 500 - 500);
  const tickStep = Math.max(500, Math.ceil((high + 500 - min) / 1000) * 500);
  const max = min + tickStep * 2;
  const first = points.length ? Date.parse(points[0].recorded_at) : 0;
  const last = points.length
    ? Date.parse(points[points.length - 1].recorded_at)
    : 0;
  const axisWidth = Math.max(64, won(Math.round(max)).length * 8 + 12);
  const plotRight = Math.max(60, width - axisWidth);
  const x = (i: number) =>
    last === first
      ? (8 + plotRight) / 2
      : 8 +
        ((Date.parse(points[i].recorded_at) - first) / (last - first)) *
          (plotRight - 8);
  const y = (price: number) => 22 + ((max - price) / (max - min)) * 128;
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.price)}`)
    .join(' ');
  return (
    <View style={styles.container}>
      {data.has_demo_history && (
        <Text style={styles.demoNote}>개발용 예시 가격 이력이 포함되어 있어요.</Text>
      )}
      <View style={styles.tabs}>
        {periods.map((p) => (
          <Pressable
            key={p.label}
            accessibilityRole="button"
            accessibilityState={{ selected: days === p.days }}
            onPress={() => {
              setDays(p.days);
              setSelected(null);
            }}
            style={[styles.tab, days === p.days && styles.active]}
          >
            <Text
              style={[styles.tabText, days === p.days && styles.activeText]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {!points.length ? (
        <View style={styles.message}>
          <Text style={styles.muted}>
            {data.price_history.length
              ? '선택한 기간에 가격 변동 이력이 없어요.'
              : '아직 가격 변동 이력이 없어요.'}
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.axisUnit}>가격 (단위: 원)</Text>
          <View
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => select(e.nativeEvent.locationX)}
            onResponderMove={(e) => select(e.nativeEvent.locationX)}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            accessibilityLabel="가격 변동 그래프. 그래프를 터치해 해당 시점의 가격을 확인할 수 있어요."
          >
            <Svg width="100%" height={190} viewBox={`0 0 ${width} 190`}>
              {[max, (max + min) / 2, min].map((v, i) => (
                <Line
                  key={i}
                  x1={8}
                  x2={plotRight}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#EDEDED"
                  strokeDasharray="3 4"
                />
              ))}
              {[max, (max + min) / 2, min].map((v, i) => (
                <SvgText
                  key={i}
                  x={width - 4}
                  y={y(v) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="#888"
                >
                  {won(Math.round(v))}
                </SvgText>
              ))}
              <Path d={path} stroke="#53B175" strokeWidth={2.5} fill="none" />
              {points.map((p, i) => (
                <Circle
                  key={i}
                  cx={x(i)}
                  cy={y(p.price)}
                  r={selected === i ? 5 : 3}
                  fill="#53B175"
                />
              ))}
              {chosen && (
                <Line
                  x1={x(selected!)}
                  x2={x(selected!)}
                  y1={16}
                  y2={158}
                  stroke="#AAA"
                  strokeDasharray="3 4"
                />
              )}
              <SvgText x={8} y={182} fontSize={11} fill="#888">
                {date(points[0].recorded_at)}
              </SvgText>
              {points.length > 1 && (
                <SvgText
                  x={plotRight}
                  y={182}
                  textAnchor="end"
                  fontSize={11}
                  fill="#888"
                >
                  {date(points[points.length - 1].recorded_at)}
                </SvgText>
              )}
            </Svg>
            <Text style={styles.dateUnit}>날짜 (월/일)</Text>
          </View>
        </>
      )}
      <Text style={styles.muted}>
        {chosen ? `${date(chosen.recorded_at)} 선택 가격` : '현재 판매 가격'}
      </Text>
      <Text style={[styles.price, !chosen && saleActive && styles.salePrice]}>
        {won(chosen?.price ?? data.current_price)}
      </Text>
    </View>
  );
  function select(touchX: number) {
    const svgX = touchX;
    let nearest = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - svgX) < Math.abs(x(nearest) - svgX)) nearest = i;
    });
    setSelected(nearest);
  }
}

const styles = StyleSheet.create({
  demoNote: { fontSize: 12, color: '#7C7C7C', lineHeight: 18 },
  axisUnit: { fontSize: 12, color: '#666', textAlign: 'right' },
  dateUnit: { fontSize: 12, color: '#666', textAlign: 'left', marginTop: 2 },
  container: {
    marginTop: 5,
    gap: 10,
  },
  message: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 16,
  },
  muted: {
    fontSize: 16,
    color: '#7C7C7C',
    textAlign: 'center',
  },
  salePrice: {
    color: '#EF4929',
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#181725',
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  active: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 16,
    color: '#888888',
  },
  activeText: {
    color: '#23864C',
    fontWeight: '700',
  },
  retry: {
    fontSize: 16,
    color: '#23864C',
  },
});
