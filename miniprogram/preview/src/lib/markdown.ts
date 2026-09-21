// 极简 markdown 渲染（只做标题/段落/列表/代码块/引用/链接/图片/粗斜/分隔线）
// 不引入 marked / dompurify —— 浏览器里直接 innerHTML 即可，所有用户输入受信任。

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  // 图片 ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    return `<img alt="${alt}" src="${url}" style="max-width:100%;border-radius:6px;margin:6px 0;" />`;
  });
  // 链接 [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
    `<a href="${url}" target="_blank" rel="noreferrer">${text}</a>`);
  // 行内代码 `code`
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 粗体 **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *italic*
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // 代码块
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结束 ```
      out.push(`<pre style="background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:8px;overflow:auto;font-size:13px;"><code${lang ? ` data-lang="${lang}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // 分隔线
    if (/^---+$/.test(line)) { out.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0;" />'); i++; continue; }
    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const sizes = ['24px', '20px', '17px', '15px'];
      out.push(`<h${level} style="font-size:${sizes[level - 1]};margin:14px 0 8px;line-height:1.3;">${renderInline(h[2])}</h${level}>`);
      i++; continue;
    }
    // 引用
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote style="border-left:3px solid #cbd5e1;padding:4px 10px;color:#475569;background:#f8fafc;margin:8px 0;border-radius:0 6px 6px 0;">${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }
    // 无序列表
    if (/^[\-\*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-\*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\-\*]\s+/, ''));
        i++;
      }
      out.push('<ul style="margin:6px 0 6px 22px;padding:0;">' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ul>');
      continue;
    }
    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push('<ol style="margin:6px 0 6px 22px;padding:0;">' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ol>');
      continue;
    }
    // 空行
    if (!line.trim()) { i++; continue; }
    // 普通段落
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>\s?|[\-\*]\s|\d+\.\s|```|---+$)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p style="margin:6px 0;line-height:1.6;">${renderInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}