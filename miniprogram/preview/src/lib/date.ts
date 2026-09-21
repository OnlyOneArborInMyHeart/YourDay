// 日期工具（从 frontend/src/utils/date.ts 抄过来，简化版，不引 lunar-typescript）

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toDateString(dt);
}

export function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${y} 年 ${m} 月 ${d} 日 · ${weekdays[dt.getDay()]}`;
}

const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
export function timeToMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  const m = TIME_RE.exec(t);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export function durationMinutes(start: string, end: string): number {
  return Math.max(0, timeToMinutes(end) - timeToMinutes(start));
}

export function firstOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
export function lastOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}
export function shiftMonth(dateStr: string, delta: number): string {
  const [y, m] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return toDateString(dt);
}
export function monthGridDays(dateStr: string): string[] {
  const [y, m] = dateStr.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startWeekday = first.getDay();
  const start = new Date(y, m - 1, 1 - startWeekday);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    days.push(toDateString(dt));
  }
  return days;
}
export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
export function formatMonthTitle(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y} 年 ${m} 月`;
}
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function dayOfYear(dateStr: string): number {
  const dt = parseLocal(dateStr);
  const start = new Date(dt.getFullYear(), 0, 0);
  const diff = dt.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
export function isoWeekNumber(dateStr: string): number {
  const dt = parseLocal(dateStr);
  const target = new Date(dt.valueOf());
  const dayNr = (dt.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 1);
  if (firstThursday.getDay() !== 4) {
    firstThursday.setMonth(0, 1 + ((4 - firstThursday.getDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((target.valueOf() - firstThursday.valueOf()) / (7 * 24 * 3600 * 1000));
  return week;
}
export function daysBetween(aStr: string, bStr: string): number {
  const a = parseLocal(aStr).getTime();
  const b = parseLocal(bStr).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}
export function relativeDayLabel(dateStr: string, todayStr: string): string {
  const diff = daysBetween(dateStr, todayStr);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1 && diff <= 7) return `${diff} 天后`;
  if (diff < -1 && diff >= -7) return `${Math.abs(diff)} 天前`;
  return '';
}
export function weekdayName(dateStr: string): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseLocal(dateStr).getDay()];
}
export function yearLength(yearStr: string): number {
  const y = Number(yearStr);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}
export function remainingDaysInYear(dateStr: string): number {
  return Math.max(0, yearLength(dateStr.slice(0, 4)) - dayOfYear(dateStr));
}
export function yearProgress(dateStr: string): number {
  return Math.round((dayOfYear(dateStr) / yearLength(dateStr.slice(0, 4))) * 100);
}
export function formatShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m} 月 ${d} 日`;
}

// 农历 —— 浏览器版不引 lunar-typescript，用精简查表法（1900-2100）
// 编码方式：每年 16 bit，4 位 16 进制 = 16 bit，前 4 bit 表闰月月份（0=无闰），后 12 bit 表每月大小（0=小月 29 天，1=大月 30 天）。
const LUNAR_INFO: [number, string][] = [
  [0x04bd8, '1900'], [0x04ae0, '1901'], [0x0a570, '1902'], [0x054d5, '1903'], [0x0d260, '1904'], [0x0d950, '1905'],
  [0x16554, '1906'], [0x056a0, '1907'], [0x09ad0, '1908'], [0x055d2, '1909'], [0x04ae0, '1910'], [0x0a5b6, '1911'],
  [0x0a4d0, '1912'], [0x0d250, '1913'], [0x1d255, '1914'], [0x0b540, '1915'], [0x0d6a0, '1916'], [0x0ada2, '1917'],
  [0x095b0, '1918'], [0x14977, '1919'], [0x04970, '1920'], [0x0a4b0, '1921'], [0x0b4b5, '1922'], [0x06a50, '1923'],
  [0x06d40, '1924'], [0x1ab54, '1925'], [0x02b60, '1926'], [0x09570, '1927'], [0x052f2, '1928'], [0x04970, '1929'],
  [0x06566, '1930'], [0x0d4a0, '1931'], [0x0ea50, '1932'], [0x06e95, '1933'], [0x05ad0, '1934'], [0x02b60, '1935'],
  [0x186e3, '1936'], [0x092e0, '1937'], [0x1c8d7, '1938'], [0x0c950, '1939'], [0x0d4a0, '1940'], [0x1d8a6, '1941'],
  [0x0b550, '1942'], [0x056a0, '1943'], [0x1a5b4, '1944'], [0x025d0, '1945'], [0x092d0, '1946'], [0x0d2b2, '1947'],
  [0x0a950, '1948'], [0x0b557, '1949'], [0x06ca0, '1950'], [0x0b550, '1951'], [0x15355, '1952'], [0x04da0, '1953'],
  [0x0a5b0, '1954'], [0x14573, '1955'], [0x052b0, '1956'], [0x0a9a8, '1957'], [0x0e950, '1958'], [0x06aa0, '1959'],
  [0x0aea6, '1960'], [0x0ab50, '1961'], [0x04b60, '1962'], [0x0aae4, '1963'], [0x0a570, '1964'], [0x05260, '1965'],
  [0x0f263, '1966'], [0x0d950, '1967'], [0x05b57, '1968'], [0x056a0, '1969'], [0x096d0, '1970'], [0x04dd5, '1971'],
  [0x04ad0, '1972'], [0x0a4d0, '1973'], [0x0d4d4, '1974'], [0x0d250, '1975'], [0x0d558, '1976'], [0x0b540, '1977'],
  [0x0b6a0, '1978'], [0x195a6, '1979'], [0x095b0, '1980'], [0x049b0, '1981'], [0x0a974, '1982'], [0x0a4b0, '1983'],
  [0x0b27a, '1984'], [0x06a50, '1985'], [0x06d40, '1986'], [0x0af46, '1987'], [0x0ab60, '1988'], [0x09570, '1989'],
  [0x04af5, '1990'], [0x04970, '1991'], [0x064b0, '1992'], [0x074a3, '1993'], [0x0ea50, '1994'], [0x06b58, '1995'],
  [0x055c0, '1996'], [0x0ab60, '1997'], [0x096d5, '1998'], [0x092e0, '1999'], [0x0c960, '2000'], [0x0d954, '2001'],
  [0x0d4a0, '2002'], [0x0da50, '2003'], [0x07552, '2004'], [0x056a0, '2005'], [0x0abb7, '2006'], [0x025d0, '2007'],
  [0x092d0, '2008'], [0x0cab5, '2009'], [0x0a950, '2010'], [0x0b4a0, '2011'], [0x0baa4, '2012'], [0x0ad50, '2013'],
  [0x055d9, '2014'], [0x04ba0, '2015'], [0x0a5b0, '2016'], [0x15176, '2017'], [0x052b0, '2018'], [0x0a930, '2019'],
  [0x07954, '2020'], [0x06aa0, '2021'], [0x0ad50, '2022'], [0x05b52, '2023'], [0x04b60, '2024'], [0x0a6e6, '2025'],
  [0x0a4e0, '2026'], [0x0d260, '2027'], [0x0ea65, '2028'], [0x0d530, '2029'], [0x05aa0, '2030'],
];

const HEAVENLY = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const EARTHLY = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

function lunarYearDays(y: number): number {
  const info = LUNAR_INFO[y - 1900]?.[0] ?? 0;
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += (info & i) ? 1 : 0;
  return sum + leapDays(y);
}
function leapMonth(y: number): number {
  return LUNAR_INFO[y - 1900]?.[0] & 0xf;
}
function leapDays(y: number): number {
  if (leapMonth(y)) return (LUNAR_INFO[y - 1900]?.[0] & 0x10000) ? 30 : 29;
  return 0;
}
function monthDays(y: number, m: number): number {
  return (LUNAR_INFO[y - 1900]?.[0] & (0x10000 >> m)) ? 30 : 29;
}

export interface LunarInfo {
  yearCN: string;
  monthCN: string;
  dayCN: string;
  full: string;
  ganzhiYear: string;
  zodiac: string;
}
export function getLunarInfo(dateStr: string): LunarInfo {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 从 1900-01-31（农历 1900-01-01）起算
  const baseDate = new Date(1900, 0, 31);
  const objDate = new Date(y, m - 1, d);
  let offset = Math.round((objDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
  let i: number, temp = 0;
  for (i = 1900; i < 2050 && offset > 0; i++) {
    temp = lunarYearDays(i);
    offset -= temp;
  }
  if (offset < 0) { offset += temp; i--; }
  const lunarYear = i;
  const leap = leapMonth(i);
  let isLeap = false;
  for (i = 1; i < 13 && offset > 0; i++) {
    if (leap > 0 && i === leap + 1 && !isLeap) {
      --i; isLeap = true; temp = leapDays(lunarYear);
    } else {
      temp = monthDays(lunarYear, i);
    }
    if (isLeap && i === leap + 1) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && i === leap + 1) {
    if (isLeap) isLeap = false;
    else { isLeap = true; --i; }
  }
  if (offset < 0) { offset += temp; --i; }
  const lunarMonth = i;
  const lunarDay = offset + 1;

  const ganzhiIdx = (lunarYear - 4 + 60) % 60;
  return {
    yearCN: `${HEAVENLY[ganzhiIdx % 10]}${EARTHLY[ganzhiIdx % 12]}`,
    monthCN: (isLeap ? '闰' : '') + (MONTH_CN[lunarMonth - 1] ?? '?') + '月',
    dayCN: DAY_CN[lunarDay - 1] ?? '',
    full: `${HEAVENLY[ganzhiIdx % 10]}${EARTHLY[ganzhiIdx % 12]}年 ${(isLeap ? '闰' : '') + (MONTH_CN[lunarMonth - 1] ?? '?')}月${DAY_CN[lunarDay - 1] ?? ''}`,
    ganzhiYear: `${HEAVENLY[ganzhiIdx % 10]}${EARTHLY[ganzhiIdx % 12]}`,
    zodiac: ZODIAC[ganzhiIdx % 12],
  };
}

// 节日（极简版）
const HOLIDAYS: Record<string, string> = {
  '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '03-12': '植树节',
  '04-01': '愚人节', '05-01': '劳动节', '05-04': '青年节', '06-01': '儿童节',
  '09-10': '教师节', '10-01': '国庆节', '12-24': '平安夜', '12-25': '圣诞节',
};
const FIXED_LUNAR: Record<string, string> = {
  '正月初一': '春节', '正月十五': '元宵', '五月初五': '端午', '七月初七': '七夕',
  '八月十五': '中秋', '九月初九': '重阳', '腊月三十': '除夕', '腊月二十九': '除夕',
};
export function getHolidayInfo(dateStr: string): { name: string } | null {
  const [, m, d] = dateStr.split('-').map((v, i) => i === 0 ? v : String(Number(v)).padStart(2, '0'));
  const key = `${m}-${d}`;
  if (HOLIDAYS[key]) return { name: HOLIDAYS[key] };
  const lunar = getLunarInfo(dateStr);
  if (FIXED_LUNAR[`${lunar.monthCN.replace('月', '')}月${lunar.dayCN}`]) {
    return { name: FIXED_LUNAR[`${lunar.monthCN.replace('月', '')}月${lunar.dayCN}`] };
  }
  if (FIXED_LUNAR[`${lunar.monthCN.replace('月', '')}${lunar.dayCN}`]) {
    return { name: FIXED_LUNAR[`${lunar.monthCN.replace('月', '')}${lunar.dayCN}`] };
  }
  return null;
}