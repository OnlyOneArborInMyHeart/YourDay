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
 *
 * 数量型拆解（decomposeTaskByQuantity）：
 *   - 输入：动词 + 数字 + 量词 + 名词 + 截止日
 *   - 输出：每天一条无时间 To-do
 *   - 递减权重分配（与时间型一致，但单位为"个数/页数/次数"）
 *   - MIN_PER_DAY = 1（不允许 0，但允许当天已无剩余）
 *   - 总和 = totalAmount（精确，误差 0）
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

/* ─────────────────────────────────────────── */
/*  数量型拆解（动词 + 数字 + 量词 + 名词）          */
/* ─────────────────────────────────────────── */

/**
 * 智能解析用户输入的中文"动词+数字+量词+名词"句子。
 *
 * 例子：
 *   - "读50页书"      → { verb:'读', amount:50, unit:'页',  noun:'书' }
 *   - "背 30 个 单词" → { verb:'背', amount:30, unit:'个',  noun:'单词' }
 *   - "看完 12 章 教材" → { verb:'看完', amount:12, unit:'章', noun:'教材' }
 *   - "跑步 5 公里"   → { verb:'跑步', amount:5, unit:'公里', noun:'' }
 *   - "做 200 题"     → { verb:'做', amount:200, unit:'题',  noun:'' }
 *
 * 返回值：
 *   - 解析成功 → { ok:true, parsed }
 *   - 解析失败 → { ok:false, reason }
 */
export interface ParsedQuantityTask {
  verb: string;
  amount: number;
  unit: string;
  noun: string;
  /** 完整原文（兜底显示） */
  raw: string;
}

export type ParseResult =
  | { ok: true; parsed: ParsedQuantityTask }
  | { ok: false; reason: string };

const COMMON_UNITS = [
  // 中文量词
  '页','篇','章','节','卷','本','册','题','道','题','问','个','只','条','次',
  '趟','遍','轮','回','期','场','步','拍','组','段','张','块','片','滴','粒',
  '颗','杯','瓶','袋','盒','箱','件','套','双','对','副','位','名','班','所',
  // 英文 / 数字单位
  '公里','千米','米','km','Km','KM','斤','公斤','kg','Kg','KG','g','G',
  '小时','分钟','分钟','秒钟','ms','秒',
];

