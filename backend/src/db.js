import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'yourday.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    priority INTEGER NOT NULL DEFAULT 3,
    note TEXT DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
`);

// 兼容旧库：若 events 表已建好但没有 done 列，补充之
const cols = db.prepare("PRAGMA table_info(events)").all();
if (!cols.some((c) => c.name === 'done')) {
  db.exec("ALTER TABLE events ADD COLUMN done INTEGER NOT NULL DEFAULT 0");
}
// 兼容旧库：若 events 表没有 completed_at 列（完成时间），补充之
if (!cols.some((c) => c.name === 'completed_at')) {
  db.exec("ALTER TABLE events ADD COLUMN completed_at TEXT DEFAULT NULL");
}
// 兼容旧库：若 events 表没有 background_image_id 列（事件背景图），补充之
if (!cols.some((c) => c.name === 'background_image_id')) {
  db.exec("ALTER TABLE events ADD COLUMN background_image_id INTEGER DEFAULT NULL");
}
// 兼容旧库：若 events 表的 start_time/end_time 是 NOT NULL，改为可空
if (cols.some((c) => c.name === 'start_time' && c.notnull === 1)) {
  db.exec("CREATE TABLE IF NOT EXISTS events_backup AS SELECT * FROM events");
  db.exec("DROP TABLE events");
  db.exec(`
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      priority INTEGER NOT NULL DEFAULT 3,
      note TEXT DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      background_image_id INTEGER
    )
  `);
  db.exec("INSERT INTO events SELECT id,date,title,start_time,end_time,priority,note,done,created_at,updated_at,completed_at,background_image_id,0 FROM events_backup");
  db.exec("DROP TABLE events_backup");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)");
}
// 兼容旧库：若 events 表没有 is_todo 列（纯待办事项，不记时间），补充之
if (!db.prepare("PRAGMA table_info(events)").all().some((c) => c.name === 'is_todo')) {
  db.exec("ALTER TABLE events ADD COLUMN is_todo INTEGER NOT NULL DEFAULT 0");
}
// 兼容旧库：若 events 表没有 original_date 列（任务首次顺延前的原始日期），补充之
if (!db.prepare("PRAGMA table_info(events)").all().some((c) => c.name === 'original_date')) {
  db.exec("ALTER TABLE events ADD COLUMN original_date TEXT DEFAULT NULL");
}
// 兼容旧库：若 events 表的 id 不是 INTEGER PRIMARY KEY（即之前 migration 漏了），重建之
const idCol = db.prepare("PRAGMA table_info(events)").all().find((c) => c.name === 'id');
if (idCol && idCol.type !== 'INTEGER') {
  db.exec("CREATE TABLE IF NOT EXISTS events_backup AS SELECT * FROM events");
  db.exec("DROP TABLE events");
  db.exec(`
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      priority INTEGER NOT NULL DEFAULT 3,
      note TEXT DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      background_image_id INTEGER,
      is_todo INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec("INSERT INTO events SELECT id,date,title,start_time,end_time,priority,note,done,created_at,updated_at,completed_at,background_image_id,COALESCE(is_todo,0) FROM events_backup");
  db.exec("DROP TABLE events_backup");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)");
}

// 每日的自定义主题名（如"项目 A 启动日"）：一行 = 一天
db.exec(`
  CREATE TABLE IF NOT EXISTS day_themes (
    date TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// 总体 To do list（与 events 解耦，独立的"待做事项池"）：
// - 不绑定具体时段，只关心"什么事项 + 状态 + 优先级 + 截止日"
// - 可由用户在「待做视图」拆解到时间轴（生成 event）
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 3,
    note TEXT DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    due_date TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_todos_done ON todos(done);
  CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_date);
`);

// 兼容旧库：若 todos 表没有 completed_at 列（完成时间），补充之
const todoCols = db.prepare("PRAGMA table_info(todos)").all();
if (!todoCols.some((c) => c.name === 'completed_at')) {
  db.exec("ALTER TABLE todos ADD COLUMN completed_at TEXT DEFAULT NULL");
}

