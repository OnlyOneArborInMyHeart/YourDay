import db from './db.js';
import { todayLocal, addDays } from './dateUtils.js';

/**
 * 每天第一次被调用时执行：把"昨天"已完成的事项（顶 todos + 全部 events）
 * 自动 append 到对应日期的 diary_entries.markdown_content 末尾，以列表形式记录。
 *
 * 同 carryover 的 lazy 兜底：模块级缓存 lastArchiveTickDate 防止同日重复跑。
 * 若进程重启，缓存重置——重复执行也无害，因为 diary_archive_log 表持久化兜底。
 *
 * 触发时机与 carryover 同步：
 *   - 启动时（server.js）
 *   - 每天 00:00:05（startCarryOverScheduler）
 *   - 每次访问 events 列表（lazy）
 */
let lastArchiveTickDate = null;

/**
 * 从 ISO-like 时间戳（YYYY-MM-DD HH:MM:SS）里截取本地日期部分。
 * DB 里 completed_at 是 `datetime('now','localtime')`，形如 "2026-08-21 22:34:11"。
 */
function localDateFromTs(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * 拉取指定日期"昨天之前已完成"的事项（todo / event），跳过已写入日志的。
 *
 * 返回 { todos: [...], events: [...] }，每条带 kind 方便写入时拼路径。
 *
 * 仅拉顶级 todo（parent_id IS NULL）：子项归属父项之下，不视为独立事项；
 * 当父项因"所有兄弟都 done"联动标完成时，父项本身有 completed_at 可被记。
 *
 * 不限事件 is_todo：跨日顺延后 is_todo=1 的纯待办同理归入（它在用户感知中
 * 也是"需要做的一件事"）。
 */
function loadItemsCompletedOn(targetDate) {
  const tsPrefix = `${targetDate}%`;

  const todos = db
    .prepare(
      `SELECT id, title, completed_at FROM todos
       WHERE done = 1
         AND parent_id IS NULL
         AND completed_at LIKE ?
         AND NOT EXISTS (
           SELECT 1 FROM diary_archive_log
           WHERE diary_archive_log.date = ? AND kind = 'todo' AND item_id = todos.id
         )
       ORDER BY completed_at ASC, id ASC`
    )
    .all(tsPrefix, targetDate);

  const events = db
    .prepare(
      `SELECT id, title, start_time, end_time, completed_at FROM events
       WHERE done = 1
         AND completed_at LIKE ?
         AND NOT EXISTS (
           SELECT 1 FROM diary_archive_log
           WHERE diary_archive_log.date = ? AND kind = 'event' AND item_id = events.id
         )
       ORDER BY completed_at ASC, id ASC`
    )
    .all(tsPrefix, targetDate);

  return { todos, events };
}

/**
 * 把事项数组渲染为 markdown 列表项。
 * - todo: "- [x] 标题"
 * - event: "- [x] 标题（HH:MM–HH:MM）"，无 start_time 时只显示标题
 */
function renderTodoLine(t) {
  const title = String(t.title ?? '').replace(/[\r\n]+/g, ' ').trim();
  return `- [x] ${title}`;
}

function renderEventLine(e) {
  const title = String(e.title ?? '').replace(/[\r\n]+/g, ' ').trim();
  const st = e.start_time || '';
  const et = e.end_time || '';
  if (st && et) return `- [x] ${title}（${st}–${et}）`;
  if (st) return `- [x] ${title}（起 ${st}）`;
  return `- [x] ${title}`;
}

/**
 * 把列表追加到指定日期的 diary_entries.markdown_content 末尾；
 * 若 diary 不存在则创建（title 空）。
 *
 * 重复 tick 不会重复追加，因为我们是用日志先过滤；写入成功后立即写日志。
 * 即便同一条已经被人工撤回 completed_at 再重新标完成，二次 tick 仍能识别
 * （completed_at 又升到 targetDate 了，但日志里有记录会跳过——这是预期
 * 行为，重复归档对用户体验无意义）。
 */
function appendArchiveToDiary(targetDate, lines) {
  if (lines.length === 0) return;
  // 块标题：用 "## 完成的事项 (YYYY-MM-DD)"，方便阅读时折叠、避免与用户内容混淆
  const block = `\n\n## 完成的事项 (${targetDate})\n${lines.join('\n')}\n`;
  const existing = db
    .prepare('SELECT markdown_content FROM diary_entries WHERE date = ?')
    .get(targetDate);
  const baseContent = existing?.markdown_content ?? '';
  const stripped = baseContent.replace(/\s+$/, ''); // 去掉原尾部空白，避免空行堆积
  const next = `${stripped}${block}`;
  db.prepare(
    `INSERT INTO diary_entries (date, title, markdown_content, updated_at)
     VALUES (?, '', ?, datetime('now','localtime'))
     ON CONFLICT(date) DO UPDATE SET
       markdown_content = excluded.markdown_content,
       updated_at = datetime('now','localtime')`
  ).run(targetDate, next);
}

/**
 * 把归档过的 (targetDate, kind, item_id) 写入日志，事务里和 markdown 更新同步。
 */
function markArchived(targetDate, kind, items) {
  if (items.length === 0) return;
  const insertLog = db.prepare(
    `INSERT OR IGNORE INTO diary_archive_log (date, kind, item_id) VALUES (?, ?, ?)`
  );
  const tx = db.transaction((rows) => {
    for (const r of rows) insertLog.run(targetDate, kind, r.id);
  });
  tx(items);
}

/**
 * 把"目标日"完成的事项归档到当天的日记末尾。
 * targetDate 默认 = 昨天（相对 todayLocal）。可手工指定以补跑历史。
 *
 * 返回 { archivedTodos, archivedEvents, diaryDate }。
 */
export function archiveCompletedToDay(targetDate) {
  const { todos, events } = loadItemsCompletedOn(targetDate);

  const lines = [];
  // 顺序：event 在前（通常更具"今日节奏"），todo 在后
  for (const e of events) lines.push(renderEventLine(e));
  for (const t of todos) lines.push(renderTodoLine(t));

  const tx = db.transaction(() => {
    appendArchiveToDiary(targetDate, lines);
    // 即便 lines 为空也得走完事务，但日志只写真有内容的
    if (events.length > 0) markArchived(targetDate, 'event', events);
    if (todos.length > 0) markArchived(targetDate, 'todo', todos);
  });
  tx();

  if (lines.length > 0) {
    console.log(
      `[diary-archive] 已将 ${lines.length} 条已完成事项归档到 ${targetDate} 的日记末尾`
    );
  }
  return { archivedTodos: todos.length, archivedEvents: events.length, diaryDate: targetDate };
}

/**
 * 主入口：每天第一次被调用时执行一次——把"昨天"归档。
 */
export function archiveCompletedToYesterdayIfNewDay() {
  const today = todayLocal();
  if (lastArchiveTickDate === today) {
    return { archivedTodos: 0, archivedEvents: 0, diaryDate: addDays(today, -1), skipped: true };
  }
  const yesterday = addDays(today, -1);
  const res = archiveCompletedToDay(yesterday);
  lastArchiveTickDate = today;
  return res;
}

/**
 * 服务启动时调用一次，兜底跨过 N 天未启动 / 时钟回拨等场景。
 */
export function runArchiveNow(reason = 'startup') {
  const today = todayLocal();
  const yesterday = addDays(today, -1);
  const res = archiveCompletedToDay(yesterday);
  if (res.archivedTodos > 0 || res.archivedEvents > 0) {
    console.log(`[diary-archive] (${reason}) 归档昨日已完成 ${res.archivedTodos + res.archivedEvents} 条`);
  }
  return res;
}

export { loadItemsCompletedOn, renderTodoLine, renderEventLine };
