import { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

type LegalDoc = 'privacy' | 'terms';

const SRC: Record<LegalDoc, string> = {
  privacy: '/legal/privacy-policy.md',
  terms: '/legal/terms.md',
};

const TITLE: Record<LegalDoc, string> = {
  privacy: '隐私政策',
  terms: '用户服务协议',
};

const LAST_UPDATED: Record<LegalDoc, string> = {
  privacy: '2026 年 8 月 24 日',
  terms: '2026 年 8 月 24 日',
};

export function LegalPage({ kind }: { kind: LegalDoc }) {
  const [html, setHtml] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(SRC[kind])
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((md) => {
        if (cancelled) return;
        const raw = marked.parse(md, { async: false }) as string;
        setHtml(DOMPurify.sanitize(raw));
      })
      .catch((e) => !cancelled && setErr(e.message || '加载失败'));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return (
    <div className="legal-page">
      <header className="legal-page__header">
        <a className="legal-page__back" href="/">← 返回</a>
        <h1 className="legal-page__title">{TITLE[kind]}</h1>
        <p className="legal-page__meta">最近更新：{LAST_UPDATED[kind]}</p>
      </header>
      {err ? (
        <div className="legal-page__err">加载失败：{err}</div>
      ) : (
        <article
          className="legal-page__body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}