// todo 备注内嵌图片：每张图独立存储，通过 note 中的 markdown token `![todo-img:N]()`
// 引用。一个 todo 可引用多张，跨 todo 也可复用同一张（仅由前端去重 / 复用）。
db.exec(`
  CREATE TABLE IF NOT EXISTS todo_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    original_name TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_todo_attachments_created ON todo_attachments(created_at);
`);

// 每日日记：一天一行（PK=date）。
// - title 兼容老的"主题名"，长度仍限制 40 字
// - markdown_content 存原始 Markdown 文本（上限 64KB）
db.exec(`
  CREATE TABLE IF NOT EXISTS diary_entries (
    date TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    markdown_content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// 兼容旧库：把 day_themes.title 拷到 diary_entries.title（一次性）
const themeRows = db.prepare('SELECT date, title FROM day_themes').all();
const insertDiary = db.prepare(
  `INSERT INTO diary_entries (date, title) VALUES (?, ?)
   ON CONFLICT(date) DO UPDATE SET
     title = excluded.title,
     updated_at = datetime('now','localtime')`
);
const tx = db.transaction((rows) => {
  for (const r of rows) insertDiary.run(r.date, r.title);
});
tx(themeRows);

// 日记附件：图片 / 视频 / 音频
db.exec(`
  CREATE TABLE IF NOT EXISTS diary_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('image','video','audio')),
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    original_name TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_diary_attachments_date ON diary_attachments(date);
`);

// 一次性迁移：旧的 original_name 是 latin1 字节被当 utf8 存的，看起来像乱码。
// 把现存所有含高位字符的 original_name 按 latin1 -> utf8 重写一次。
const attRows = db.prepare("SELECT id, original_name FROM diary_attachments").all();
const fixName = db.prepare("UPDATE diary_attachments SET original_name = ? WHERE id = ?");
const migTx = db.transaction((rows) => {
  let fixed = 0;
  for (const r of rows) {
    if (!r.original_name) continue;
    if (!/[\u0080-\uFFFF]/.test(r.original_name)) continue;
    const decoded = Buffer.from(r.original_name, 'latin1').toString('utf8');
    if (decoded && !decoded.includes('\uFFFD') && decoded !== r.original_name) {
      fixName.run(decoded, r.id);
      fixed++;
    }
  }
  if (fixed > 0) console.log(`[migrate] 修复 ${fixed} 条附件 original_name`);
});
migTx(attRows);

// 事件背景图：每张图独立存储，可被一个 event 引用。
// 与 diary_attachments 类似但不带 date 维度——事件背景图与具体日期解耦，
// 仅通过 events.background_image_id 关联，方便后续复用 / 单独清理。
db.exec(`
  CREATE TABLE IF NOT EXISTS event_backgrounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER DEFAULT NULL,
    height INTEGER DEFAULT NULL,
    original_name TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_event_backgrounds_created ON event_backgrounds(created_at);
`);

// 用户自建音乐库：上传的音频文件元数据。
// 实际文件落盘到 data/uploads/，文件名通过 /api/music/:filename 静态托管。
// cover_filename：可选的唱片封面图（jpg/png/webp），落同一个 uploads 目录，
// 通过 /api/music/covers/:filename 暴露给前端用于唱片中央展示。
db.exec(`
  CREATE TABLE IF NOT EXISTS music_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    title TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    cover_filename TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_music_tracks_created ON music_tracks(created_at);
`);

// 给已存在的库添加 cover_filename 列（迁移是幂等的——列已存在则忽略错误）。
try {
  db.exec("ALTER TABLE music_tracks ADD COLUMN cover_filename TEXT DEFAULT NULL");
} catch {
  /* 列已存在 */
}

// 给已存在的库添加 lyrics 列（迁移是幂等的）。
try {
  db.exec("ALTER TABLE music_tracks ADD COLUMN lyrics TEXT DEFAULT NULL");
} catch {
  /* 列已存在 */
}

export default db;
