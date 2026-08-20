import { useEffect, useRef, useState } from 'react';
import type { MusicTrack } from '../api/music';
import './RecordPlayer.css';

/**
 * 黑胶唱片播放器
 * - 曲目来源：用户音乐库（musicApi）。空库时退回到 Web Audio 合成的 3 首默认曲。
 * - 点唱片：暂停 / 继续
 * - 点左/右小箭头：切换曲目（曲目列表内循环）
 * - 黑胶顺时针匀速旋转，暂停时停下
 *
 * Props：
 * - tracks: 用户自建音乐库（从 SettingsModal 同步过来），用于替换默认曲目
 */

type Track = {
  id: string;
  title: string;
  artist: string;
  /** 远程音频 URL；为空时走 Web Audio 合成 */
  src?: string;
  /** 唱片封面图 URL；为空时中央渲染默认黄色渐变 */
  coverUrl?: string | null;
  flavor: 'pad' | 'arpeggio' | 'chime';
  /** LRC 歌词原始文本（来自用户上传） */
  lyricsRaw?: string | null;
};

const DEFAULT_TRACKS: Track[] = [
  { id: 't-pad',      title: 'Morning Hush', artist: 'Studio Pad',  flavor: 'pad' },
  { id: 't-chime',    title: 'Glass Bells',  artist: 'Airwave',     flavor: 'chime' },
  { id: 't-arpeggio', title: 'Slow Drift',   artist: 'Lo-Fi Lab',   flavor: 'arpeggio' },
];

function tracksFromLibrary(lib: MusicTrack[]): Track[] {
  return lib.map((m) => ({
    id: `m-${m.id}`,
    title: m.title || m.original_name || 'Untitled',
    artist: '我的音乐库',
    src: m.url,
    coverUrl: m.cover_url ?? null,
    flavor: 'pad' as const, // 未用：带 src 时不会走合成
    lyricsRaw: m.lyrics ?? null,
  }));
}

interface PlayerState {
  audioCtx: AudioContext | null;
  nodes: AudioNode[];
  gain: GainNode | null;
}

function stopPlayer(state: PlayerState) {
  state.nodes.forEach((n) => {
    try {
      if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
        (n as OscillatorNode).stop();
      }
      n.disconnect();
    } catch {
      /* 忽略 */
    }
  });
  state.nodes = [];
  state.gain?.disconnect();
  state.gain = null;
}

function playSynth(state: PlayerState, track: Track) {
  stopPlayer(state);
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  state.audioCtx = ctx;

  const master = ctx.createGain();
  master.gain.value = 0.06;
  master.connect(ctx.destination);
  state.gain = master;

  if (track.flavor === 'pad') {
    const notes = [110, 164.81, 220, 277.18];
    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.frequency.value = 0.3 + Math.random() * 0.2;
      lfo.connect(lfoGain).connect(master.gain);
      osc.connect(master);
      osc.start();
      lfo.start();
      state.nodes.push(osc, lfo);
    });
  } else if (track.flavor === 'chime') {
    const notes = [523.25, 659.25, 783.99, 987.77];
    let i = 0;
    const tick = () => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = notes[i % notes.length];
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
      osc.connect(g).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 1.7);
      state.nodes.push(osc, g);
      i += 1;
    };
    tick();
    const id = window.setInterval(tick, 1800);
    state.nodes.push({ disconnect: () => window.clearInterval(id) } as unknown as AudioNode);
  } else {
    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
    let i = 0;
    const tick = () => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = notes[i % notes.length];
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.connect(g).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
      state.nodes.push(osc, g);
      i += 1;
    };
    tick();
    const id = window.setInterval(tick, 480);
    state.nodes.push({ disconnect: () => window.clearInterval(id) } as unknown as AudioNode);
  }
}

