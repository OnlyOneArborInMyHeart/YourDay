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
 * 拉取指定用户 + 指定日期"昨天之前已完成"的事项（todo / event），跳过已写入日志的。
 *
 * 返回 { todos: [...], events: [...] }，每条带 kind 方便写入时拼路径。
 *
 * 仅拉顶级 todo（parent_id IS NULL）：子项归属父项之下，不视为独立事项；
 * 当父项因"所有兄弟都 done"联动标完成时，父项本身有 completed_at 可被记。
 *
 * 不限事件 is_todo：跨日顺延后 is_todo=1 的纯待办同理归入（它在用户感知中
 * 也是"需要做的一件事"）。
 */
function loadItemsCompletedOn(targetDate, userId) {
  const tsPrefix = `${targetDate}%`;

  const todos = db
    .prepare(
      `SELECT id, title, priority, completed_at FROM todos
       WHERE user_id = ?
         AND done = 1
         AND parent_id IS NULL
         AND completed_at LIKE ?
         AND NOT EXISTS (
           SELECT 1 FROM diary_archive_log
           WHERE diary_archive_log.date = ? AND diary_archive_log.user_id = ? AND kind = 'todo' AND item_id = todos.id
         )
       ORDER BY completed_at ASC, id ASC`
    )
    .all(userId, tsPrefix, targetDate, userId);

  const events = db
    .prepare(
      `SELECT id, title, priority, start_time, end_time, completed_at FROM events
       WHERE user_id = ?
         AND done = 1
         AND completed_at LIKE ?
         AND NOT EXISTS (
           SELECT 1 FROM diary_archive_log
           WHERE diary_archive_log.date = ? AND diary_archive_log.user_id = ? AND kind = 'event' AND item_id = events.id
         )
       ORDER BY completed_at ASC, id ASC`
    )
    .all(userId, tsPrefix, targetDate, userId);

  return { todos, events };
}

/**
 * 把事项数组渲染为 markdown 列表项。
 * - todo: "- [x] 标题"
 * - event: "- [x] 标题（HH:MM–HH:MM）"，无 start_time 时只显示标题
 *
 * 每条上方附一行隐藏的 HTML 注释，把 priority / id / 起止时间编进去；
 * 前端日历视图解析该注释来还原"已完成事项"的元数据用于按优先级染色等。
 * 注释对 markdown 渲染无副作用。
 */
function renderTodoLine(t) {
  const title = String(t.title ?? '').replace(/[\r\n]+/g, ' ').trim();
  const meta = `<!-- a:todo,id=${t.id},p=${t.priority ?? 3} -->`;
  return `${meta}\n- [x] ${title}`;
}

