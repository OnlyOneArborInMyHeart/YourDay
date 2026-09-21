export type Priority = 1 | 2 | 3;

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
  done: 0 | 1;
  /** 后端字段。前端事件在 is_todo=1 时不显示在时间轴 */
  is_todo: 0 | 1;
  /** 前端用：与 is_todo 同步 */
  isTodo: boolean;
  background_image: EventBackground | null;
  background_image_id?: number | null;
}

export type EventDraft = {
  date: string;
  title: string;
  start_time: string;
  end_time: string;
  priority: Priority;
  note: string;
  isTodo?: boolean;
};

export type EventPatch = Partial<EventDraft> & { date?: string; done?: 0 | 1 | boolean };

export interface TodoNoteImage {
  id: number;
  filename: string;
  mime: string;
  size: number;
  original_name: string;
  created_at: string;
  url: string;
}

export interface Todo {
  id: number;
  title: string;
  priority: Priority;
  note: string;
  done: 0 | 1;
  due_date: string | null;
  parent_id: number | null;
  note_images: TodoNoteImage[];
  created_at: string;
  updated_at: string;
}

export type TodoDraft = {
  title: string;
  priority: Priority;
  note?: string;
  due_date?: string | null;
  parent_id?: number | null;
};

export type TodoPatch = Partial<{
  title: string;
  priority: Priority;
  note: string;
  done: boolean;
  due_date: string | null;
  parent_id: number | null;
}>;

export interface DiaryAttachment {
  id: number;
  date: string;
  kind: 'image' | 'video' | 'audio';
  filename: string;
  mime: string;
  size: number;
  original_name: string;
  created_at: string;
  url?: string;
}

export interface Diary {
  date: string;
  title: string;
  markdown_content: string;
  updated_at: string | null;
  attachments: DiaryAttachment[];
}

export interface MusicTrack {
  id: number;
  title: string;
  filename: string;
  mime: string;
  size: number;
  original_name: string;
  cover_filename: string | null;
  lyrics: string | null;
  url: string;
  cover_url: string | null;
  created_at: string;
}