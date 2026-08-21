import { useEffect, useMemo, useState } from 'react';
import { diariesApi, type Diary } from '../api/diaries';
import './BatchExportDialog.css';

interface Props {
  open: boolean;
  /** "初始锚定日期"——通常为日历当前月第一天。用于决定拉取范围。 */
  anchorDate: string;
  /** 已加载到的日记缓存（按日期）。用于打开弹窗时直接列出"有日记"的日期。 */
  knownDiaries: Record<string, Diary>;
  /** 主题缓存：date -> 主题 */
  themeCache: Record<string, string>;
  onClose: () => void;
}

/**
 * 批量导出日记弹窗
 * - 顶部：日期范围选择 + 刷新按钮（按范围重新拉取服务端日记）
 * - 中部：列出"有日记"的日期，支持单选 / 多选 / 全选
 * - 底部：导出按钮 → 弹出系统目录选择框 → 创建一个新文件夹，把每个选中日记写入对应 .md 文件
 *
 * 文件命名：`YYYY-MM-DD[_主题].md`；文件名中不安全字符过滤。
 *
 * 依赖 File System Access API（Chrome/Edge）实现"可选择文件夹 / 自动记忆上次目录"；
 * 不支持时回退到一次性下载 ZIP（用动态加载 jszip）。
 */
