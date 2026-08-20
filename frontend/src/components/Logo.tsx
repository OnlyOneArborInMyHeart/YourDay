import './Logo.css';

/**
 * YourDay Logo - 我的世界像素风
 * - 左侧 16x16 像素的草方块（草皮绿 + 泥土棕），CSS 网格手绘每个像素
 * - 右侧 "YourDay" 用 Press Start 2P（像素字体）
 * - 像素感：image-rendering: pixelated + 方角边框
 */
export function Logo() {
  // 草方块像素图：8x8 网格（每格对应一个像素）
  // 颜色代码：. = 透明，g = 草皮深绿，G = 草皮亮绿，d = 泥土深棕，D = 泥土亮棕
  // 整体看起来像 Minecraft 的草方块正面
  const grassPattern = [
    'gggggggg',
    'gGGGggGg',
    'gGggGGGg',
    'ggGGgGgg',
    'gGgGGggg',
    'GgGGGGgg',
    'gGgGGgGg',
    'gggggggg',
  ];
  const dirtPattern = [
    'dDdDdDdD',
    'DddDddDd',
    'dDddddDd',
    'DdDdDddd',
    'dDddDddD',
    'DddDddDd',
    'dDdDddDd',
    'DdDddDdD',
  ];

  const palette: Record<string, string> = {
    g: '#4a8c2a', // 草皮深
    G: '#7bc94b', // 草皮亮
    d: '#7a4a26', // 泥土深
    D: '#a0703f', // 泥土亮
  };

  return (
    <div className="logo" aria-label="YourDay">
      {/* 像素草方块：8 列 x 16 行（上层 8 行草皮，下层 8 行泥土） */}
      <div className="logo__block" aria-hidden>
        <div className="logo__block-layer logo__block-layer--grass">
          {grassPattern.map((row, y) => (
            <div key={`g${y}`} className="logo__pixel-row">
              {row.split('').map((c, x) => (
                <span
                  key={`g${y}-${x}`}
                  className="logo__pixel"
                  style={{ background: palette[c] }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="logo__block-layer logo__block-layer--dirt">
          {dirtPattern.map((row, y) => (
            <div key={`d${y}`} className="logo__pixel-row">
              {row.split('').map((c, x) => (
                <span
                  key={`d${y}-${x}`}
                  className="logo__pixel"
                  style={{ background: palette[c] }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="logo__text">
        <span className="logo__text-main">YourDay</span>
        <span className="logo__text-sub">像素日程 · 每日规划</span>
      </div>
    </div>
  );
}