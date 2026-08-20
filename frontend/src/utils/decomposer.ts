/**
 * 任务拆解算法
 *
 * 目标：把"总工时"按"截止日 - 起始日"分散到每一天，
 *       让前期重、后期轻，呈自然递减曲线，降低心理压力。
 *
 * 策略：
 *   - 递减权重分配（可配置 decay 强度）
 *   - 权重方向始终从大到小（第一天最重）
 *   - MIN_PER_DAY = 30 分钟兜底（防止碎片化）
 *   - 无硬性 MAX 上限；超大 slot 由 UI 警告 + 进度条宽度提示
 *   - 跨日 slot（>5h）：end_time 在次日，标记 overnight
 *   - 总和 = totalMinutes（精确，误差 0）
 */

import { shiftDay } from './date';

export const MIN_PER_DAY = 30;        // 分钟：每段最低 30 分钟
export const MAX_CONTINUOUS = 300;   // 分钟（5 小时）：超此值 end_time 跨午夜
export const DEFAULT_DECAY = 0.7;     // 递减强度
export const DEFAULT_START_HOUR = 19; // 默认每天 19:00 开始

export interface DecomposeInput {
  startDate: string;
  deadline: string;
  totalHours: number;
  dailyStartHour?: number;
  decay?: number;
}

export interface DecomposedSlot {
  date: string;
  /** 工时（分钟） */
  minutes: number;
  start_time: string;  // HH:MM
  end_time: string;   // HH:MM（可能跨午夜）
  /** 是否跨午夜（end_time 在次日） */
  overnight: boolean;
}

export interface DecomposeResult {
  slots: DecomposedSlot[];
  warnings: string[];
  totalMinutes: number;
  days: number;
}

/* ─────────────────────────────── */
/*  工具函数                            */
/* ─────────────────────────────── */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function minutesToHHMM(min: number): string {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  for (let i = 0; i < 365; i++) {
    dates.push(cursor);
    if (cursor === end) break;
    cursor = shiftDay(cursor, 1);
  }
  return dates;
}

/**
 * 递减权重列表（归一化，总和 = 1）
 * decay=0   → 全部相等（均匀分配）
 * decay=0.7 → 每天递减约 1.175x（第一天 ≈ 1.7× 平均）
 * decay=1   → 每天递减 2x（第一天 = 2× 最后一天）
 */
function buildWeights(n: number, decay: number): number[] {
  if (n === 1) return [1];
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    raw.push(1 + decay * (1 - i / (n - 1)));
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/**
 * 分配每天工时（分钟）
 *
 * 算法（Rounded-Weighted + Min-Guard）：
 *   1. 计算每个 ideal = weight × total
 *   2. 对每个 ideal 做 round（就近取整）
 *   3. 如果有 slot < MIN_PER_DAY，用剩余量补足（从权重小的 slot 偷）
 *   4. 若仍有 < MIN，补到 MIN，并从其他 slot（权重大的优先）扣回
 *   5. 再次 round 保证总和 = total
 *
 * 不设硬性 MAX 上限；超量由 UI 提示。
 */
function allocateMinutes(weights: number[], total: number): number[] {
  const n = weights.length;
  let result = weights.map((w) => Math.round(w * total));

  // 补足 < MIN 的 slot：从权重最小、值最大的 slot 偷
  const belowMin = result.map((v, i) => (v < MIN_PER_DAY ? i : -1)).filter((i) => i >= 0);
  for (const i of belowMin) {
    const deficit = MIN_PER_DAY - result[i];
    // 从权重最小（值最大）的 slot 补
    let donor = -1;
    let maxVal = -Infinity;
    for (let j = n - 1; j >= 0; j--) {
      if (j !== i && result[j] > maxVal) {
        maxVal = result[j];
        donor = j;
      }
    }
    if (donor >= 0 && result[donor] > MIN_PER_DAY) {
      const give = Math.min(deficit, result[donor] - MIN_PER_DAY);
      result[i] += give;
      result[donor] -= give;
    }
  }

  // 二次修正：保证总和 = total
  let diff = total - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n && diff !== 0; i++) {
    if (diff > 0 && result[i] >= MIN_PER_DAY) {
      result[i]++;
      diff--;
    } else if (diff < 0 && result[i] > MIN_PER_DAY) {
      result[i]--;
      diff++;
    }
  }

  // 兜底对齐（极罕见）
  if (diff !== 0) result[n - 1] = Math.max(MIN_PER_DAY, result[n - 1] + diff);

  return result;
}

