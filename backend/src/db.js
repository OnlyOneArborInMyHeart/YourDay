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

// 每日的自定义主题名（如"项目 A 启动日"）：一行 = 一个用户的一天。
// 多用户支持需要 (user_id, date) 联合主键。兼容旧库（PK 仅 date）在 root
// 种入之后再处理（需要 root.id 来给老数据回填 user_id）。
db.exec(`
  CREATE TABLE IF NOT EXISTS day_themes (
    user_id INTEGER,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (date)
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_day_themes_user ON day_themes(user_id);`);

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

// 子待做（树状结构）：parent_id 指向父 todo 的 id；null/0 表示顶级。
// 仅二级嵌套（不允许 parent_id 再有非 null parent_id 链），在前端校验。
if (!todoCols.some((c) => c.name === 'parent_id')) {
  db.exec("ALTER TABLE todos ADD COLUMN parent_id INTEGER DEFAULT NULL");
}
if (!todoCols.some((c) => c.name === 'parent_id_idx')) {
  db.exec("CREATE INDEX IF NOT EXISTS idx_todos_parent ON todos(parent_id)");
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

// 每日日记：(user_id, date) 联合主键
db.exec(`
  CREATE TABLE IF NOT EXISTS diary_entries (
    user_id INTEGER,
    date TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    markdown_content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (date)
  );
`);

// diary_archive_log：(date, user_id, kind, item_id) 联合主键
db.exec(`
  CREATE TABLE IF NOT EXISTS diary_archive_log (
    user_id      INTEGER NOT NULL,
    date         TEXT    NOT NULL,
    kind         TEXT    NOT NULL CHECK(kind IN ('todo','event')),
    item_id      INTEGER NOT NULL,
    archived_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (date, user_id, kind, item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_diary_archive_log_date ON diary_archive_log(date);
`);

// 兼容旧库：把 day_themes.title 拷到 diary_entries.title（一次性，幂等）。
// 实际调用在 ROOT_USER_ID 定义后、day_themes PK 重建前。

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

// ===== 用户系统（多租户支持） =====
// 1. users 表：账号、bcrypt 密码密文、安全问题与答案密文
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    security_question TEXT NOT NULL DEFAULT '',
    security_answer_hash TEXT NOT NULL DEFAULT '',
    wx_openid TEXT,
    wx_unionid TEXT,
    wx_bound_at TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
`);

// 旧数据库升级：增加管理员标记。
try {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
} catch {
  /* 列已存在 */
}

// 给已存在的库添加微信绑定字段（幂等迁移）。
for (const col of ['wx_openid', 'wx_unionid', 'wx_bound_at']) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} ${col === 'wx_bound_at' ? 'TEXT' : 'TEXT'}`);
  } catch {
    /* 列已存在 */
  }
}
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wx_openid ON users(wx_openid) WHERE wx_openid IS NOT NULL`);
} catch {
  /* ignore */
}

// 2. 给所有"业务数据表"加 user_id 列，并建索引。
//    对老数据库：列不存在则添加；老数据 user_id 暂留 NULL，迁移完成后下面会回填为 root.id。
const OWNED_TABLES = [
  'events',
  'day_themes',
  'todos',
  'diary_entries',
  'diary_attachments',
  'diary_archive_log',
  'todo_attachments',
  'event_backgrounds',
  'music_tracks',
];

for (const t of OWNED_TABLES) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all();
  if (!cols.some((c) => c.name === 'user_id')) {
    db.exec(`ALTER TABLE ${t} ADD COLUMN user_id INTEGER DEFAULT NULL`);
  }
  // 索引单独 try/catch，因为重复 CREATE INDEX 会抛错
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_user ON ${t}(user_id)`);
  } catch {
    /* ignore */
  }
}

// 3. 安全地加载 bcryptjs —— ESM 下既有 default.hashSync 也能直接命名空间引用
import * as bcryptNs from 'bcryptjs';
const bcrypt = bcryptNs.default || bcryptNs;

// 本地开发环境初始化 admin / 123456。生产环境必须显式提供密码，
// 避免默认弱密码随代码发布到公网。
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD
  || (IS_PRODUCTION ? '' : '123456');
if (ADMIN_INITIAL_PASSWORD) {
  const adminRow = db.prepare('SELECT id, is_admin FROM users WHERE username = ?').get(ADMIN_USERNAME);
  if (!adminRow) {
    db.prepare(
      `INSERT INTO users
       (username, password_hash, security_question, security_answer_hash, is_admin)
       VALUES (?, ?, '', '', 1)`
    ).run(ADMIN_USERNAME, bcrypt.hashSync(ADMIN_INITIAL_PASSWORD, 12));
    console.log(`[auth] 已创建管理员 ${ADMIN_USERNAME}`);
  } else if (!adminRow.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(adminRow.id);
  }
}

