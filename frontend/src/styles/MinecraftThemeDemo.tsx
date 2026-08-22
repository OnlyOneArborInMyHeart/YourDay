import { useState } from 'react';
import '../styles/minecraft-theme.css';

/**
 * Minecraft Theme 组件展示页
 * 演示所有 UI 组件的视觉风格
 */
export default function MinecraftThemeDemo() {
  const [checked, setChecked] = useState(false);
  const [sliderVal, setSliderVal] = useState(60);
  const [toastVisible, setToastVisible] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const showToast = () => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  return (
    <div className="mc-body" style={{ padding: '32px', minHeight: '100vh' }}>

      {/* 页头 */}
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="mc-title" style={{ fontSize: 16, marginBottom: 24 }}>
          ⛏ Minecraft Theme — YourDay
        </div>

        <p style={{ fontSize: 13, color: 'var(--mc-text-soft)', marginBottom: 32, fontStyle: 'italic' }}>
          基于 YourDay 圆角 + 阴影体系，融合 Minecraft 标志性配色与像素块质感。
          语义化 CSS 变量，局部覆盖即可换色。
        </p>

        {/* ————————— 1. 按钮 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>1. 按钮</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="mc-btn" onClick={showToast}>Creeper 绿主按钮</button>
            <button className="mc-btn mc-btn--secondary">次要按钮</button>
            <button className="mc-ghost">幽灵按钮</button>
            <button className="mc-icon-btn" onClick={showToast} title="设置">⚙</button>
            <button className="mc-icon-btn" title="删除">🗑</button>
          </div>
        </section>

        {/* ————————— 2. 徽章 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>2. 徽章</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="mc-badge mc-badge--grass">🌿 草地</span>
            <span className="mc-badge mc-badge--gold">⭐ 金锭</span>
            <span className="mc-badge mc-badge--diamond">💎 钻石</span>
            <span className="mc-badge mc-badge--dirt">🪨 泥土</span>
            <span className="mc-badge mc-badge--creeper">💀 Creeper</span>
          </div>
        </section>

        {/* ————————— 3. 稀有度角标 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>3. 稀有度</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="mc-rare-badge mc-rare-badge--common">普通</span>
            <span className="mc-rare-badge mc-rare-badge--uncommon">优秀</span>
            <span className="mc-rare-badge mc-rare-badge--rare">稀有</span>
            <span className="mc-rare-badge mc-rare-badge--epic">史诗</span>
            <span className="mc-rare-badge mc-rare-badge--legendary">传说</span>
          </div>
        </section>

        {/* ————————— 4. Chip 优先级 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>4. 优先级 Chip</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <span className="mc-chip mc-chip--p1">P1 红石</span>
            <span className="mc-chip mc-chip--p2">P2 金锭</span>
            <span className="mc-chip mc-chip--p3">P3 草地</span>
          </div>
        </section>

        {/* ————————— 5. 卡片 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>5. 卡片</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="mc-card">
              <div style={{ fontFamily: 'var(--mc-font-pixel)', fontSize: 12, marginBottom: 8, color: 'var(--mc-text-soft)' }}>普通卡片</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mc-text-soft)' }}>这是卡片内容区域，可以放置任意信息。</p>
            </div>
            <div className="mc-card mc-card--grass">
              <div style={{ fontFamily: 'var(--mc-font-pixel)', fontSize: 12, marginBottom: 8, color: 'var(--mc-text-soft)' }}>草地装饰卡片</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mc-text-soft)' }}>顶部有草地像素渐变装饰，适合日历/日计划等场景。</p>
            </div>
          </div>
        </section>

        {/* ————————— 6. 列表项 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>6. 列表项</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="mc-item mc-item--selected">
              <div className="mc-item__icon">⛏</div>
              <div className="mc-item__content">
                <div className="mc-item__title">建造庇护所</div>
                <div className="mc-item__sub">P1 · 今日</div>
              </div>
              <span className="mc-chip mc-chip--p1" style={{ fontSize: 10 }}>P1</span>
            </div>
            <div className="mc-item">
              <div className="mc-item__icon">🌾</div>
              <div className="mc-item__content">
                <div className="mc-item__title">种植小麦</div>
                <div className="mc-item__sub">P3 · 待定</div>
              </div>
              <span className="mc-chip mc-chip--p3" style={{ fontSize: 10 }}>P3</span>
            </div>
          </div>
        </section>

        {/* ————————— 7. 进度条 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>7. 进度条</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--mc-text-soft)', marginBottom: 6 }}>今日完成</div>
              <div className="mc-progress">
                <div className="mc-progress__fill" style={{ width: '65%' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--mc-text-soft)', marginBottom: 6 }}>本周进度（金色）</div>
              <div className="mc-progress">
                <div className="mc-progress__fill mc-progress__fill--gold" style={{ width: '40%' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--mc-text-soft)', marginBottom: 6 }}>钻石收集（青色）</div>
              <div className="mc-progress">
                <div className="mc-progress__fill mc-progress__fill--diamond" style={{ width: '80%' }} />
              </div>
            </div>
          </div>
        </section>

        {/* ————————— 8. 标签页 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>8. 标签页</h3>
          <div className="mc-tabs" style={{ maxWidth: 360 }}>
            {['🏠 首页', '📅 日历', '⚔ 冒险'].map((label, i) => (
              <button
                key={i}
                className={`mc-tab ${activeTab === i ? 'mc-tab--active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ————————— 9. 输入框 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>9. 输入框</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="mc-input" type="text" placeholder="输入任务名称..." />
            <input className="mc-input" type="text" placeholder="搜索矿石、工具..." />
          </div>
        </section>

        {/* ————————— 10. 滑动条 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>10. 滑动条</h3>
          <div style={{ maxWidth: 360 }}>
            <div style={{ fontSize: 12, color: 'var(--mc-text-soft)', marginBottom: 8 }}>
              游戏音量：{sliderVal}%
            </div>
            <input
              type="range"
              className="mc-slider"
              min={0}
              max={100}
              value={sliderVal}
              onChange={(e) => setSliderVal(Number(e.target.value))}
            />
          </div>
        </section>

        {/* ————————— 11. 复选框 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>11. 复选框</h3>
          <label className={`mc-checkbox ${checked ? 'mc-checkbox--checked' : ''}`}>
            <div className="mc-checkbox__box">{checked ? '✓' : ''}</div>
            <span style={{ fontSize: 14 }}>启用自动化红石机械</span>
          </label>
          <div style={{ marginTop: 10 }}>
            <button
              className="mc-ghost"
              style={{ fontSize: 11 }}
              onClick={() => setChecked(!checked)}
            >
              {checked ? '取消勾选' : '勾选'}
            </button>
          </div>
        </section>

        {/* ————————— 12. 分隔线 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>12. 分隔线</h3>
          <p style={{ fontSize: 13, color: 'var(--mc-text-soft)', marginBottom: 12 }}>上方是内容</p>
          <hr className="mc-divider" />
          <p style={{ fontSize: 13, color: 'var(--mc-text-soft)', marginTop: 12 }}>下方是内容</p>
        </section>

        {/* ————————— 13. 空状态 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>13. 空状态</h3>
          <div className="mc-card">
            <div className="mc-empty">
              <div className="mc-empty__icon">📦</div>
              <div className="mc-empty__title">未找到物品</div>
              <div className="mc-empty__sub">这里空空如也，试试合成新的物品吧！</div>
              <button className="mc-btn" style={{ marginTop: 8 }}>+ 合成新任务</button>
            </div>
          </div>
        </section>

        {/* ————————— 14. 加载骨架屏 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>14. 骨架屏</h3>
          <div className="mc-card">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div className="mc-skeleton" style={{ width: 40, height: 40, borderRadius: 6 }} />
              <div style={{ flex: 1 }}>
                <div className="mc-skeleton" style={{ height: 14, marginBottom: 6, width: '60%' }} />
                <div className="mc-skeleton" style={{ height: 12, width: '40%' }} />
              </div>
            </div>
            <div className="mc-skeleton" style={{ height: 60 }} />
          </div>
        </section>

        {/* ————————— 15. 加载动画 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>15. 加载动画</h3>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div className="mc-loader">
              <div className="mc-loader__block" />
              <div className="mc-loader__block" />
              <div className="mc-loader__block" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--mc-text-soft)' }}>正在挖掘...</span>
          </div>
        </section>

        {/* ————————— 16. 工具提示 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>16. 工具提示</h3>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { icon: '⛏', tip: '石镐 — 可挖掘石头' },
              { icon: '🪓', tip: '钻石镐 — 最强耐久' },
              { icon: '🔥', tip: '打火石 — 点燃世界' },
            ].map(({ icon, tip }) => (
              <div key={tip} className="mc-tooltip">
                <button className="mc-icon-btn" style={{ fontSize: 22 }}>{icon}</button>
                <span className="mc-tooltip__text">{tip}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ————————— 17. Toast 通知 ————————— */}
        <section style={{ marginBottom: 32 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>17. Toast 通知</h3>
          <button className="mc-btn" onClick={showToast}>显示 Toast</button>
        </section>

        {/* ————————— 18. 弹窗 ————————— */}
        <section style={{ marginBottom: 48 }}>
          <h3 className="mc-title" style={{ marginBottom: 16, fontSize: 12 }}>18. 弹窗</h3>
          <div className="mc-modal" style={{ position: 'relative', maxWidth: 480 }}>
            <div className="mc-modal__head">
              <span className="mc-modal__title">⚗ 合成配方</span>
              <button className="mc-modal__close">✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 13, color: 'var(--mc-text-soft)', margin: '0 0 16px' }}>
                选择要合成的物品，获取配方指导。
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['木棍 ×4', '工作台', '木镐', '熔炉'].map((item) => (
                  <div key={item} className="mc-item">
                    <div className="mc-item__icon">📦</div>
                    <div className="mc-item__content">
                      <div className="mc-item__title">{item}</div>
                    </div>
                    <button className="mc-ghost" style={{ fontSize: 10 }}>合成</button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="mc-ghost">取消</button>
                <button className="mc-btn">确认合成</button>
              </div>
            </div>
          </div>
        </section>

        {/* 像素装饰脚注 */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6,
          padding: '20px 0', opacity: 0.4
        }}>
          {['🟫','🟩','🟫','🟩','🟫','🟩','🟫','🟩','🟫'].map((c, i) => (
            <span key={i} style={{
              width: 12, height: 12, background: i % 2 === 0 ? 'var(--mc-dirt)' : 'var(--mc-grass)',
              display: 'inline-block', borderRadius: 2
            }} />
          ))}
        </div>
      </div>

      {/* Toast 渲染 */}
      {toastVisible && (
        <div className="mc-toast">
          💚 任务已保存到背包！
        </div>
      )}
    </div>
  );
}
