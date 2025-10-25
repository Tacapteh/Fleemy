export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  time?: string | null;
}

export interface DailyTodoDoc {
  userId: string;
  date: string; // "YYYY-MM-DD"
  items: TodoItem[];
  updatedAt: number;
}

export interface DailyTodoResponse {
  success: boolean;
  data: DailyTodoDoc;
  readOnly?: boolean;
}
