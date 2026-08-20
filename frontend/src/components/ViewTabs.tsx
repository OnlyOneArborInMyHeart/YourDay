import './ViewTabs.css';

export type ViewMode = 'timeline' | 'list' | 'todos' | 'calendar';

interface TabDef {
  id: ViewMode;
  icon: string;
  label: string;
  hint: string;
}

const TABS: TabDef[] = [
  { id: 'timeline', icon: '📅', label: '时间轴', hint: '24 小时日程' },
  { id: 'todos', icon: '📝', label: '待做', hint: '总体待办池' },
  // { id: 'list', icon: '📋', label: '清单', hint: '按天左右滑动' },
  { id: 'calendar', icon: '🗓️', label: '日历', hint: '月视图一览' },
];

interface Props {
  view: ViewMode;
  onChangeView: (next: ViewMode) => void;
}

export function ViewTabs({ view, onChangeView }: Props) {
  return (
    <nav className="view-tabs" role="tablist" aria-label="视图切换">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={view === t.id}
          className={`view-tabs__btn ${view === t.id ? 'is-active' : ''}`}
          onClick={() => onChangeView(t.id)}
        >
          <span className="view-tabs__icon" aria-hidden>{t.icon}</span>
          <div className="view-tabs__text">
            <span className="view-tabs__label">{t.label}</span>
            <span className="view-tabs__hint">{t.hint}</span>
          </div>
        </button>
      ))}
    </nav>
  );
}