interface Props {
  /** 来自后端的用户音乐库；为空时使用默认合成曲目 */
  library?: MusicTrack[];
  /** 播放时间变化时回调（秒），用于歌词同步 */
  onTimeUpdate?: (currentTime: number) => void;
  /** 切歌时回调，trackInfo 包含 lyrics 原始文本（供父组件解析） */
  onTrackChange?: (track: { id: string; title: string; flavor: string; lyricsRaw: string | null }) => void;
  /** 当前曲目封面图 URL 变化时回调 */
  onCoverChange?: (coverUrl: string | null) => void;
}

export function RecordPlayer({ library = [], onTimeUpdate, onTrackChange, onCoverChange }: Props) {
  const tracks: Track[] = library.length > 0 ? tracksFromLibrary(library) : DEFAULT_TRACKS;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<PlayerState>({ audioCtx: null, nodes: [], gain: null });

  // 曲目列表变化时回到第一首
  useEffect(() => {
    setIdx(0);
    setPlaying(false);
  }, [library.length]);

  // 越界保护：曲目列表变更时若 idx 超界，重置
  useEffect(() => {
    if (idx >= tracks.length) setIdx(0);
  }, [tracks.length, idx]);

  const track = tracks[Math.min(idx, tracks.length - 1)];

  // 切歌时若正在播放，重启音频源
  useEffect(() => {
    if (!playing) return;
    const audio = audioRef.current;
    if (track.src && audio) {
      audio.src = track.src;
      audio.loop = true;
      audio.volume = 0.6;
      audio.play().catch(() => {
        // 自动播放被浏览器阻止时不报错，让用户再点一次
      });
    } else {
      playSynth(synthRef.current, track);
    }
    return () => {
      if (track.src) {
        audioRef.current?.pause();
      } else {
        stopPlayer(synthRef.current);
        synthRef.current.audioCtx?.close().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, track.id]);

  // 切歌时通知父组件（用于歌词同步）
  useEffect(() => {
    onTrackChange?.({ id: track.id, title: track.title, flavor: track.flavor, lyricsRaw: track.lyricsRaw ?? null });
    onCoverChange?.(track.coverUrl ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  // 卸载时清理
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      stopPlayer(synthRef.current);
      synthRef.current.audioCtx?.close().catch(() => {});
    };
  }, []);

  const togglePlay = () => {
    const wasPlaying = playing;
    setPlaying((p) => !p);
    const audio = audioRef.current;
    if (wasPlaying) {
      if (track.src && audio) {
        audio.pause();
      } else {
        stopPlayer(synthRef.current);
      }
    } else {
      if (track.src && audio) {
        if (!audio.src) audio.src = track.src;
        audio.loop = true;
        audio.volume = 0.6;
        audio.play().catch(() => {});
      } else {
        playSynth(synthRef.current, track);
      }
    }
  };

  const switchTrack = (dir: 1 | -1) => {
    setIdx((i) => (i + dir + tracks.length) % tracks.length);
  };

  // —— 播放进度条（控制 currentTime） ——
  const trackBarRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  /** 拖动过程中屏蔽 audio.timeupdate 覆盖 thumb，避免抖动 */
  const suppressUntilRef = useRef(0);

  const [progress, setProgress] = useState(0); // 0~1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // 用 audio 元素监听 timeupdate / loadedmetadata
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (Date.now() < suppressUntilRef.current) return;
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) {
        setCurrentTime(audio.currentTime);
        setDuration(d);
        setProgress(audio.currentTime / d);
        onTimeUpdate?.(audio.currentTime);
      }
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnd = () => {
      // 单曲循环模式下也会触发；归零
      setCurrentTime(0);
      setProgress(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, [track.id]);

  // 切歌后重置进度
  useEffect(() => {
    setCurrentTime(0);
    setProgress(0);
    suppressUntilRef.current = 0;
  }, [idx, track.id]);

  /** 把进度条位置映射到 0~1，clamp 后回写到 audio + 本地 state */
  const seekFromClientX = (clientX: number) => {
    const bar = trackBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      // 用户拖动期间抑制原生 timeupdate，防止 thumb 抖动
      suppressUntilRef.current = Date.now() + 250;
      audio.currentTime = ratio * audio.duration;
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration);
      setProgress(ratio);
    } else {
      // 合成音轨 / 还没加载：仅更新视觉进度，不写音频
      setProgress(ratio);
    }
  };

  const onTrackBarMouseDown = (e: React.MouseEvent) => {
    if (!trackBarRef.current) return;
    // 音频未加载也能拖（视觉进度变化）；切歌逻辑交给"上一首/下一首"按钮
    if (!(audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0)) {
      // 没真实 audio：仅视觉
      const bar = trackBarRef.current;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setProgress(ratio);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    draggingRef.current = true;
    seekFromClientX(e.clientX);
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      seekFromClientX(e.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [track.id]);

  // 格式化 mm:ss
  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`record-player ${playing ? 'is-playing' : ''}`} aria-label="氛围音乐播放器">
      <button
        type="button"
        className="record-player__disc"
        onClick={togglePlay}
        title={playing ? `暂停：${track.title}` : `播放：${track.title}`}
        aria-label={playing ? '暂停' : '播放'}
      >
        <div className="record-player__art">
          {track.coverUrl ? (
            <img
              key={track.coverUrl /* 切换曲目时强制重挂载，避免浏览器复用上一帧 */}
              className="record-player__cover"
              src={track.coverUrl}
              alt={track.title}
              draggable={false}
            />
          ) : (
            <div className="record-player__cover record-player__cover--placeholder" aria-hidden>
              🎵
            </div>
          )}
        </div>
        <span className="record-player__play-icon" aria-hidden>
          {playing ? '❚❚' : '▶'}
        </span>
      </button>

      <div className="record-player__info">
        <div className="record-player__title" title={track.title}>
          {track.title}
        </div>
        {/* 播放进度条：拖动 thumb 跳转 currentTime（仅在有真实 audio 时生效；合成音轨仅视觉） */}
        <div className="record-player__track-bar-row">
          <span className="record-player__track-time" aria-label="已播放时长">
            {fmt(currentTime)}
          </span>
          <div
            className="record-player__track-bar"
            ref={trackBarRef}
            onMouseDown={onTrackBarMouseDown}
            role="slider"
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${fmt(currentTime)} / ${fmt(duration)}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (!audioRef.current || !(duration > 0)) return;
              const step = Math.max(1, Math.floor(duration / 50));
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - step);
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + step);
              } else if (e.key === 'Home') {
                e.preventDefault();
                audioRef.current.currentTime = 0;
              } else if (e.key === 'End') {
                e.preventDefault();
                audioRef.current.currentTime = duration;
              }
            }}
          >
            <div className="record-player__track-bar-fill" style={{ width: `${progress * 100}%` }} />
            <span
              className="record-player__track-bar-thumb"
              style={{ left: `${progress * 100}%` }}
              aria-hidden
            />
          </div>
          <span className="record-player__track-time record-player__track-time--total">
            {fmt(duration)}
          </span>
        </div>
        <div className="record-player__controls">
          <button
            type="button"
            className="record-player__btn"
            onClick={() => switchTrack(-1)}
            title="上一首"
            aria-label="上一首"
          >
            ‹
          </button>
          <span className="record-player__counter">
            {Math.min(idx, tracks.length - 1) + 1} / {tracks.length}
          </span>
          <button
            type="button"
            className="record-player__btn"
            onClick={() => switchTrack(1)}
            title="下一首"
            aria-label="下一首"
          >
            ›
          </button>
          {library.length === 0 && (
            <span
              className="record-player__hint"
              title="右上角齿轮 → 上传音乐后即可播放自定义曲目"
            >
              空库
            </span>
          )}
        </div>
      </div>

      {track.src && <audio ref={audioRef} hidden preload="auto" />}
    </div>
  );
}