// 4. 种入 root / 123456（如不存在），并把现有数据迁移给它
const ROOT_USERNAME = 'root';
let rootRow = db.prepare('SELECT id FROM users WHERE username = ?').get(ROOT_USERNAME);
if (!rootRow) {
  const hash = bcrypt.hashSync('123456', 12);
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, security_question, security_answer_hash)
       VALUES (?, ?, '', '')`
    )
    .run(ROOT_USERNAME, hash);
  rootRow = { id: Number(info.lastInsertRowid) };
  console.log(`[auth] 已创建超级管理员 root（默认密码 123456，请尽快修改）`);
}
const ROOT_USER_ID = rootRow.id;

for (const t of OWNED_TABLES) {
  db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`).run(ROOT_USER_ID);
}

// 4b. diary_archive_log PK 重建：从 (date, kind, item_id) 改为 (date, user_id, kind, item_id)
const logInfo = db.prepare(`PRAGMA table_info(diary_archive_log)`).all();
const logPkCols = logInfo.filter((c) => c.pk > 0).map((c) => c.name);
const logNeedsUserPk = !logPkCols.includes('user_id');
if (logNeedsUserPk) {
  db.exec(`ALTER TABLE diary_archive_log RENAME TO _diary_archive_log_old;`);
  db.exec(`
    CREATE TABLE diary_archive_log (
      user_id      INTEGER NOT NULL,
      date         TEXT    NOT NULL,
      kind         TEXT    NOT NULL CHECK(kind IN ('todo','event')),
      item_id      INTEGER NOT NULL,
      archived_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (date, user_id, kind, item_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_diary_archive_log_date ON diary_archive_log(date);`);
  db.exec(`
    INSERT INTO diary_archive_log (user_id, date, kind, item_id, archived_at)
    SELECT user_id, date, kind, item_id, archived_at FROM _diary_archive_log_old;
  `);
  db.exec(`DROP TABLE _diary_archive_log_old;`);
  console.log(`[auth] diary_archive_log PK 已迁移为 (date, user_id, kind, item_id)`);
}

// diary 种子：把 day_themes.title 拷到 diary_entries.title（一次性，幂等）
// 注意要在 day_themes PK 重建之前/之后都行，但要在 ROOT_USER_ID 之后。
const _themeSeedRows = db
  .prepare(`SELECT date, title FROM day_themes WHERE user_id = ?`)
  .all(ROOT_USER_ID);
const _insertDiary = db.prepare(
  `INSERT INTO diary_entries (user_id, date, title) VALUES (?, ?, ?)
   ON CONFLICT(user_id, date) DO UPDATE SET
     title = excluded.title,
     updated_at = datetime('now','localtime')`
);
db.transaction((rows) => {
  for (const r of rows) _insertDiary.run(ROOT_USER_ID, r.date, r.title);
})(_themeSeedRows);

// 5. day_themes 表 PK 重建：从 (date) 改为 (user_id, date)，让多用户能各有自己的主题
const themeInfo = db.prepare(`PRAGMA table_info(day_themes)`).all();
const pkCols = themeInfo.filter((c) => c.pk > 0).map((c) => c.name);
const needsCompositePk = !(pkCols.includes('user_id') && pkCols.includes('date'));
if (needsCompositePk) {
  db.exec(`ALTER TABLE day_themes RENAME TO _day_themes_old;`);
  db.exec(`
    CREATE TABLE day_themes (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (user_id, date)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_day_themes_date ON day_themes(date);`);
  // 老数据里 user_id 已经被回填为 ROOT_USER_ID；title/date 保留
  db.exec(`
    INSERT INTO day_themes (user_id, date, title, updated_at)
    SELECT user_id, date, title, updated_at FROM _day_themes_old;
  `);
  db.exec(`DROP TABLE _day_themes_old;`);
  console.log(`[auth] day_themes PK 已迁移为 (user_id, date)`);
}

// 6. diary_entries 表 PK 重建：从 (date) 改为 (user_id, date)
const diaryInfo = db.prepare(`PRAGMA table_info(diary_entries)`).all();
const diaryPkCols = diaryInfo.filter((c) => c.pk > 0).map((c) => c.name);
const diaryNeedsCompositePk = !(diaryPkCols.includes('user_id') && diaryPkCols.includes('date'));
if (diaryNeedsCompositePk) {
  db.exec(`ALTER TABLE diary_entries RENAME TO _diary_entries_old;`);
  db.exec(`
    CREATE TABLE diary_entries (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      markdown_content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (user_id, date)
    );
  `);
  db.exec(`
    INSERT INTO diary_entries (user_id, date, title, markdown_content, updated_at)
    SELECT user_id, date, title, markdown_content, updated_at FROM _diary_entries_old;
  `);
  db.exec(`DROP TABLE _diary_entries_old;`);
  console.log(`[auth] diary_entries PK 已迁移为 (user_id, date)`);
}

export default db;
export { ROOT_USER_ID, ROOT_USERNAME };
