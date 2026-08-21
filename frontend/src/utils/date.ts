/** 本地日期 YYYY-MM-DD，避免 new Date() 产生时区漂移 */
import { Solar } from 'lunar-typescript';

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

const TIME_RE = /^(\d{2}):(\d{2})$/;

/** 把 "HH:MM" 转换为当日 0 点起的分钟数 */
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

/**
 * 获取指定日期所在月的第一天 YYYY-MM-01
 */
export function firstOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * 获取指定日期所在月的最后一天 YYYY-MM-DD
 */
export function lastOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/**
 * 月份平移：delta = ±1 表示上/下月
 */
export function shiftMonth(dateStr: string, delta: number): string {
  const [y, m] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return toDateString(dt);
}

/**
 * 给定任意 YYYY-MM-DD，返回从周日到周六的 42 天网格（6×7），
 * 包含当月所有日期 + 上下月补全。返回近 42 个日期字符串。
 */
export function monthGridDays(dateStr: string): string[] {
  const [y, m] = dateStr.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startWeekday = first.getDay(); // 0=Sun
  const start = new Date(y, m - 1, 1 - startWeekday);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    days.push(toDateString(dt));
  }
  return days;
}

/**
 * 判断日期是否为当前显示月中
 */
export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * 格式化月份标题，比如 "2026 年 8 月"
 */
export function formatMonthTitle(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y} 年 ${m} 月`;
}

/** 把 YYYY-MM-DD 转成 Date（本地 0 点） */
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 当年中的第 N 天（1 - 366）
 */
export function dayOfYear(dateStr: string): number {
  const dt = parseLocal(dateStr);
  const start = new Date(dt.getFullYear(), 0, 0);
  const diff = dt.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * ISO 8601 周编号（1 - 53）
 * https://en.wikipedia.org/wiki/ISO_week_date
 */
export function isoWeekNumber(dateStr: string): number {
  const dt = parseLocal(dateStr);
  // 把周一周日调成周四再算
  const target = new Date(dt.valueOf());
  const dayNr = (dt.getDay() + 6) % 7; // 周一 = 0
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 1);
  if (firstThursday.getDay() !== 4) {
    firstThursday.setMonth(0, 1 + ((4 - firstThursday.getDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((target.valueOf() - firstThursday.valueOf()) / (7 * 24 * 3600 * 1000));
  return week;
}

/**
 * aStr - bStr 的天数（a > b → 正数；a < b → 负数；同一天 → 0）
 */
export function daysBetween(aStr: string, bStr: string): number {
  const a = parseLocal(aStr).getTime();
  const b = parseLocal(bStr).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

/**
 * 把 daysBetween 渲染为「今天 / 昨天 / 明天 / N 天前 / N 天后」
 */
export function relativeDayLabel(dateStr: string, todayStr: string): string {
  const diff = daysBetween(dateStr, todayStr);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1 && diff <= 7) return `${diff} 天后`;
  if (diff < -1 && diff >= -7) return `${Math.abs(diff)} 天前`;
  return '';
}

/**
 * 把 SQLite 的 completed_at（形如 "2026-08-19 23:55:12"，本地时区）格式化为 "YYYY-MM-DD"。
 * 解析失败或为空时返回空串。
 */
export function formatCompletedTime(completedAt: string | null | undefined): string {
  if (!completedAt) return '';
  // 兼容 "YYYY-MM-DD HH:MM:SS" 和 "YYYY-MM-DDTHH:MM:SS"，只取日期段
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(completedAt);
  if (!m) return '';
  return m[1];
}

/** 把 completed_at 渲染成 "完成于 YYYY-MM-DD"。 */
export function formatCompletedLabel(completedAt: string | null | undefined): string {
  const date = formatCompletedTime(completedAt);
  if (!date) return '';
  return `完成于 ${date}`;
}

/** 全年总天数（365 / 366） */
export function yearLength(yearStr: string): number {
  const y = Number(yearStr);
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return isLeap ? 366 : 365;
}

/** 年内剩余天数（不含今天） */
export function remainingDaysInYear(dateStr: string): number {
  const total = yearLength(dateStr.slice(0, 4));
  return Math.max(0, total - dayOfYear(dateStr));
}

/** 把日期格式化成简短形式 "M月D日" */
export function formatShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m} 月 ${d} 日`;
}

/** YYYY-MM-DD 当天在一年中的进度 0-100（百分比，0 位小数） */
export function yearProgress(dateStr: string): number {
  const year = dateStr.slice(0, 4);
  const total = yearLength(year);
  return Math.round((dayOfYear(dateStr) / total) * 100);
}

