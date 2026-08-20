# YourDay · 每日规划记录本

一个网页端的个人每日规划记录本。前后端分离架构，界面采用圆角矩形 + 莫兰迪紫蓝主色调，支持：

- 24 小时纵向时间轴（00:00 – 24:00）
- 自定义时间段（精确到 15 分钟）+ 优先级（P1/P2/P3）
- 不同优先级以不同颜色在时间轴上呈现，自动避让重叠事项
- 顶部日期导航，左右切换日期；一键回到今天
- 双击时间轴空白处可快速在该时间点新建事项
- **总体待做（To‑do Pool）**：与"当天时间轴"解耦的待办池，可随时拆解到任意一天的某个时段
- 当日主题命名：给一天起一个名字（如"项目 A 启动日"），日历视图一览

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Node.js + Express |
| 数据库 | SQLite（`better-sqlite3`） |

## 目录结构

```
YourDay/
├── backend/                  # Express + SQLite 后端
│   ├── src/
│   │   ├── server.js         # 服务入口
│   │   ├── db.js             # SQLite 初始化
│   │   └── routes/events.js  # 事件 REST API
│   └── data/yourday.db       # 数据库文件（运行时生成）
├── frontend/                 # Vite + React 前端
│   ├── src/
│   │   ├── App.tsx           # 主应用
│   │   ├── api/events.ts     # REST 客户端
│   │   ├── components/       # DateHeader / Timeline / EventModal / Legend
│   │   ├── styles/global.css # 主题变量（圆角/配色）
│   │   └── utils/date.ts     # 时间工具
│   └── vite.config.ts        # /api 代理到后端
└── README.md
```

## 快速开始

需要本机已安装 Node.js ≥ 18。

### 1. 启动后端

```bash
cd backend
npm install
npm run dev      # http://localhost:3001
```

健康检查：`GET http://localhost:3001/api/health`

### 2. 启动前端

另开一个终端：

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

前端已通过 Vite 代理把 `/api/*` 转发到 `http://localhost:3001`。

### 3. 生产构建

```bash
cd frontend
npm run build
npm run preview
```

## REST API

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/events?date=YYYY-MM-DD` | 查询某日事件列表（按开始时间升序） |
| GET | `/api/events?from=YYYY-MM-DD&to=YYYY-MM-DD` | 查询日期区间事件 |
| GET | `/api/events/:id` | 查询单个事件 |
| POST | `/api/events` | 创建事件 |
| PUT | `/api/events/:id` | 更新事件 |
| DELETE | `/api/events/:id` | 删除事件 |
| GET | `/api/todos?done=0\|1&priority=1\|2\|3&q=keyword` | 查询总体待做（按 完成→优先级→截止日→创建时间 排序） |
| POST | `/api/todos` | 创建 todo |
| PUT | `/api/todos/:id` | 部分更新 todo |
| DELETE | `/api/todos/:id` | 删除 todo |
| PATCH | `/api/todos/:id/toggle` | 切换完成状态 |

事件结构：

```json
{
  "id": 1,
  "date": "2026-08-12",
  "title": "晨跑",
  "start_time": "06:30",
  "end_time": "07:15",
  "priority": 2,
  "note": "公园 5 公里",
  "created_at": "2026-08-12 22:30:12",
  "updated_at": "2026-08-12 22:30:12"
}
```

`priority`：1 = P1 重要且紧急 / 2 = P2 重要不紧急 / 3 = P3 一般事项。

todo 结构：

```json
{
  "id": 1,
  "title": "读完《深入理解计算机系统》第 6 章",
  "priority": 2,
  "note": "重点：存储器层次",
  "done": false,
  "due_date": "2026-08-20",
  "created_at": "2026-08-12 22:30:12",
  "updated_at": "2026-08-12 22:30:12"
}
```

`due_date`：可选截止日（YYYY‑MM‑DD），无截止日则为 `null`。
`done`：true 时进入"已完成"折叠区。

## 配色规范（CSS 变量）

在 `frontend/src/styles/global.css` 中可统一调整：

- 主色：`--color-primary: #6366f1`（紫蓝）
- 优先级：
  - P1：珊瑚红系（`#fff1f0` / `#ff7875` / `#cf1322`）
  - P2：琥珀橙系（`#fff7e6` / `#ffc069` / `#d46b08`）
  - P3：翡翠绿系（`#f6ffed` / `#95de64` / `#389e0d`）
- 圆角：`--radius-sm/md/lg/xl: 8/14/20/28px`

## 后续扩展建议

按 `YourDay.md` 的需求，后续可以扩展：

- [ ] 总体待做 + 任务拆解到时间轴（已完成）
- [ ] 日历联动 + Typora 笔记（按日/周/月聚合）
- [ ] Markdown 短文 / 图片 / 视频附件
- [ ] 周总结 / 月总结（接入 AI）
- [ ] 论文 / 阅读链接清单
- [ ] 心情波动曲线 + 大事标注
- [ ] 账单与花费统计

## License

MIT
