import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
  preview = false,
}: {
  listingId: string;
  preview?: boolean;
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
    if (preview) {
      setLoading(false);
      return;
    }
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
  }, [listingId, preview, retry]);
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
        <Text style={styles.muted}>
          {preview ? '미리보기 상품은 가격 이력이 없어요.' : error}
        </Text>
        {!preview && (
          <Pressable
            onPress={() => setRetry((v) => v + 1)}
            accessibilityRole="button"
          >
            <Text style={styles.retry}>다시 시도</Text>
          </Pressable>
        )}
      </View>
    );
  const points = data.price_history.filter(
    (p) => !days || Date.parse(p.recorded_at) >= Date.now() - days * 86400000,
  );
  const chosen = selected === null ? null : points[selected];
  const values = points.map((p) => p.price);
  const low = Math.min(...values),
    high = Math.max(...values);
  const padding = Math.max((high - low) * 0.2, high * 0.05, 1);
  const min = Math.max(0, low - padding),
    max = high + padding;
  const first = points.length ? Date.parse(points[0].recorded_at) : 0;
  const last = points.length
    ? Date.parse(points[points.length - 1].recorded_at)
    : 0;
  const x = (i: number) =>
    last === first
      ? 135
      : 8 +
        ((Date.parse(points[i].recorded_at) - first) / (last - first)) * 254;
  const y = (price: number) => 22 + ((max - price) / (max - min)) * 128;
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.price)}`)
    .join(' ');
  return (
    <View style={styles.container}>
      <Text style={styles.muted}>
        {chosen ? `${date(chosen.recorded_at)} 선택 가격` : '현재 판매 가격'}
      </Text>
      <Text style={styles.price}>
        {won(chosen?.price ?? data.current_price)}
      </Text>
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
          <View
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => select(e.nativeEvent.locationX)}
            onResponderMove={(e) => select(e.nativeEvent.locationX)}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            accessibilityLabel="가격 변동 그래프. 아래 기록을 눌러 가격을 확인할 수 있어요."
          >
            <Svg width="100%" height={190} viewBox="0 0 350 190">
              {[max, (max + min) / 2, min].map((v, i) => (
                <Line
                  key={i}
                  x1={8}
                  x2={270}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#EDEDED"
                  strokeDasharray="3 4"
                />
              ))}
              {[max, (max + min) / 2, min].map((v, i) => (
                <SvgText key={i} x={278} y={y(v) + 4} fontSize={11} fill="#888">
                  {Math.round(v).toLocaleString('ko-KR')}
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
                  x={270}
                  y={182}
                  textAnchor="end"
                  fontSize={11}
                  fill="#888"
                >
                  {date(points[points.length - 1].recorded_at)}
                </SvgText>
              )}
            </Svg>
          </View>
          <ScrollView horizontal contentContainerStyle={styles.records}>
            {points.map((p, i) => (
              <Pressable
                key={`${p.recorded_at}-${i}`}
                onPress={() => setSelected(i)}
                accessibilityRole="button"
                accessibilityLabel={`${date(p.recorded_at)} ${won(p.price)}`}
              >
                <Text
                  style={[styles.record, selected === i && styles.activeText]}
                >
                  {date(p.recorded_at)} · {won(p.price)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
  function select(touchX: number) {
    const svgX = (touchX / Math.max(width, 1)) * 350;
    let nearest = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - svgX) < Math.abs(x(nearest) - svgX)) nearest = i;
    });
    setSelected(nearest);
  }
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
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
    fontSize: 14,
    color: '#7C7C7C',
    textAlign: 'center',
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
    fontSize: 14,
    color: '#888888',
  },
  activeText: {
    color: '#23864C',
    fontWeight: '700',
  },
  records: {
    gap: 12,
    paddingVertical: 8,
  },
  record: {
    fontSize: 12,
    color: '#7C7C7C',
    padding: 8,
  },
  retry: {
    fontSize: 16,
    color: '#23864C',
  },
});
