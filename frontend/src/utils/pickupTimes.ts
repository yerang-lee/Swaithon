export function pickupTimes(day: Date, now = new Date()): Date[] {
  const times: Date[] = [];
  for (let minute = 9 * 60; minute <= 19 * 60; minute += 30) {
    const time = new Date(day);
    time.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    if (time.getTime() >= now.getTime()) times.push(time);
  }
  return times;
}
export const timeLabel = (date: Date) =>
  `${date.getHours() < 12 ? '오전' : '오후'} ${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
export const dayLabel = (date: Date, offset: number) =>
  `${offset === 0 ? '오늘' : offset === 1 ? '내일' : '모레'} (${date.getMonth() + 1}월 ${date.getDate()}일, ${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})`;
