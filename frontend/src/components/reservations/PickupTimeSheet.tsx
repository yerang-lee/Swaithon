import { AppIcon } from '../ui/AppIcon';
import { useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../ui/PrimaryButton';
import { pickupTimes, dayLabel, timeLabel } from '../../utils/pickupTimes';
const rowHeight = 36;
export function PickupTimeSheet({ onClose, onConfirm, submitting = false, favorite, favoritePending = false, onToggleFavorite }: { onClose: () => void; onConfirm: (date: Date, quantity: number, note: string) => void; submitting?: boolean; favorite: boolean; favoritePending?: boolean; onToggleFavorite: () => void }) {
  // 모달 내부의 첫 SafeArea 측정에 의존하지 않고 원래 화면의 하단 여백을 사용합니다.
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0) + 16;
  const wheelPadding = rowHeight;
  const [today] = useState(() => new Date());
  const [index, setIndex] = useState(0);
  const [settled, setSettled] = useState(true);
  const y = useRef(new Animated.Value(0)).current;
  const day = today;
  const slots = useMemo(() => pickupTimes(day), [day]);
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}>
    <Pressable accessibilityLabel="시간 선택 닫기" style={styles.backdrop} onPress={onClose} />
    <View style={[styles.sheet, { paddingBottom: bottomPadding }]}><View style={styles.handle} /><Text style={styles.title}>방문 수령 시간 선택</Text>
      <View style={styles.day}><Text style={styles.dayText}>{dayLabel(today, 0)}</Text></View>
      {slots.length ? <View style={[styles.wheel, { height: wheelPadding * 2 + rowHeight }]}><View pointerEvents="none" style={[styles.selection, { top: wheelPadding }]} /><Animated.FlatList data={slots} keyExtractor={value => String(value.getTime())} showsVerticalScrollIndicator={false} snapToInterval={rowHeight} decelerationRate="fast" bounces={false} contentContainerStyle={{ paddingVertical: wheelPadding }} getItemLayout={(_, i) => ({ length: rowHeight, offset: rowHeight * i, index: i })}
        onScrollBeginDrag={() => setSettled(false)} onMomentumScrollBegin={() => setSettled(false)} scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true, listener: (event: any) => { setIndex(Math.max(0, Math.min(slots.length - 1, Math.round(event.nativeEvent.contentOffset.y / rowHeight)))); } })}
        onMomentumScrollEnd={() => setSettled(true)} onScrollEndDrag={event => { if (!event.nativeEvent.velocity?.y) setSettled(true); }}
        renderItem={({ item, index: i }) => <Animated.View accessibilityLabel={timeLabel(item)} style={[styles.timeRow, { opacity: y.interpolate({ inputRange: [(i - 2) * rowHeight, i * rowHeight, (i + 2) * rowHeight], outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' }), transform: [{ scale: y.interpolate({ inputRange: [(i - 1) * rowHeight, i * rowHeight, (i + 1) * rowHeight], outputRange: [0.8, 1, 0.8], extrapolate: 'clamp' }) }] }]}><Text style={styles.time}>{timeLabel(item)}</Text></Animated.View>} />
      </View> : <Text style={styles.empty}>오늘 선택 가능한 시간이 없어요. 오늘 예약이 마감됐어요.</Text>}
      <View style={styles.footer}><Pressable accessibilityRole="button" accessibilityLabel={favorite ? '관심 해제' : '관심 등록'} accessibilityState={{ selected: favorite }} disabled={favoritePending} onPress={onToggleFavorite} style={styles.favorite}><AppIcon name={favorite ? 'heart-filled' : 'heart-outline'} size={28} color={favorite ? '#E84B4B' : '#777777'} /><Text style={styles.favoriteLabel}>관심</Text></Pressable><View style={{ flex: 1 }}><PrimaryButton compact title="예약하기" loading={submitting} disabled={!slots[index] || !settled || submitting} onPress={() => onConfirm(slots[index], 1, '')} /></View></View>
    </View>
  </View></Modal>;
}
const styles = StyleSheet.create({ footer: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20 }, favorite: { width: 30, alignItems: 'center', gap: 4 }, favoriteLabel: { fontSize: 11, color: '#777777' }, overlay: { flex: 1, justifyContent: 'flex-end' }, backdrop: { position: 'absolute', inset: 0, backgroundColor: '#00000035' }, sheet: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12 }, handle: { width: 38, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }, title: { fontSize: 21, fontWeight: '700', marginBottom: 20, color: '#181725' }, days: { gap: 8, paddingBottom: 8 }, day: { paddingHorizontal: 16, paddingVertical: 10 }, dayText: { fontSize: 19, fontWeight: '600', color: '#000000', textAlign: 'center' }, wheel: { height: rowHeight * 3, marginVertical: 12, overflow: 'hidden' }, selection: { position: 'absolute', top: rowHeight, height: rowHeight, left: 0, right: 0, borderRadius: 999, backgroundColor: '#F2F7F3' }, timeRow: { height: rowHeight, alignItems: 'center', justifyContent: 'center' }, time: { fontSize: 22, fontWeight: '500', color: '#181725', fontVariant: ['tabular-nums'] }, summary: { textAlign: 'center', fontSize: 13, color: '#858585', marginBottom: 14 }, empty: { paddingVertical: 60, color: '#858585', lineHeight: 24 } });
