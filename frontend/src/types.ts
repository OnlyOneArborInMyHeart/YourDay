export type Priority = 1 | 2 | 3;

/** 事件的自定义背景图。 */
export interface EventBackground {
  id: number;
  url: string;
  width: number | null;
  height: number | null;
  mime: string;
  original_name: string;
}

export interface Event {
  id: number;
  date: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  priority: Priority;
  note: string;
  done: boolean;
  created_at: string;
  updated_at: string;
  /** 首次完成的时间（HH:MM:SS 形式，本地时区），done=false 时为 null。 */
  completed_at: string | null;
  /** 事件自定义背景图（可选）。 */
  background_image: EventBackground | null;
  /** 纯待办项（无具体时间），不展示在日历时间轴，只出现在 TodoList。 */
  isTodo: boolean;
  /**
   * 任务首次被跨日顺延前的原始日期（YYYY-MM-DD）。
   * - 用户当天新建的任务：null
   * - 被顺延过一次及以上的任务：写入并保持不变（用于显示"距今 X 天"）
   */
  original_date: string | null;
}

export type EventDraft = {
  date: string;
  title: string;
  start_time: string;
  end_time: string;
  priority: Priority;
  note: string;
  /** 设置背景图时传 id；清除背景传 null；省略则不变。 */
  background_image_id?: number | null;
  /** 纯待办项，不记具体时间。 */
  isTodo?: boolean;
};

/** 用于部分更新的事件字段（done 切换 / 单字段编辑） */
export type EventPatch = Partial<Pick<Event, 'done'>> &
  Partial<Omit<EventDraft, 'date'>> & { date?: string };

/**
 * 总体待做事项（与 events 解耦）。
 * - 不绑定具体时段
 * - due_date 是可选的"截止日"
 * - done=true 时从"待办池"移入"已完成"折叠区
 */
export interface Todo {
  id: number;
  title: string;
  priority: Priority;
  note: string;
  done: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  /** 首次完成的时间，done=false 时为 null。 */
  completed_at: string | null;
  /**
   * 父 todo 的 id；null = 顶级。
   * 目前限制二级嵌套，不允许"父项本身也是另一项的子项"。
   */
  parent_id: number | null;
  /**
   * note 中实际引用的图片元数据（按 note 中的出现顺序）。
   * 通过 `![todo-img:ID](caption)` 这样的 markdown token 嵌入 note。
   */
  note_images: TodoNoteImage[];
}

export interface TodoNoteImage {
  id: number;
  filename: string;
  mime: string;
  size: number;
  original_name: string;
  created_at: string;
  /** 浏览器可访问的 URL，例如 /api/todo-attachments/xxx.png */
  url: string;
}

/** 新建 todo 的请求体（必填字段收敛） */
export type TodoDraft = {
  title: string;
  priority: Priority;
  note?: string;
  due_date?: string | null;
  /** 新建子待做时填父项 id；省略/null 则为顶级。 */
  parent_id?: number | null;
};

/** 更新 todo 的请求体（任意子集） */
export type TodoPatch = Partial<{
  title: string;
  priority: Priority;
  note: string;
  done: boolean;
  due_date: string | null;
  parent_id: number | null;
}>;

/** 拆解：把一个 todo 转成 event draft，附带 todo id 方便追溯（可选） */
export interface TodoToEventDraft {
  title: string;
  note: string;
  priority: Priority;
}
