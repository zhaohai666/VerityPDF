import { Menu, BrowserWindow, app, MenuItemConstructorOptions } from 'electron';

export function createAppMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin';

  const sendAction = (action: string) => {
    win.webContents.send('menu:action', action);
  };

  const template: MenuItemConstructorOptions[] = [
    // App 菜单 (仅 macOS)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    // 文件菜单
    {
      label: '文件',
      submenu: [
        {
          label: '打开 PDF...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendAction('file:open'),
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendAction('file:save'),
        },
        {
          label: '另存为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendAction('file:saveAs'),
        },
        { type: 'separator' },
        {
          label: '导出 PDF...',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendAction('file:export'),
        },
        { type: 'separator' },
        {
          label: '打印...',
          accelerator: 'CmdOrCtrl+P',
          click: () => sendAction('file:print'),
        },
        { type: 'separator' },
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ],
    },

    // 编辑菜单
    {
      label: '编辑',
      submenu: [
        {
          label: '撤销',
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendAction('edit:undo'),
        },
        {
          label: '重做',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => sendAction('edit:redo'),
        },
        { type: 'separator' },
        {
          label: '复制',
          accelerator: 'CmdOrCtrl+C',
          click: () => sendAction('edit:copy'),
        },
        {
          label: '粘贴',
          accelerator: 'CmdOrCtrl+V',
          click: () => sendAction('edit:paste'),
        },
        {
          label: '删除',
          // Delete 键由渲染进程 AnnotationCanvas 处理
          click: () => sendAction('edit:delete'),
        },
        { type: 'separator' },
        {
          label: '全选',
          accelerator: 'CmdOrCtrl+A',
          click: () => sendAction('edit:selectAll'),
        },
      ],
    },

    // 视图菜单
    {
      label: '视图',
      submenu: [
        {
          label: '放大',
          // accelerator 由渲染进程 useKeyboardShortcuts 处理
          click: () => sendAction('view:zoomIn'),
        },
        {
          label: '缩小',
          click: () => sendAction('view:zoomOut'),
        },
        {
          label: '适应页宽',
          click: () => sendAction('view:fitWidth'),
        },
        { type: 'separator' },
        {
          label: '上一页',
          click: () => sendAction('view:prevPage'),
        },
        {
          label: '下一页',
          click: () => sendAction('view:nextPage'),
        },
        { type: 'separator' },
        {
          label: '旋转页面',
          click: () => sendAction('view:rotate'),
        },
        { type: 'separator' },
        {
          label: '切换侧边栏',
          click: () => sendAction('view:toggleSidebar'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },

    // 帮助菜单
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 VerityPDF',
          click: () => sendAction('help:about'),
        },
        {
          label: '快捷键帮助',
          accelerator: 'F1',
          click: () => sendAction('help:shortcuts'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
