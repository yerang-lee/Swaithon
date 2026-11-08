import { logAppError } from '../../utils/appDiagnostics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppIcon } from '../ui/AppIcon';
import { PageHeader } from '../ui/PageHeader';
import { BottomNavigation } from '../ui/BottomNavigation';
import { PrimaryButton } from '../ui/PrimaryButton';
import { cancelReservation, getReservations, type ReservationItem, type ReservationStatus } from '../../services/api/reservations';
import { isMockMode } from '../../services/devMock';

type Filter = '전체' | '예정' | '완료' | '취소';
const upcoming = (status: ReservationStatus) => ['PENDING', 'CONFIRMED', 'READY'].includes(status);
const statusLabel = (status: ReservationStatus) => status === 'COMPLETED' ? '픽업 완료' : status === 'CANCELLED' ? '예약 취소' : '픽업 예정';
function pickupDate(value: string) { return new Date(/(Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+09:00`); }
function dateLabel(value: string) {
  const date = pickupDate(value);
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date);
  const part = (key: string) => parts.find(p => p.type === key)?.value ?? '';
  return `${part('year')}.${part('month')}.${part('day')}(${part('weekday')})`;
}
const timeLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(pickupDate(value));
export function ReservationsScreen({ onTab }: { onTab: (label: string) => void }) {
  const [filter, setFilter] = useState<Filter>('전체');
  const [items, setItems] = useState<ReservationItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const lock = useRef(false);
  const active = items.find(item => item.reservation_id === selected);
  useEffect(() => {
    let alive = true; setLoading(true); setError('');
    const status = filter === '완료' ? 'COMPLETED' : filter === '취소' ? 'CANCELLED' : undefined;
    void getReservations(page, status).then(result => {
      if (!alive) return;
      setItems(previous => page === 1 ? result.reservations : [...new Map([...previous, ...result.reservations].map(r => [r.reservation_id, r])).values()]); setTotal(result.total_count);
    }).catch(e => { logAppError("components/reservations/ReservationsScreen.tsx", e);  if (alive) setError(e instanceof Error ? e.message : '예약 내역을 불러오지 못했어요.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, filter, retry]);
  async function cancel() {
    if (!active || lock.current) return;
    lock.current = true; setCancelling(true); setCancelError('');
    try {
      await cancelReservation(active.reservation_id);
      setItems(previous => previous.map(item => item.reservation_id === active.reservation_id ? { ...item, status: 'CANCELLED' } : item));
      setConfirm(false);
    } catch(e) { logAppError("components/reservations/ReservationsScreen.tsx", e);  setCancelError(e instanceof Error ? e.message : '예약 취소에 실패했어요.'); }
    finally { lock.current = false; setCancelling(false); }
  }
  const visible = items.filter(item => filter === '예정' ? upcoming(item.status) : filter === '완료' ? item.status === 'COMPLETED' : filter === '취소' ? item.status === 'CANCELLED' : true).sort((a,b) => pickupDate(b.pickup_at).getTime() - pickupDate(a.pickup_at).getTime());
  const groups = new Map<string, ReservationItem[]>();
  visible.forEach(item => { const label = dateLabel(item.pickup_at); groups.set(label, [...(groups.get(label) ?? []), item]); });
  const goTab = (tab: string) => { if (!cancelling) { setSelected(null); onTab(tab); } };
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    {active ? <PageHeader title="예약 상세" backDisabled={cancelling} onBack={() => { setSelected(null); setCancelError(''); }} /> : <PageHeader title="예약" />}
    {active ? <>
      <ScrollView contentContainerStyle={styles.detailBody}>
        <Text style={styles.date}>{dateLabel(active.pickup_at)}</Text>
        <View style={styles.card}><View style={styles.detailProduct}><View style={styles.detailPhoto} accessibilityLabel="예약 상품 사진 영역" /><View style={styles.detailProductText}><Text style={styles.productName}>{active.product_name} {active.quantity}개</Text><Text style={styles.price}>{active.total_price.toLocaleString('ko-KR')}원</Text></View></View><View style={styles.detailInfo}><View style={styles.infoRow}><AppIcon name="storefront" size={24} color="#181725" /><Text style={styles.infoText}>{active.store_name} · {active.market_name}</Text></View><View style={styles.infoRow}><AppIcon name="calendar-today-rounded" size={24} /><Text style={styles.infoText}>{timeLabel(active.pickup_at)} <Text style={active.status === 'CANCELLED' ? styles.cancelledStatus : undefined}>{statusLabel(active.status)}</Text></Text></View></View></View>
      </ScrollView>
      <View style={styles.actions}><PrimaryButton title="가게 위치 보기" disabled={cancelling} onPress={() => router.push({ pathname: '/stores/[storeId]', params: { storeId: String(active.store_id), storeName: active.store_name, ...(isMockMode() ? { preview: 'true' } : {}) } })} />{upcoming(active.status) && <Pressable accessibilityRole="button" disabled={cancelling} onPress={() => { setCancelError(''); setConfirm(true); }} style={styles.cancelButton}><Text style={styles.cancelLabel}>예약 취소하기</Text></Pressable>}</View>
    </> : <>
      <View style={styles.filterArea}><View style={styles.filters}>{(['전체','예정','완료','취소'] as Filter[]).map(label => <Pressable key={label} accessibilityRole="tab" accessibilityState={{selected:filter===label}} onPress={() => { if (filter !== label) { setFilter(label); setPage(1); setItems([]); } }} style={[styles.filter, filter===label && styles.activeFilter]}><Text style={[styles.filterText,filter===label&&styles.activeFilterText]}>{label}</Text></Pressable>)}</View></View>
      <ScrollView contentContainerStyle={styles.list}>
        {[...groups].map(([date, reservations]) => <View key={date} style={styles.group}><Text style={styles.date}>{date}</Text>{reservations.map(item => <Pressable key={item.reservation_id} accessibilityRole="button" accessibilityLabel={`${item.store_name} ${item.product_name} 예약 상세`} onPress={() => setSelected(item.reservation_id)} style={styles.card}><View style={styles.cardHeader}><Text style={styles.store}>{item.store_name} · {item.market_name}<Text style={styles.time}> │ {timeLabel(item.pickup_at)}</Text></Text></View><View style={styles.cardBody}><View style={styles.photo} accessibilityLabel="예약 상품 사진 영역" /><View style={styles.cardText}><Text style={[styles.status,upcoming(item.status)&&styles.upcoming,item.status === 'CANCELLED'&&styles.cancelledStatus]}>{statusLabel(item.status)}</Text><Text style={styles.productName}>{item.product_name} {item.quantity}개</Text><Text style={styles.price}>{item.total_price.toLocaleString('ko-KR')}원</Text></View><AppIcon name="arrow-right" size={12} color="#C5C5C5" /></View></Pressable>)}</View>)}
        {loading && <ActivityIndicator color="#53B175" style={styles.feedback} />}
        {!!error && <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(v=>v+1)}><Text style={styles.link}>다시 시도</Text></Pressable>{error.includes('로그인') && <Pressable accessibilityRole="button" onPress={() => router.replace('/login')}><Text style={styles.link}>로그인하기</Text></Pressable>}</View>}
        {!loading && !error && visible.length===0 && <Text style={styles.empty}>표시할 예약이 없어요.</Text>}
        {!loading && !error && page*10<total && <Pressable accessibilityRole="button" onPress={() => setPage(v=>v+1)} style={styles.feedback}><Text style={styles.link}>예약 더 보기</Text></Pressable>}
      </ScrollView>
    </>}
    <BottomNavigation active="예약" onSelect={goTab} />
    <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => { if(!cancelling)setConfirm(false); }}><View style={styles.overlay}><View style={styles.dialog}><Text style={styles.dialogTitle}>예약을 취소하시겠어요?</Text><Text style={styles.infoText}>취소 후에는 다시 예약해야 해요.</Text>{!!cancelError&&<View><Text accessibilityRole="alert" style={styles.error}>{cancelError}</Text><Pressable accessibilityRole="button" disabled={cancelling} onPress={() => { setConfirm(false); setSelected(null); setPage(1); setRetry(v => v + 1); }}><Text style={styles.link}>예약 내역 새로고침</Text></Pressable></View>}<View style={styles.dialogActions}><PrimaryButton tone="danger" title="예약 취소" loading={cancelling} onPress={() => void cancel()} /><Pressable accessibilityRole="button" disabled={cancelling} onPress={() => setConfirm(false)} style={styles.keep}><Text style={styles.infoText}>예약 유지하기</Text></Pressable></View></View></View></Modal>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:'white'},header:{paddingHorizontal:24,paddingTop:10,paddingBottom:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heading:{fontSize:27,fontWeight:'700',color:'#181725'},iconButton:{minWidth:38,minHeight:38,alignItems:'center',justifyContent:'center'},filterArea:{width:'100%',maxWidth:600,alignSelf:'center',paddingHorizontal:24},filters:{flexDirection:'row',gap:24,borderBottomWidth:1,borderColor:'#EAEAEA'},filter:{minWidth:40,minHeight:46,paddingHorizontal:2,borderBottomWidth:3,borderBottomColor:'transparent',alignItems:'center',justifyContent:'center'},activeFilter:{borderBottomColor:'#181725'},filterText:{fontSize:16,color:'#777777'},activeFilterText:{color:'#181725',fontWeight:'700'},list:{paddingBottom:24,width:'100%',maxWidth:600,alignSelf:'center'},group:{paddingHorizontal:24,paddingTop:26,paddingBottom:28,borderBottomWidth:6,borderColor:'#F2F2F2',gap:16},date:{fontSize:23,fontWeight:'500',color:'#181725'},card:{borderWidth:1,borderColor:'#DADADA',borderRadius:12,overflow:'hidden',width:'100%'},cardHeader:{paddingHorizontal:18,paddingVertical:16,borderBottomWidth:1,borderColor:'#EEEEEE'},store:{fontSize:18,fontWeight:'600',color:'#181725',lineHeight:27},time:{fontWeight:'400'},cardBody:{paddingHorizontal:18,paddingVertical:20,flexDirection:'row',alignItems:'center',gap:14},photo:{width:72,aspectRatio:1,borderRadius:8,backgroundColor:'#E3E3E3'},cardText:{flex:1,minWidth:0,alignItems:'flex-start',gap:6},status:{fontSize:16,color:'#858585',fontWeight:'500'},upcoming:{color:'#53B175'},cancelledStatus:{color:'#FF3333'},productName:{fontSize:20,color:'#181725',textAlign:'left',flexShrink:1},price:{fontSize:24,fontWeight:'700',color:'#181725'},detailBody:{paddingHorizontal:24,paddingTop:24,paddingBottom:24,gap:20,width:'100%',maxWidth:600,alignSelf:'center'},detailProduct:{paddingVertical:28,paddingHorizontal:20,flexDirection:'row',alignItems:'center',gap:18,borderBottomWidth:1,borderColor:'#EEEEEE'},detailPhoto:{width:90,aspectRatio:1,borderRadius:10,backgroundColor:'#E3E3E3'},detailProductText:{flex:1,minWidth:0,gap:8},detailInfo:{padding:24,gap:16},infoRow:{flexDirection:'row',alignItems:'center',gap:12},infoText:{fontSize:18,color:'#181725',lineHeight:27,flexShrink:1},actions:{paddingHorizontal:24,paddingTop:16,paddingBottom:24,gap:10,width:'100%',maxWidth:600,alignSelf:'center'},cancelButton:{minHeight:54,borderRadius:16,borderWidth:1,borderColor:'#FF7777',alignItems:'center',justifyContent:'center',padding:12},cancelLabel:{fontSize:18,color:'#FF3333',fontWeight:'500'},feedback:{padding:20,alignItems:'center',gap:12},error:{fontSize:15,lineHeight:22,color:'#C23D3D'},link:{fontSize:16,color:'#53B175',padding:8},empty:{textAlign:'center',color:'#858585',padding:32,fontSize:16},overlay:{flex:1,backgroundColor:'#00000066',justifyContent:'center',padding:24},dialog:{backgroundColor:'white',borderRadius:20,padding:24,gap:12,width:'100%',maxWidth:480,alignSelf:'center'},dialogTitle:{fontSize:23,fontWeight:'700',color:'#181725'},dialogActions:{gap:2},keep:{minHeight:40,alignItems:'center',justifyContent:'center'},
});
