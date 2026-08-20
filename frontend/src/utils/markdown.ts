import { marked, type TokenizerAndRendererExtension } from 'marked';
import DOMPurify from 'dompurify';
import { emojify } from 'node-emoji';

// marked 配置：GFM、换行、自动识别链接、代码块语法不高亮（避免引外部 CSS）
marked.setOptions({
  gfm: true,
  breaks: true,
});

// 注册 :emoji_name: 替换为对应的 emoji 字符（如 :snowman: -> ⛄）
// 借鉴 GitHub 风格：只匹配半角冒号 + 字母/数字/下划线/短横线 + 半角冒号
const emojiExtension: TokenizerAndRendererExtension = {
  name: 'emoji',
  level: 'inline',
  start(src) {
    const i = src.indexOf(':');
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^:([a-z0-9_+\-]+):/.exec(src);
    if (!m) return undefined;
    const name = m[1];
    const out = emojify(`:${name}:`, { fallback: '' });
    if (!out) return undefined;
    return {
      type: 'emoji',
      raw: m[0],
      text: out,
    };
  },
  renderer(token) {
    return token.text;
  },
};
marked.use({ extensions: [emojiExtension] });

/**
 * 把 markdown 渲染为安全的 HTML。
 * - 服务端/客户端均可安全使用（DOMPurify 在浏览器中用 window）
 * - 禁用危险标签（script/iframe/object 等）
 * - 图片/video/audio 保留：日记功能需要这些
 */
export function renderMarkdown(md: string): string {
  if (!md) return '';
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: ['audio', 'video', 'source'],
    ADD_ATTR: ['controls', 'src', 'type', 'poster', 'preload', 'loop', 'muted'],
  });
}