export function parseQuantitySentence(input: string): ParseResult {
  const raw = (input || '').trim();
  if (!raw) return { ok: false, reason: '请输入任务描述' };

  // 1) 取数字（整数 / 小数 / 中文数字）
  const cnDigits: Record<string, string> = {
    零:'0', 一:'1', 二:'2', 两:'2', 三:'3', 四:'4', 五:'5',
    六:'6', 七:'7', 八:'8', 九:'9', 十:'10',
  };
  // 1.1 优先匹配阿拉伯数字
  let amount = -1;
  let amountStr = '';
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  if (m) {
    amount = parseFloat(m[1]);
    amountStr = m[1];
  } else {
    // 1.2 兜底：中文数字 1–10（单字 或 "十X" 或 "X十" 两种组合）
    const cnSingle = raw.match(/[零一二两三四五六七八九十]/);
    if (cnSingle) {
      // "五十" = 50；"三十五" = 35
      const cnMatch = raw.match(/([零一二两三四五六七八九]?[零一二两三四五六七八九]?十[零一二两三四五六七八九]?)|([零一二两三四五六七八九])/);
      if (cnMatch) {
        const expr = cnMatch[0];
        if (expr.includes('十')) {
          // 拆解 "X十Y"
          const parts = expr.split('十');
          const tens = parts[0];
          const ones = parts[1];
          const t = tens ? (parseInt(cnDigits[tens], 10) || 1) : 1;
          const o = ones ? parseInt(cnDigits[ones], 10) : 0;
          amount = t * 10 + o;
          amountStr = expr;
        } else {
          amount = parseInt(cnDigits[expr], 10);
          amountStr = expr;
        }
      } else {
        amount = parseInt(cnDigits[cnSingle[0]], 10);
        amountStr = cnSingle[0];
      }
    }
  }

  if (amount <= 0 || !Number.isFinite(amount)) {
    return { ok: false, reason: '请在描述里包含一个数字（如 50、30、12.5）' };
  }

  // 2) 取量词：在数字之后第一个匹配 COMMON_UNITS 的子串
  const afterNumber = raw.slice(raw.indexOf(amountStr) + amountStr.length).trim();
  // 把 afterNumber 内的中文标点去掉
  const cleanedAfter = afterNumber.replace(/[，。！？、；：,!?;:.\s]/g, '');
  let unit = '';
  let noun = '';
  // 按"从长到短"匹配量词（"公里" 优先于 "米"）
  const sortedUnits = [...COMMON_UNITS].sort((a, b) => b.length - a.length);
  for (const u of sortedUnits) {
    if (cleanedAfter.startsWith(u)) {
      unit = u;
      noun = cleanedAfter.slice(u.length).trim();
      break;
    }
  }
  // 没匹配到已知量词：取 cleanedAfter 的第一个汉字作为量词，剩下作为名词
  if (!unit) {
    const firstChar = cleanedAfter.charAt(0);
    if (firstChar && /[\u4e00-\u9fa5]/.test(firstChar)) {
      unit = firstChar;
      noun = cleanedAfter.slice(1).trim();
    } else {
      // 完全没有量词：默认 "次"
      unit = '次';
      noun = cleanedAfter;
    }
  }

  // 3) 取动词：数字之前的中文 / 英文开头部分作为动词
  const beforeNumber = raw.slice(0, raw.indexOf(amountStr)).trim();
  let verb = beforeNumber;
  // 如果动词部分夹杂了标点，去掉并保留中文/英文
  verb = verb.replace(/[，。！？、；：,!?;:.\s]/g, '').trim();
  if (!verb) {
    // 没动词：默认 "完成"
    verb = '完成';
  }
  // 截断过长的动词（一般不超过 6 字）
  if (verb.length > 8) verb = verb.slice(0, 8);

  return {
    ok: true,
    parsed: { verb, amount, unit, noun, raw },
  };
}

/**
 * 按"数量"拆解到每天的"无时间任务"。
 *
 * 输入：动词 + 总数 + 量词 + 名词 + 截止日
 * 输出：每天一条无时间 To-do（is_todo=1），title 形如 "读 8 页 书"
 *
 * 算法复用时间型的递减权重（buildWeights + allocateAmount）。
 */
export interface DecomposeByQuantityInput {
  startDate: string;
  deadline: string;
  totalAmount: number;
  decay?: number;
  /** 自定义最小单日量，默认 1 */
  minPerDay?: number;
}

export interface DecomposedQuantitySlot {
  date: string;
  amount: number;
  /**
   * 渲染好的标题片段，如 "读 8 页" / "读完 1 章节"
   * 完整条目形如：${verb}${amount}${unit} ${noun}
   */
  displayAmount: string;
}

export interface DecomposeQuantityResult {
  slots: DecomposedQuantitySlot[];
  warnings: string[];
  totalAmount: number;
  days: number;
}

/**
 * 分配每天的整数个数。
 * - 不允许出现 0（保证每天都至少有 1）
 * - 总量 = totalAmount（精确无误差）
 *
 * 策略：
 *   1. 用递减权重算每片 ideal = weight × total，四舍五入
 *   2. 把所有 < min 的 slot 从 weight 最大（值最大）的相邻 slot "偷"过来，
 *      但偷完后 donor 也不能 < min
 *   3. 用剩余总和修正差额
 */
