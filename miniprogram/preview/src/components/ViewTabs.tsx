import type { ReactNode } from 'react';

export type ViewMode = 'timeline' | 'todos' | 'calendar';

const TABS: { id: ViewMode; icon: string; label: string; hint: string }[] = [
  { id: 'timeline', icon: '📅', label: '时间轴', hint: '24 小时日程' },
  { id: 'todos', icon: '📝', label: '待做', hint: '总体待办池' },
  { id: 'calendar', icon: '🗓️', label: '日历', hint: '月视图一览' },
];

interface Props {
  view: ViewMode;
  onChangeView: (v: ViewMode) => void;
  rightExtra?: ReactNode;
}

export default function ViewTabs({ view, onChangeView, rightExtra }: Props) {
  return (
    <div className="view-tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`view-tabs__btn ${view === t.id ? 'is-active' : ''}`}
          onClick={() => onChangeView(t.id)}
        >
          <span className="view-tabs__icon">{t.icon}</span>
          <div className="view-tabs__text">
            <span className="view-tabs__label">{t.label}</span>
            <span className="view-tabs__hint">{t.hint}</span>
          </div>
        </button>
      ))}
      {rightExtra}
    </div>
  );
}