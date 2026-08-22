/**
 * 日记 markdown 中"完成的事项"归档块的解析器。
 *
 * 后端 diaryArchive.js 在跨日时把当日已完成事项按以下格式追加到 diary 末尾：
 *   <!-- a:todo,id=2,p=2 -->
 *   - [x] 标题
 *   <!-- a:event,id=5,p=3,st=07:00,et=07:30 -->
 *   - [x] 跑步（07:00–07:30）
 *
 * 本工具从给定 markdown 中抽取形如 `## 完成的事项 (YYYY-MM-DD)` 的块，
 * 返回该日期下的归档项。若日期不匹配、或没有该块，返回空数组。
 */

export interface ArchivedTodo {
  kind: 'todo';
  id: number;
  priority: 1 | 2 | 3;
  title: string;
}

export interface ArchivedEvent {
  kind: 'event';
  id: number;
  priority: 1 | 2 | 3;
  title: string;
  startTime: string | null;
  endTime: string | null;
}

export type ArchivedItem = ArchivedTodo | ArchivedEvent;

// 列表项: "- [x] 标题（HH:MM–HH:MM）" / "- [x] 标题（起 HH:MM）" / "- [x] 标题"
const LINE_RE = /^-\s+\[x\]\s+(.+?)\s*$/;

function parseMeta(kind: string, payload: string): ArchivedItem | null {
  const fields: Record<string, string> = {};
  for (const seg of payload.split(',')) {
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    fields[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim();
  }
  const id = Number(fields.id);
  const p = Number(fields.p) || 3;
  if (!Number.isInteger(id) || id <= 0) return null;
  const priority = (p === 1 || p === 2 || p === 3 ? p : 3) as 1 | 2 | 3;
  if (kind === 'todo') {
    return { kind: 'todo', id, priority, title: '' };
  }
  return {
    kind: 'event',
    id,
    priority,
    title: '',
    startTime: fields.st || null,
    endTime: fields.et || null,
  };
}

/**
 * 把 "- [x] 标题" 内的"标题"剥离前缀信息（起止时间括号），还原成 raw title。
 * 注意：归档块里的 list line 中 event 的 time 已编进 meta，所以 title 里
 * "（HH:MM–HH:MM）" 这部分可以安全剥掉；调用方按需在 UI 里重新拼。
 */
function stripBracket(s: string): string {
  return s.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
}

/**
 * 从 markdown 文本里抽取指定日期的"完成的事项"归档项。
 *
 * 实现要点：
 * - 找到 `## 完成的事项 (YYYY-MM-DD)` 这一节（标题独立成行），向后扫直到
 *   下一个 `## ` 标题或文末。
 * - 在该节内按"注释行 + 紧跟的列表项"配对解析。注释行缺失时跳过该项。
 */
export function parseDiaryArchiveBlock(markdown: string, targetDate: string): ArchivedItem[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const headerRe = new RegExp(`^##\\s+完成的事项\\s*\\(${escapeRe(targetDate)}\\)\\s*$`);
  const out: ArchivedItem[] = [];

  let inSection = false;
  let pendingMeta: ArchivedItem | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!inSection) {
      if (headerRe.test(line)) inSection = true;
      continue;
    }
    // 结束条件：进入下一个 `##` 标题
    if (/^##\s+/.test(line) && !headerRe.test(line)) break;

    const metaMatch = /^<!--\s*a:(todo|event),([^>]+?)\s*-->$/.exec(line);
    if (metaMatch) {
      pendingMeta = parseMeta(metaMatch[1], metaMatch[2]);
      continue;
    }

    const listMatch = LINE_RE.exec(line);
    if (listMatch && pendingMeta) {
      const rawTitle = listMatch[1];
      const cleanTitle = stripBracket(rawTitle);
      pendingMeta.title = cleanTitle;
      out.push(pendingMeta);
      pendingMeta = null;
      continue;
    }
    // 行内空行 / 其他文本：清掉待绑定的 meta，避免错配
    if (line === '') pendingMeta = null;
  }

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}