function allocateAmounts(weights: number[], total: number, min: number): number[] {
  const n = weights.length;
  let result = weights.map((w) => Math.round(w * total));

  // 1. 修正 < min 的 slot：从权重最大的 slot 偷
  //    偷的 donor 选择：值最大且 > min（这样最少变 1）
  let safety = 0;
  while (safety++ < 1000) {
    const belowIdx = result.findIndex((v) => v < min);
    if (belowIdx < 0) break;
    const deficit = min - result[belowIdx];
    // 找最大的 donor
    let donor = -1;
    let maxVal = -1;
    for (let j = 0; j < n; j++) {
      if (j === belowIdx) continue;
      if (result[j] > maxVal && result[j] > min) {
        maxVal = result[j];
        donor = j;
      }
    }
    if (donor < 0) {
      // 全部 donor 都不能让（极端：n 过大且 total 偏小）
      // 直接补到 min
      result[belowIdx] = min;
      break;
    }
    const give = Math.min(deficit, result[donor] - min);
    result[belowIdx] += give;
    result[donor] -= give;
  }

  // 2. 修正总和
  let diff = total - result.reduce((a, b) => a + b, 0);
  // 优先从权重小（值小）的 slot 调
  const order = result.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  let k = 0;
  while (diff !== 0 && k < 1000) {
    const { i } = order[k % n];
    if (diff > 0) {
      result[i]++;
      diff--;
    } else if (result[i] > min) {
      result[i]--;
      diff++;
    }
    k++;
  }
  // 兜底
  if (diff !== 0) result[n - 1] = Math.max(min, result[n - 1] + diff);

  return result;
}

export function decomposeTaskByQuantity(input: DecomposeByQuantityInput): DecomposeQuantityResult {
  const {
    startDate,
    deadline,
    totalAmount,
    decay = DEFAULT_DECAY,
    minPerDay = 1,
  } = input;

  if (!startDate || !deadline) throw new Error('请填写起止日期');
  if (startDate > deadline) throw new Error('截止日期不能早于开始日期');
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('数量必须为正数');
  }
  if (minPerDay < 1) throw new Error('每天最少 1');

  const dates = dateRange(startDate, deadline);
  if (dates.length === 0) throw new Error('日期范围无效');

  const n = dates.length;
  const warnings: string[] = [];

  // 总量少于 天数 × 每天最少 —— 警告，但仍允许（每天恰好 1）
  const finalMinPerDay = Math.min(minPerDay, Math.max(1, Math.floor(totalAmount / n)));

  let amounts: number[];
  if (totalAmount < n * finalMinPerDay) {
    warnings.push(
      `总数 ${totalAmount} 不足以每天分到 ${finalMinPerDay}，已自动调整为可行的最小方案`
    );
    amounts = new Array(n).fill(0);
    let remaining = totalAmount;
    for (let i = 0; i < n; i++) {
      amounts[i] = Math.min(finalMinPerDay, remaining);
      remaining -= amounts[i];
      if (remaining <= 0) break;
    }
  } else {
    const weights = buildWeights(n, decay);
    amounts = allocateAmounts(weights, totalAmount, finalMinPerDay);

    const maxSlot = Math.max(...amounts);
    const avgPerDay = totalAmount / n;
    if (avgPerDay < 1) {
      warnings.push(`日均不足 1，建议把工期缩短`);
    }
    if (maxSlot > Math.max(2, avgPerDay * 2)) {
      warnings.push(`某天量是平均的 2 倍以上，强度偏高`);
    }
  }

  const slots: DecomposedQuantitySlot[] = amounts.map((amount, i) => ({
    date: dates[i],
    amount,
    displayAmount: `${amount}`,
  }));

  return { slots, warnings, totalAmount, days: n };
}

/**
 * 渲染一条无时间 To-do 的 title：
 *   "{verb} {amount} {unit} {noun}"
 * - 如果 noun 为空："{verb} {amount} {unit}"
 * - amount 为 0 时返回空字符串（前端 UI 跳过）
 */
export function renderQuantityTodoTitle(
  parsed: ParsedQuantityTask,
  amount: number
): string {
  if (amount <= 0) return '';
  const parts: string[] = [];
  if (parsed.verb) parts.push(parsed.verb);
  parts.push(`${amount}`);
  if (parsed.unit) parts.push(parsed.unit);
  if (parsed.noun) parts.push(parsed.noun);
  return parts.join(' ');
}