/* ─────────────────────────────── */
/*  时段构建                            */
/* ─────────────────────────────── */

function buildSlots(
  dates: string[],
  minutes: number[],
  startHour: number
): DecomposedSlot[] {
  const startMin = startHour * 60;

  return dates.map((date, i) => {
    const m = Math.max(0, minutes[i] ?? 0);

    if (m === 0) {
      return {
        date,
        minutes: 0,
        start_time: minutesToHHMM(startMin),
        end_time: minutesToHHMM(startMin),
        overnight: false,
      };
    }

    const rawEndMin = startMin + m;

    if (m > MAX_CONTINUOUS) {
      // 超 5 小时：跨到次日（按次日分钟数显示）
      const nextDayMin = m - MAX_CONTINUOUS;
      return {
        date,
        minutes: m,
        start_time: minutesToHHMM(startMin),
        end_time: minutesToHHMM(nextDayMin),
        overnight: true,
      };
    }

    return {
      date,
      minutes: m,
      start_time: minutesToHHMM(startMin),
      end_time: minutesToHHMM(rawEndMin),
      overnight: rawEndMin >= 24 * 60,
    };
  });
}

/* ─────────────────────────────── */
/*  主函数                               */
/* ─────────────────────────────── */

export function decomposeTask(input: DecomposeInput): DecomposeResult {
  const {
    startDate,
    deadline,
    totalHours,
    dailyStartHour = DEFAULT_START_HOUR,
    decay = DEFAULT_DECAY,
  } = input;

  if (!startDate || !deadline) throw new Error('请填写起止日期');
  if (startDate > deadline) throw new Error('截止日期不能早于开始日期');
  if (!Number.isFinite(totalHours) || totalHours <= 0) {
    throw new Error('预估工时必须为正数');
  }

  const dates = dateRange(startDate, deadline);
  if (dates.length === 0) throw new Error('日期范围无效');

  const totalMinutes = Math.round(totalHours * 60);
  const n = dates.length;
  const warnings: string[] = [];

  let minutes: number[];

  /* —— 边界：总工时过少 —— */
  if (totalMinutes < n * MIN_PER_DAY) {
    const weights = buildWeights(n, decay);
    minutes = weights.map((w) => Math.round(w * totalMinutes));
    const sum = minutes.reduce((a, b) => a + b, 0);
    minutes[n - 1] = Math.max(0, minutes[n - 1] + (totalMinutes - sum));
    if (totalMinutes < 60) {
      warnings.push(`总工时仅 ${totalMinutes} 分钟，建议至少 1 小时`);
    } else {
      warnings.push(`工作窗口 ${n} 天过长，建议把截止日提前`);
    }
  }
  /* —— 常规：按权重分配 —— */
  else {
    minutes = allocateMinutes(buildWeights(n, decay), totalMinutes);

    // 警告策略
    const avgPerDay = Math.round(totalMinutes / n);
    const maxSlot = Math.max(...minutes);

    if (n <= 3 && totalHours > n * 2) {
      warnings.push(`工期较紧（${n} 天 / ${totalHours} 小时），建议延长截止日期以减轻压力`);
    }
    if (maxSlot > 180) {
      warnings.push(`某天工时超过 3 小时，建议拆分任务或延长工期`);
    }
    if (avgPerDay < 30) {
      warnings.push(`日均工时低于 30 分钟，任务过于碎片化`);
    }
  }

  const slots = buildSlots(dates, minutes, dailyStartHour);
  const overnightSlots = slots.filter((s) => s.overnight);
  if (overnightSlots.length > 0) {
    warnings.push(
      `其中 ${overnightSlots.length} 段超过 5 小时，结束时间跨到次日（建议拆分任务）`
    );
  }

  return { slots, warnings, totalMinutes, days: n };
}

/** 分钟 → "X 小时 Y 分钟" */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`;
}

/** 两日期间天数（含两端） */
export function daysBetweenInclusive(start: string, end: string): number {
  return dateRange(start, end).length;
}
