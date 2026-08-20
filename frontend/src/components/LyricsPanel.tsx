import { useCallback } from 'react';
import './LyricsPanel.css';

export type LyricLine = { time: number; text: string };

interface Props {
  lyrics: LyricLine[];
  currentTime: number;
  trackTitle: string;
  coverUrl: string | null;
  /** 关闭回调，由 App 层的 lyricsVisible state 控制 */
  onClose?: () => void;
}

export function LyricsPanel({ lyrics, currentTime, trackTitle, coverUrl, onClose }: Props) {
  const prevIdx = useCallback(() => {
    if (!lyrics.length) return -1;
    let idx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime) idx = i;
      else break;
    }
    return Math.max(0, idx - 1);
  }, [lyrics, currentTime])();

  const activeIdx = useCallback(() => {
    if (!lyrics.length) return -1;
    let idx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, currentTime])();

  const nextIdx = useCallback(() => {
    if (!lyrics.length) return -1;
    let idx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime) idx = i;
      else break;
    }
    return Math.min(lyrics.length - 1, idx + 1);
  }, [lyrics, currentTime])();

  const prevLine = prevIdx >= 0 ? lyrics[prevIdx] : null;
  const curLine  = activeIdx >= 0 ? lyrics[activeIdx] : null;
  const nextLine = nextIdx >= 0 ? lyrics[nextIdx] : null;

  const renderLine = (line: LyricLine | null, role: 'prev' | 'current' | 'next') => {
    if (!line) return null;
    const text = line.text || '';
    return (
      <div
        key={`${role}-${line.time}`}
        className={`lyrics-drawer__line lyrics-drawer__line--${role}${!text ? ' lyrics-drawer__line--blank' : ''}`}
      >
        {text || '· · ·'}
      </div>
    );
  };

  return (
    <div className="lyrics-drawer" role="region" aria-label="歌词面板">
      <div className="lyrics-drawer__inner">
        {/* 左侧：封面 + 曲目信息 */}
        <div className="lyrics-drawer__meta">
          <div className="lyrics-drawer__cover" aria-hidden>
            {coverUrl ? (
              <img src={coverUrl} alt="album cover" />
            ) : (
              <span>♪</span>
            )}
          </div>
          <div className="lyrics-drawer__track-info">
            <div className="lyrics-drawer__title" title={trackTitle}>{trackTitle}</div>
            <div className="lyrics-drawer__label">正在播放</div>
          </div>
        </div>

        {/* 中间：三句歌词 */}
        <div className="lyrics-drawer__scroll-wrap">
          {lyrics.length === 0 ? (
            <div className="lyrics-drawer__empty">
              <span className="lyrics-drawer__empty-icon" aria-hidden>♪</span>
              <p>暂无歌词</p>
            </div>
          ) : (
            <div className="lyrics-drawer__lines">
              {renderLine(prevLine, 'prev')}
              {renderLine(curLine, 'current')}
              {renderLine(nextLine, 'next')}
            </div>
          )}
        </div>

        {/* 右侧：关闭按钮 */}
        <button
          type="button"
          className="lyrics-drawer__close"
          onClick={onClose}
          aria-label="关闭歌词"
          title="关闭歌词"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
