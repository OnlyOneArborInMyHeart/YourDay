export type Priority = 1 | 2 | 3;

export interface Event {
  id: number;
  date: string;        // YYYY-MM-DD
  title: string;
  start_time: string | null;
  end_time: string | null;
  priority: Priority;
  note: string;
  done: 0 | 1;
  is_todo: 0 | 1;
  background_image_id?: number | null;
}

export interface Todo {
  id: number;
  title: string;
  priority: Priority;
  note: string;
  done: 0 | 1;
  due_date: string | null;
}

export interface Diary {
  date: string;
  title: string;
  markdown_content: string;
  updated_at: string;
}