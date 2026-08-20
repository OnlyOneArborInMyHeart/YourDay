import './Legend.css';
import { getDailyQuote } from '../data/quotes';

export function Legend() {
  const quote = getDailyQuote();

  return (
    <div className="legend">
      <span className="legend__title">优先级</span>
      <div className="legend__items">
        <span className="legend__chip legend__chip--p1">P1 · 重要且紧急</span>
        <span className="legend__chip legend__chip--p2">P2 · 重要不紧急</span>
        <span className="legend__chip legend__chip--p3">P3 · 一般事项</span>
      </div>
      <span className="legend__quote">
        「{quote.text}」<em className="legend__quote-author">—— {quote.author}</em>
      </span>
      <span className="legend__hint">双击空白处可快速新建</span>
    </div>
  );
}