function renderEventLine(e) {
  const title = String(e.title ?? '').replace(/[\r\n]+/g, ' ').trim();
  const st = e.start_time || '';
  const et = e.end_time || '';
  const meta = `<!-- a:event,id=${e.id},p=${e.priority ?? 3}${st ? `,st=${st}` : ''}${et ? `,et=${et}` : ''} -->`;
  let line;
  if (st && et) line = `- [x] ${title}（${st}–${et}）`;
  else if (st) line = `- [x] ${title}（起 ${st}）`;
  else line = `- [x] ${title}`;
  return `${meta}\n${line}`;
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
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把 lines（单个字符串数组，每元素 = "<!-- a:... -->\n- [x] ..."）追加到
 * targetDate 那篇日记的 `## 完成的事项 (targetDate)` 块末尾。
 *
 * 逐行扫描 baseContent（不依赖脆弱的 $ 行尾匹配），精确定位块边界：
 *   - 块开始：某行 === blockHeader（严格相等，去首尾空格）
 *   - 块结束：遇到下一个以 `## ` 开头的非注释行，或文件末尾
 *   - 插入位置：块内最后一行列表项之后（第一个非空行后）
 *
 * 若该日期 diary 不存在 → INSERT 新行（含新建块）。
 * 若 diary 存在但块不存在 → 末尾追加新块。
 */
function appendArchiveToDiary(targetDate, lines, userId) {
  if (lines.length === 0) return;
  const existing = db
    .prepare('SELECT markdown_content FROM diary_entries WHERE user_id = ? AND date = ?')
    .get(userId, targetDate);
  const baseContent = existing?.markdown_content ?? '';
  const blockHeader = `## 完成的事项 (${targetDate})`;

  let next;
  if (baseContent.length === 0) {
    // diary 完全不存在 → 新建
    next = `${blockHeader}\n${lines.join('\n')}\n`;
  } else {
    const allLines = baseContent.split(/\r?\n/);
    // 找块起始下标（严格匹配，忽略首尾空格）
    const blockStartIdx = allLines.findIndex(
      (l) => l.trim() === blockHeader
    );
    if (blockStartIdx === -1) {
      // 块不存在 → 末尾追加
      next = (baseContent.replace(/\s+$/, '') || '') +
        `\n\n${blockHeader}\n${lines.join('\n')}\n`;
    } else {
      // 块存在 → 找块结束（下一个 ## 标题行，或文件末尾）
      let blockEndIdx = allLines.length; // 默认到末尾
      for (let i = blockStartIdx + 1; i < allLines.length; i++) {
        const t = allLines[i].trim();
        if (t.startsWith('## ') && !t.startsWith('<!-- ')) {
          blockEndIdx = i;
          break;
        }
      }
      // 块内容 = allLines[blockStartIdx+1 .. blockEndIdx-1]
      // 块末尾插入位置 = 第一个非空行之后（保留列表项之间的空行语义）
      const blockContent = allLines.slice(blockStartIdx + 1, blockEndIdx);
      let insertIdx = blockContent.length; // 默认插到末尾
      // 倒找最后一个非空行，插其后
      for (let i = blockContent.length - 1; i >= 0; i--) {
        if (blockContent[i].trim() !== '') {
          insertIdx = i + 1;
          break;
        }
      }
      const newBlockContent = [
        ...blockContent.slice(0, insertIdx),
        ...lines,
        ...blockContent.slice(insertIdx),
      ];
      next = [
        ...allLines.slice(0, blockStartIdx),
        blockHeader,
        ...newBlockContent,
        ...allLines.slice(blockEndIdx),
      ].join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }

  db.prepare(
    `INSERT INTO diary_entries (user_id, date, title, markdown_content, updated_at)
     VALUES (?, ?, '', ?, datetime('now','localtime'))
     ON CONFLICT(user_id, date) DO UPDATE SET
       markdown_content = excluded.markdown_content,
       updated_at = datetime('now','localtime')`
  ).run(userId, targetDate, next);
}

/**
 * 从日记 markdown 中删除指定事项的归档行（含其上方的 meta 注释）。
 *
 * 实现方式：按行扫描，逐行维护一个"是否跳过"的状态机。
 * - 遇到匹配目标 (kind, itemId) 的 `<!-- a:kind,id=N,... -->` 注释 → 标记下一行 list item 要跳过；
 *   同时跳过当前注释行本身。
 * - 否则保留。
 *
 * 返回 { diaryDate, removed }：若实际有内容被删除则 removed=true；diaryDate = 该事项
 * 在 log 里登记的归档日（用于校验"该事项确实在那天被归档过"）。
 */
function removeArchivedItemFromDiary(diaryDate, kind, itemId, userId) {
  const existing = db
    .prepare('SELECT markdown_content FROM diary_entries WHERE user_id = ? AND date = ?')
    .get(userId, diaryDate);
  if (!existing) return { diaryDate, removed: false };
  const lines = existing.markdown_content.split(/\r?\n/);
  const target = `<!-- a:${kind},id=${itemId},`;
  const listRe = /^-\s+\[x\]\s+/;
  const out = [];
  let skipNextList = false;
  let removed = false;
  for (const raw of lines) {
    if (raw.trim().startsWith(target)) {
      skipNextList = true;
      removed = true;
      continue; // 跳过注释行
    }
    if (skipNextList) {
      if (listRe.test(raw.trim())) {
        skipNextList = false;
        continue; // 跳过紧跟的 list item
      }
      // 注释行后没找到 list item（可能用户编辑过）—— 清状态，不跳过该行
      skipNextList = false;
    }
    out.push(raw);
  }
  if (!removed) return { diaryDate, removed: false };
  let next = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');

  // 若该归档块已清空（块标题后无任何列表项），整块移除，避免留"空标题"。
  // 块边界：块标题到下一个 `## ` 标题 / 文末。
  const blockHeader = `## 完成的事项 (${diaryDate})`;
  const headerRe = new RegExp(`(^|\\n)${escapeRe(blockHeader)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\s*$)`, 'm');
  const emptyBlockRe = new RegExp(
    `(^|\\n)${escapeRe(blockHeader)}\\s*\\n\\s*(?:\\n|$)`,
    'm'
  );
  if (emptyBlockRe.test(next + '\n')) {
    next = (next + '\n').replace(emptyBlockRe, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
    // 若整个 diary 内容除了块标题外完全没其他内容，留下空字符串（INSERT 仍会保留空 diary 行）
    // 但 diary 不为空场景下，把空块彻底移除
  }

  db.prepare(
    `UPDATE diary_entries SET markdown_content = ?, updated_at = datetime('now','localtime')
     WHERE user_id = ? AND date = ?`
  ).run(next, userId, diaryDate);
  return { diaryDate, removed: true };
}

/**
 * 单条 todo 取消完成时（done 1→0），反向操作：
 *   1) 从 log 找到该 todo 被归档到的日记日期（可能多个，跨多天罕见但理论存在——这里取所有）
 *   2) 删除对应日记 markdown 中的归档行
 *   3) 删 log 记录
 *   4) 不动 todo 表本身（completed_at 由调用方负责清空）
 *
 * 返回 { affectedDates, removedLines }
 */
export function unarchiveSingleTodo(todoId) {
  const logs = db
    .prepare(
      `SELECT date, user_id FROM diary_archive_log WHERE kind = 'todo' AND item_id = ? ORDER BY date`
    )
    .all(todoId);
  if (logs.length === 0) return { affectedDates: [], removedLines: 0 };
  const affected = [];
  let removedLines = 0;
  const tx = db.transaction(() => {
    for (const log of logs) {
      const r = removeArchivedItemFromDiary(log.date, 'todo', todoId, log.user_id);
      if (r.removed) {
        affected.push(log.date);
        removedLines++;
      }
    }
    db.prepare(
      `DELETE FROM diary_archive_log WHERE kind = 'todo' AND item_id = ?`
    ).run(todoId);
  });
  tx();
  if (removedLines > 0) {
    console.log(`[diary-archive] 取消完成触发反归档：todo#${todoId} → 删除 ${removedLines} 条归档`);
  }
  return { affectedDates: affected, removedLines };
}

/**
 * 单条 event 取消完成时（done 1→0），反向操作。
 */
export function unarchiveSingleEvent(eventId) {
  const logs = db
    .prepare(
      `SELECT date, user_id FROM diary_archive_log WHERE kind = 'event' AND item_id = ? ORDER BY date`
    )
    .all(eventId);
  if (logs.length === 0) return { affectedDates: [], removedLines: 0 };
  const affected = [];
  let removedLines = 0;
  const tx = db.transaction(() => {
    for (const log of logs) {
      const r = removeArchivedItemFromDiary(log.date, 'event', eventId, log.user_id);
      if (r.removed) {
        affected.push(log.date);
        removedLines++;
      }
    }
    db.prepare(
      `DELETE FROM diary_archive_log WHERE kind = 'event' AND item_id = ?`
    ).run(eventId);
  });
  tx();
  if (removedLines > 0) {
    console.log(`[diary-archive] 取消完成触发反归档：event#${eventId} → 删除 ${removedLines} 条归档`);
  }
  return { affectedDates: affected, removedLines };
}

/**
 * 把归档过的 (targetDate, kind, item_id) 写入日志，事务里和 markdown 更新同步。
 */
function markArchived(targetDate, kind, items, userId) {
  if (items.length === 0) return;
  const insertLog = db.prepare(
    `INSERT OR IGNORE INTO diary_archive_log (date, user_id, kind, item_id) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction((rows) => {
    for (const r of rows) insertLog.run(targetDate, userId, kind, r.id);
  });
  tx(items);
}

/**
 * 把"目标日"完成的事项归档到当天的日记末尾。
 * targetDate 默认 = 昨天（相对 todayLocal）。
 *
 * 返回 { archivedTodos, archivedEvents, diaryDate }。
 */
export function archiveCompletedToDay(targetDate, userId) {
  const { todos, events } = loadItemsCompletedOn(targetDate, userId);

  const lines = [];
  // 顺序：event 在前（通常更具"今日节奏"），todo 在后
  for (const e of events) lines.push(...renderEventLine(e).split('\n'));
  for (const t of todos) lines.push(...renderTodoLine(t).split('\n'));

  const tx = db.transaction(() => {
    appendArchiveToDiary(targetDate, lines, userId);
    // 即便 lines 为空也得走完事务，但日志只写真有内容的
    if (events.length > 0) markArchived(targetDate, 'event', events, userId);
    if (todos.length > 0) markArchived(targetDate, 'todo', todos, userId);
  });
  tx();

  if (lines.length > 0) {
    console.log(
      `[diary-archive] 已将 ${lines.length} 条已完成事项归档到 ${targetDate} 的日记末尾 (uid=${userId})`
    );
  }
  return { archivedTodos: todos.length, archivedEvents: events.length, diaryDate: targetDate };
}

/**
 * 把单条 todo 在 done 0→1 的瞬间，立刻追加到它"完成日"对应日记末尾。
 * 完成日 = completed_at 的本地日期部分。
 *
 * 用 diary_archive_log 防重复：已完成 → 重做已完成 → 取消 → 重新完成 等
 * 多次操作都不会重复追加。
 *
 * 若 completed_at 为空（极少见，例如从外部 SQL 改库），静默跳过。
 */
export function archiveSingleTodoNow(todoId) {
  const row = db
    .prepare(
      `SELECT id, title, priority, completed_at, user_id FROM todos
       WHERE id = ? AND done = 1 AND parent_id IS NULL`
    )
    .get(todoId);
  if (!row) return { archived: false, reason: 'not_done_or_missing' };
  const day = localDateFromTs(row.completed_at);
  if (!day) return { archived: false, reason: 'no_completed_at' };
  const already = db
    .prepare(
      `SELECT 1 FROM diary_archive_log WHERE date = ? AND user_id = ? AND kind = 'todo' AND item_id = ?`
    )
    .get(day, row.user_id, todoId);
  if (already) return { archived: false, reason: 'already_archived', diaryDate: day };

  const lines = renderTodoLine(row).split('\n');
  const tx = db.transaction(() => {
    appendArchiveToDiary(day, lines, row.user_id);
    markArchived(day, 'todo', [row], row.user_id);
  });
  tx();
  console.log(`[diary-archive] 完成动作触发归档：todo#${todoId} → ${day}`);
  return { archived: true, diaryDate: day };
}

/**
 * 同上，event 版。
 */
export function archiveSingleEventNow(eventId) {
  const row = db
    .prepare(
      `SELECT id, title, priority, start_time, end_time, completed_at, user_id FROM events
       WHERE id = ? AND done = 1`
    )
    .get(eventId);
  if (!row) return { archived: false, reason: 'not_done_or_missing' };
  const day = localDateFromTs(row.completed_at);
  if (!day) return { archived: false, reason: 'no_completed_at' };
  const already = db
    .prepare(
      `SELECT 1 FROM diary_archive_log WHERE date = ? AND user_id = ? AND kind = 'event' AND item_id = ?`
    )
    .get(day, row.user_id, eventId);
  if (already) return { archived: false, reason: 'already_archived', diaryDate: day };

  const lines = renderEventLine(row).split('\n');
  const tx = db.transaction(() => {
    appendArchiveToDiary(day, lines, row.user_id);
    markArchived(day, 'event', [row], row.user_id);
  });
  tx();
  console.log(`[diary-archive] 完成动作触发归档：event#${eventId} → ${day}`);
  return { archived: true, diaryDate: day };
}

/**
 * 主入口：每天第一次被调用时执行一次——把"昨天"归档。
 * 多用户：每个用户都跑一遍。
 */
export function archiveCompletedToYesterdayIfNewDay() {
  const today = todayLocal();
  if (lastArchiveTickDate === today) {
    return { archivedTodos: 0, archivedEvents: 0, diaryDate: addDays(today, -1), skipped: true };
  }
  const yesterday = addDays(today, -1);
  const users = db.prepare(`SELECT id FROM users`).all();
  let total = { archivedTodos: 0, archivedEvents: 0 };
  for (const u of users) {
    const res = archiveCompletedToDay(yesterday, u.id);
    total.archivedTodos += res.archivedTodos;
    total.archivedEvents += res.archivedEvents;
  }
  lastArchiveTickDate = today;
  return { ...total, diaryDate: yesterday };
}

/**
 * 服务启动时调用一次，兜底跨过 N 天未启动 / 时钟回拨等场景。
 */
export function runArchiveNow(reason = 'startup') {
  const today = todayLocal();
  const yesterday = addDays(today, -1);
  const users = db.prepare(`SELECT id FROM users`).all();
  let totalTodos = 0;
  let totalEvents = 0;
  for (const u of users) {
    const res = archiveCompletedToDay(yesterday, u.id);
    totalTodos += res.archivedTodos;
    totalEvents += res.archivedEvents;
  }
  if (totalTodos > 0 || totalEvents > 0) {
    console.log(`[diary-archive] (${reason}) 归档昨日已完成 ${totalTodos + totalEvents} 条 (across ${users.length} users)`);
  }
  return { archivedTodos: totalTodos, archivedEvents: totalEvents };
}

export { loadItemsCompletedOn, renderTodoLine, renderEventLine };
