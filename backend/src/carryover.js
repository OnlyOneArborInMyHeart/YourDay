import db from './db.js';
import { todayLocal, addDays } from './dateUtils.js';
import { runArchiveNow as runArchiveNowFn } from './diaryArchive.js';

/**
 * 重新导出，便于其他模块直接从 carryover 拿日期工具（保持兼容）。
 */
export { todayLocal, addDays };

/**
 * 找出所有 date < today 且 done = 0 的事件，把它们一路顺延到 today。
 *
 * 顺延规则：
 * - 把 date 推进一天
 * - 清空 start_time / end_time（变成无时间任务）
 * - is_todo 置 1（标记为纯待办，再次只显示在右侧 To-do）
 * - updated_at / created_at 不动；completed_at 保持 NULL（没完成过）
 *
 * 一次循环处理：如果一台机器连续多天没启动，顺延函数会一次性把过期 N 天的任务推到 today。
 */
export function carryOverUnfinishedUpToToday() {
  const today = todayLocal();

  const stmtFind = db.prepare(`
    SELECT id, date, original_date
    FROM events
    WHERE done = 0 AND date < ?
  `);
  const stmtUpdateFirstCarry = db.prepare(`
    UPDATE events
    SET date = ?,
        start_time = NULL,
        end_time = NULL,
        is_todo = 1,
        original_date = COALESCE(original_date, date),
        updated_at = datetime('now','localtime')
    WHERE id = ?
  `);
  const stmtUpdate = db.prepare(`
    UPDATE events
    SET date = ?,
        start_time = NULL,
        end_time = NULL,
        is_todo = 1,
        updated_at = datetime('now','localtime')
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    const rows = stmtFind.all(today);
    let moved = 0;
    for (const row of rows) {
      // 首次顺延时（original_date 为 NULL），把当时的 date 写入 original_date；
      // 后续顺延只推进 date，original_date 保持首次值。
      if (row.original_date == null) {
        stmtUpdateFirstCarry.run(today, row.id);
      } else {
        stmtUpdate.run(today, row.id);
      }
      moved++;
    }
    return moved;
  });

  const moved = tx();
  if (moved > 0) {
    console.log(`[carryover] 跨日顺延 ${moved} 条未完成任务 → ${today}`);
  }
  return moved;
}

/**
 * 启动时调用一次 + 每次 GET events 时再调一次（lazy 兜底）。
 * 如果进程长时间运行跨过午夜，定时任务也会触发。
 */
let lastDailyTickDate = null;

/**
 * 每天第一次被调用时执行顺延。后续同日调用直接跳过。
 * 用于 GET /api/events 路径：每天首次读 events 都做一次兜底。
 */
export function carryOverTickIfNewDay() {
  const today = todayLocal();
  if (lastDailyTickDate === today) return 0;
  const moved = carryOverUnfinishedUpToToday();
  lastDailyTickDate = today;
  return moved;
}

/**
 * 启动定时任务：每天 00:00:05 触发一次顺延。
 * 即使进程一直开着也能跨过午夜。
 */
export function startCarryOverScheduler() {
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 0, 5, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next - now;
    setTimeout(() => {
      runCarryOverNow('midnight');
      runArchiveNowFn('midnight');
      scheduleNext();
    }, delay);
    console.log(`[carryover] 下次跨日顺延任务安排在 ${next.toLocaleString()}`);
  }
  scheduleNext();
}

export function runCarryOverNow(reason = 'manual') {
  const moved = carryOverUnfinishedUpToToday();
  if (moved > 0) console.log(`[carryover] (${reason}) 顺延 ${moved} 条未完成任务`);
  return moved;
}