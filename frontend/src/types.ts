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
  start_time: string;
  end_time: string;
  priority: Priority;
  note: string;
  done: boolean;
  created_at: string;
  updated_at: string;
  /** 首次完成的时间（HH:MM:SS 形式，本地时区），done=false 时为 null。 */
  completed_at: string | null;
  /** 事件自定义背景图（可选）。 */
  background_image: EventBackground | null;
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
}

/** 新建 todo 的请求体（必填字段收敛） */
export type TodoDraft = {
  title: string;
  priority: Priority;
  note?: string;
  due_date?: string | null;
};

/** 更新 todo 的请求体（任意子集） */
export type TodoPatch = Partial<{
  title: string;
  priority: Priority;
  note: string;
  done: boolean;
  due_date: string | null;
}>;

/** 拆解：把一个 todo 转成 event draft，附带 todo id 方便追溯（可选） */
export interface TodoToEventDraft {
  title: string;
  note: string;
  priority: Priority;
}