/** 距离周末 / 距周一等相对描述 */
export function weekdayName(dateStr: string): string {
  const dt = parseLocal(dateStr);
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
}

/* —— 农历 / 节气（基于 lunar-typescript） —— */

/**
 * 给定阳历日期，返回农历信息
 */
export interface LunarInfo {
  /** 农历年份汉字："二〇二六" */
  yearCN: string;
  /** 农历月份汉字（不含"月"）："七" */
  monthCN: string;
  /** 农历日期汉字（不含"日"）："初一" */
  dayCN: string;
  /** 完整农历文本："二〇二六年七月初一" */
  full: string;
  /** 当前节气（仅当日为节气时返回）；否则空串 */
  jieqi: string;
  /** 干支年："丙午" */
  ganzhiYear: string;
  /** 生肖："马" */
  zodiac: string;
}

/**
 * 给定阳历日期，返回农历信息
 */
export function getLunarInfo(dateStr: string): LunarInfo {
  const [y, m, d] = dateStr.split('-').map(Number);
  const lunar = Solar.fromYmd(y, m, d).getLunar();
  const jieqi = lunar.getJieQi() ?? '';
  return {
    yearCN: lunar.getYearInChinese(),
    monthCN: lunar.getMonthInChinese(),
    dayCN: lunar.getDayInChinese(),
    full: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    jieqi,
    ganzhiYear: lunar.getYearInGanZhi(),
    zodiac: lunar.getYearShengXiao(),
  };
}

/* —— 公历节日表（按 M-D） —— */
const SOLAR_HOLIDAYS: Record<string, string> = {
  '01-01': '元旦',
  '02-14': '情人节',
  '03-08': '妇女节',
  '03-12': '植树节',
  '04-01': '愚人节',
  '05-01': '劳动节',
  '05-04': '青年节',
  '06-01': '儿童节',
  '07-01': '建党节',
  '08-01': '建军节',
  '09-10': '教师节',
  '10-01': '国庆节',
  '10-31': '万圣节',
  '11-25': '感恩节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
};

/** 计算母亲节 / 父亲节 / 感恩节这类"第 N 个星期 X"形式的节日（限美国习惯） */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  const first = new Date(y, m - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/**
 * 给定阳历日期，返回节日信息（公历 + 农历 + 二十四节气）
 */
export interface HolidayInfo {
  /** 公历节日名（如"国庆节"），无则空 */
  solar: string;
  /** 农历转公历的传统节日名（如"中秋节"），无则空 */
  lunar: string;
  /** 节气名（如"立春"），无则空 */
  jieqi: string;
  /** 选一个最显眼的作为"主要节日"展示 */
  primary: string;
  /** primary 的类型，便于上色 */
  primaryKind: 'solar' | 'lunar' | 'jieqi' | '';
}

export function getHolidayInfo(dateStr: string): HolidayInfo {
  const [y, m, d] = dateStr.split('-').map(Number);

  const solar = SOLAR_HOLIDAYS[`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`] || '';

  const lunar = Solar.fromYmd(y, m, d).getLunar();
  const lunarName =
    lunar.getFestivals()?.length ? lunar.getFestivals()[0] : '';
  const jieqi = lunar.getJieQi() ?? '';

  let primary = '';
  let primaryKind: HolidayInfo['primaryKind'] = '';
  if (solar) {
    primary = solar;
    primaryKind = 'solar';
  } else if (lunarName) {
    primary = lunarName;
    primaryKind = 'lunar';
  } else if (jieqi) {
    primary = jieqi;
    primaryKind = 'jieqi';
  }

  return { solar, lunar: lunarName, jieqi, primary, primaryKind };
}

/**
 * 同年同月的节日预览（用于月份头部一览）
 */
export function getMonthlySolarHolidays(year: number, month: number): Array<{ day: number; name: string }> {
  const out: Array<{ day: number; name: string }> = [];
  for (const [md, name] of Object.entries(SOLAR_HOLIDAYS)) {
    const [m, d] = md.split('-').map(Number);
    if (m === month) out.push({ day: d, name });
  }

  // 母亲节：5 月第 2 个周日
  if (month === 5) out.push({ day: nthWeekday(year, 5, 0, 2), name: '母亲节' });
  // 父亲节：6 月第 3 个周日
  if (month === 6) out.push({ day: nthWeekday(year, 6, 0, 3), name: '父亲节' });
  // 感恩节：11 月第 4 个周四
  if (month === 11) out.push({ day: nthWeekday(year, 11, 4, 4), name: '感恩节' });

  out.sort((a, b) => a.day - b.day);
  return out;
}