export function BatchExportDialog({ open, anchorDate, knownDiaries, themeCache, onClose }: Props) {
  // 默认范围：当前月
  const monthStart = useMemo(() => anchorDate.slice(0, 7) + '-01', [anchorDate]);
  const monthEnd = useMemo(() => {
    const [y, m] = anchorDate.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${anchorDate.slice(0, 7)}-${String(last).padStart(2, '0')}`;
  }, [anchorDate]);

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);
  const [items, setItems] = useState<Diary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时把范围重置为锚定日所在月
  useEffect(() => {
    if (!open) return;
    setFrom(monthStart);
    setTo(monthEnd);
    setError(null);
  }, [open, monthStart, monthEnd]);

  // 范围变化时拉取；同时合并缓存中存在的日记（避免本地缓存丢失）
  useEffect(() => {
    if (!open) return;
    if (from > to) {
      setError('开始日期不能晚于结束日期');
      setItems([]);
      setSelected(new Set());
      return;
    }
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const list = await diariesApi.listRange(from, to);
        // 合并缓存
        const map = new Map(list.map((d) => [d.date, d]));
        for (const [date, diary] of Object.entries(knownDiaries)) {
          if (date >= from && date <= to && !map.has(date)) {
            map.set(date, diary);
          }
        }
        const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
        setItems(merged);
        setSelected(new Set(merged.map((d) => d.date)));
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to]);

  const toggle = (date: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(items.map((d) => d.date)));
  const selectNone = () => setSelected(new Set());

  const safeFilename = (date: string, theme: string) => {
    const t = theme.trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
    return t ? `${date}_${t}.md` : `${date}.md`;
  };

  /**
   * 清理 markdown 开头残留的"日记元数据"片段。
   *
   * 历史原因：DiaryModal 的单日"导出"按钮曾拼 `---\ndate: ...\n---\n` 头，再
   * 经过手工复制/粘贴/导入后可能会以这些形式残留在 markdown_content 开头：
   *   - 合法的 YAML front matter 块：`---\n...\n---\n`
   *   - 只剩 `date:` / `title:` 行（被手动删了包裹的 `---`）
   *   - 只剩单独一行 `---`（水平线）
   *   - `---` 直接粘在第一行内容前（如 `---### 第二次测试`）
   *
   * 用户期望的"导出文件 = 网站 textarea 原文"里没有这些，按需求全部剥掉。
   */
  const stripFrontmatter = (text: string): string => {
    let result = text;
    // 1) 合法 YAML front matter
    result = result.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    // 2) 开头连续的 `---` / `date:` / `title:` 整行（每行可带尾随空白）
    result = result.replace(
      /^(?:[ \t]*(?:---[ \t]*|date:[^\n]*|title:[^\n]*)[ \t]*\r?\n)+/,
      ''
    );
    // 3) 紧贴第一行内容前的 `---` 前缀（可能被错位粘到正文行首）
    result = result.replace(/^---+\s*/, '');
    return result;
  };

  const buildMarkdown = (diary: Diary) => {
    // 按需求：导出文件 = 用户在编辑器 textarea 中看到的原文。
    // 不附加 front matter / 日期行 / 任何额外形式。
    return stripFrontmatter(diary.markdown_content || '');
  };

  const exportOne = async () => {
    if (selected.size === 0) {
      setError('请至少选择一天');
      return;
    }
    setExporting(true);
    setError(null);

    const list = items.filter((d) => selected.has(d.date));
    const folderName = `YourDay_${from}_to_${to}`;
    const w = window as unknown as {
      showDirectoryPicker?: (opts: unknown) => Promise<FileSystemDirectoryHandle>;
    };

    try {
      if (w.showDirectoryPicker) {
        // 用户选择父目录 → 在其中新建文件夹
        const parent = await w.showDirectoryPicker({ mode: 'readwrite' });
        const folder = await parent.getDirectoryHandle(folderName, { create: true });
        for (const diary of list) {
          const theme = themeCache[diary.date] ?? '';
          const name = safeFilename(diary.date, theme);
          const fileHandle = await folder.getFileHandle(name, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(new Blob([buildMarkdown(diary)], { type: 'text/markdown;charset=utf-8' }));
          await writable.close();
        }
      } else {
        // 兜底：打包成 ZIP 下载
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const diary of list) {
          const theme = themeCache[diary.date] ?? '';
          const name = safeFilename(diary.date, theme);
          zip.file(name, buildMarkdown(diary));
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folderName}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') {
        // 用户取消，不报错
      } else {
        setError(e instanceof Error ? e.message : '导出失败');
      }
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={() => !exporting && onClose()}>
      <div
        className="modal modal--batch-export"
        role="dialog"
        aria-modal="true"
        aria-label="批量导出日记"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <div className="modal__title">批量导出日记</div>
          <button className="icon-btn" onClick={() => !exporting && onClose()} aria-label="关闭" disabled={exporting}>
            ×
          </button>
        </div>

        <div className="modal__body batch-export__body">
          <div className="batch-export__controls">
          <label>
            从
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            到
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <span className="batch-export__count">
            共 {items.length} 天 · 已选 {selected.size}
          </span>
        </div>

          {error && <div className="modal__error">{error}</div>}

          {items.length === 0 ? (
            <div className="batch-export__empty">
              {loading ? '加载中…' : '此范围内还没有日记'}
            </div>
          ) : (
            <ul className="batch-export__list">
              {items.map((d) => {
                const theme = themeCache[d.date] ?? '';
                const checked = selected.has(d.date);
                return (
                  <li key={d.date} className={`batch-export__item ${checked ? 'is-checked' : ''}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(d.date)}
                        disabled={exporting}
                      />
                      <div className="batch-export__item-content">
                        <span className="batch-export__item-label">日期</span>
                        <span className="batch-export__item-date">{d.date}</span>
                      </div>
                      <div className="batch-export__item-content">
                        <span className="batch-export__item-label">单日主题名</span>
                        <span className="batch-export__item-theme">
                          {theme || d.title || '(无主题)'}
                        </span>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="modal__footer">
          <div className="modal__footer-left">
            <button type="button" className="ghost-btn" onClick={selectAll} disabled={exporting}>
              全选
            </button>
            <button type="button" className="ghost-btn" onClick={selectNone} disabled={exporting}>
              清空
            </button>
          </div>
          <div className="modal__footer-right">
            <button type="button" className="ghost-btn ghost-btn--lg" onClick={onClose} disabled={exporting}>
              取消
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={exportOne}
              disabled={exporting || selected.size === 0}
            >
              {exporting ? '导出中…' : `导出 ${selected.size} 天`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}