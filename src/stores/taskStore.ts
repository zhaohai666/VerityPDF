import { create } from 'zustand';
import type { TaskItemInfo, WorkflowTemplate, PipelineStep } from '@/types/electron';

const TEMPLATES_KEY = 'verityPDF:workflowTemplates';

interface TaskState {
  tasks: TaskItemInfo[];
  templates: WorkflowTemplate[];
  dialogVisible: boolean;
  pipelineDialogVisible: boolean;
  listenersInitialized: boolean;

  // 任务操作
  setTasks: (tasks: TaskItemInfo[]) => void;
  updateTask: (task: TaskItemInfo) => void;
  addTask: (task: TaskItemInfo) => void;
  removeTaskFromStore: (taskId: string) => void;
  setDialogVisible: (v: boolean) => void;
  setPipelineDialogVisible: (v: boolean) => void;

  // 模板 CRUD
  loadTemplates: () => void;
  saveTemplate: (t: { name: string; steps: PipelineStep[] }) => WorkflowTemplate;
  updateTemplate: (id: string, partial: Partial<WorkflowTemplate>) => void;
  deleteTemplate: (id: string) => void;

  // 初始化 IPC 监听
  initListeners: () => () => void;
}

/** 持久化模板到 localStorage */
function persistTemplates(templates: WorkflowTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // localStorage 写入失败静默处理
  }
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  templates: [],
  dialogVisible: false,
  pipelineDialogVisible: false,
  listenersInitialized: false,

  setTasks: (tasks) => set({ tasks }),

  updateTask: (task) =>
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx === -1) {
        return { tasks: [...state.tasks, task] };
      }
      const updated = [...state.tasks];
      updated[idx] = task;
      return { tasks: updated };
    }),

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  removeTaskFromStore: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),

  setDialogVisible: (v) => set({ dialogVisible: v }),
  setPipelineDialogVisible: (v) => set({ pipelineDialogVisible: v }),

  loadTemplates: () => {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      if (raw) {
        const templates: WorkflowTemplate[] = JSON.parse(raw);
        set({ templates });
      }
    } catch {
      // 解析失败保留空列表
    }
  },

  saveTemplate: ({ name, steps }) => {
    const now = Date.now();
    const template: WorkflowTemplate = {
      id: `tpl_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      steps,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => {
      const templates = [...state.templates, template];
      persistTemplates(templates);
      return { templates };
    });
    return template;
  },

  updateTemplate: (id, partial) =>
    set((state) => {
      const templates = state.templates.map((t) =>
        t.id === id ? { ...t, ...partial, updatedAt: Date.now() } : t
      );
      persistTemplates(templates);
      return { templates };
    }),

  deleteTemplate: (id) =>
    set((state) => {
      const templates = state.templates.filter((t) => t.id !== id);
      persistTemplates(templates);
      return { templates };
    }),

  initListeners: () => {
    if (get().listenersInitialized) return () => {};

    const unsubProgress = window.verityAPI.onTaskProgress((task) => {
      get().updateTask(task);
    });

    const unsubCompleted = window.verityAPI.onTaskCompleted((task) => {
      get().updateTask(task);
    });

    set({ listenersInitialized: true });

    return () => {
      unsubProgress();
      unsubCompleted();
      set({ listenersInitialized: false });
    };
  },
}));
