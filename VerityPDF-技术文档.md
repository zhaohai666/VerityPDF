# VerityPDF — 软件开发技术文档

> **版本**: v1.0.0  
> **最后更新**: 2026-06-15  
> **技术栈**: Electron 30 · PDF.js 4.x · Konva.js 9.x · React 18 · TypeScript 5 · Vite 5

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构设计](#2-系统架构设计)
3. [开发环境搭建](#3-开发环境搭建)
4. [目录结构与模块划分](#4-目录结构与模块划分)
5. [Electron 主进程模块](#5-electron-主进程模块)
6. [PDF.js 渲染引擎](#6-pdfjs-渲染引擎)
7. [Konva.js 标注引擎](#7-konavajs-标注引擎)
8. [坐标系统与多图层同步](#8-坐标系统与多图层同步)
9. [状态管理 (Zustand)](#9-状态管理-zustand)
10. [UI 组件体系](#10-ui-组件体系)
11. [IPC 通信协议](#11-ipc-通信协议)
12. [数据持久化与文件格式](#12-数据持久化与文件格式)
13. [PDF 导出与合并](#13-pdf-导出与合并)
14. [键盘快捷键系统](#14-键盘快捷键系统)
15. [国际化 (i18n)](#15-国际化-i18n)
16. [性能优化策略](#16-性能优化策略)
17. [安全模型](#17-安全模型)
18. [错误处理与日志](#18-错误处理与日志)
19. [测试策略](#19-测试策略)
20. [构建、打包与发布](#20-构建打包与发布)
21. [CI/CD 流水线](#21-cicd-流水线)
22. [已知限制与路线图](#22-已知限制与路线图)
23. [附录：依赖清单](#23-附录依赖清单)
24. [附录：开发规范](#24-附录开发规范)

---

## 1. 项目概述

### 1.1 产品定位

VerityPDF 是一款面向专业用户的**桌面端 PDF 文档批注与审阅工具**，核心场景包括：

- 合同/法务文档审阅与标注
- 工程图纸批注与测量
- 学术论文同行评审标注
- 设计稿反馈与签名确认
- 政府/企业无纸化办公流转

### 1.2 核心功能矩阵

| 功能域 | 功能点 | 优先级 | 状态 |
|--------|--------|--------|------|
| **文档浏览** | PDF 渲染、缩放、翻页、连续滚动 | P0 | ✅ |
| **文档浏览** | 缩略图导航、大纲书签跳转 | P0 | ✅ |
| **文档浏览** | 全文搜索 (Ctrl+F) | P1 | ✅ |
| **标注工具** | 矩形、椭圆、箭头、直线 | P0 | ✅ |
| **标注工具** | 自由画笔 (压感支持) | P0 | ✅ |
| **标注工具** | 文本标注、高亮、下划线、删除线 | P0 | ✅ |
| **标注工具** | 便签批注 (Sticky Note) | P1 | ✅ |
| **标注工具** | 印章、签名（手写/图片） | P1 | ✅ |
| **标注工具** | 距离/面积测量工具 | P2 | 🔲 |
| **链接编辑** | 超链接标注 CRUD（URI/页面跳转） | P1 | ✅ |
| **书签编辑** | 树形书签管理（增删改、层级调整） | P1 | ✅ |
| **脚本执行** | QuickJS 沙箱脚本引擎（验证/执行/统计） | P2 | ✅ |
| **页面管理** | 页面旋转、删除、重排 | P1 | ✅ |
| **页面管理** | 插入空白页 | P2 | 🔲 |
| **文档导出** | 标注合并导出为新 PDF | P0 | ✅ |
| **文档导出** | 导出为图片 (PNG/JPG) | P2 | 🔲 |
| **协作功能** | 批注评论回复 | P2 | 🔲 |
| **安全功能** | 文档加密 / 水印 | P3 | 🔲 |

### 1.3 竞品对比

| 特性 | VerityPDF | Adobe Acrobat | Foxit Reader | PDF.js Viewer |
|------|-----------|---------------|--------------|---------------|
| 开源 | ✅ MIT | ❌ | 部分 | ✅ Apache-2.0 |
| 桌面原生 | ✅ Electron | ✅ 原生 | ✅ 原生 | ❌ Web |
| 标注丰富度 | ★★★★ | ★★★★★ | ★★★★ | ★★ |
| 启动速度 | <2s | 5-8s | 3-5s | <1s |
| 内存占用 | ~120MB | ~400MB | ~250MB | ~80MB |
| 跨平台 | ✅ Mac/Win/Linux | ✅ Mac/Win | ✅ Mac/Win | ✅ 浏览器 |
| 离线使用 | ✅ | ✅ | ✅ | ✅ |
| 自定义扩展 | ✅ 插件系统 | 有限 | 有限 | 需二次开发 |

### 1.4 系统要求

| 平台 | 最低配置 | 推荐配置 |
|------|---------|---------|
| **macOS** | 11.0 (Big Sur), 4GB RAM | 13.0+, 8GB RAM |
| **Windows** | Win 10 1809, 4GB RAM | Win 11, 8GB RAM |
| **Linux** | Ubuntu 20.04 / Fedora 36 | Ubuntu 22.04+, 8GB RAM |
| **通用** | 500MB 磁盘空间 | SSD + 2GB 磁盘空间 |

---

## 2. 系统架构设计

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Electron Application                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     Main Process (Node.js)                     │  │
│  │                                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌─────────────┐  │  │
│  │  │ 窗口管理  │  │ 文件系统  │  │ pdf-lib   │  │ 自动更新    │  │  │
│  │  │ Manager  │  │ FS/Watch │  │ PDF生成    │  │ electron-   │  │  │
│  │  │          │  │          │  │ /合并/拆分  │  │ updater     │  │  │
│  │  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └──────┬──────┘  │  │
│  │       │              │              │               │          │  │
│  │  ┌────┴──────────────┴──────────────┴───────────────┴───────┐  │  │
│  │  │              IPC Handler Registry (ipcMain)              │  │  │
│  │  └─────────────────────────┬────────────────────────────────┘  │  │
│  └────────────────────────────┼────────────────────────────────────┘  │
│                               │ IPC (contextBridge)                   │
│  ┌────────────────────────────┼────────────────────────────────────┐  │
│  │              Preload Script (安全桥接层)                         │  │
│  │  ┌─────────────────────────┴────────────────────────────────┐  │  │
│  │  │         electronAPI (contextBridge.exposeInMainWorld)    │  │  │
│  │  └─────────────────────────┬────────────────────────────────┘  │  │
│  └────────────────────────────┼────────────────────────────────────┘  │
│                               │                                       │
│  ┌────────────────────────────┼────────────────────────────────────┐  │
│  │                Renderer Process (Chromium)                      │  │
│  │                                                                  │  │
│  │  ┌────────────────────────┴──────────────────────────────────┐  │  │
│  │  │                   React Application                       │  │  │
│  │  │                                                           │  │  │
│  │  │  ┌───────────┐  ┌────────────┐  ┌──────────────────────┐ │  │  │
│  │  │  │  Toolbar   │  │  Sidebar   │  │  Properties Panel   │ │  │  │
│  │  │  │  工具栏    │  │  缩略图/    │  │  属性编辑面板        │ │  │  │
│  │  │  │           │  │  大纲/批注  │  │                     │ │  │  │
│  │  │  └─────┬─────┘  └─────┬──────┘  └──────────┬──────────┘ │  │  │
│  │  │        │              │                     │            │  │  │
│  │  │  ┌─────┴──────────────┴─────────────────────┴──────────┐ │  │  │
│  │  │  │              PDF Viewer (核心视图区)                 │ │  │  │
│  │  │  │                                                     │ │  │  │
│  │  │  │  ┌─────────────────────────────────────────────┐    │ │  │  │
│  │  │  │  │        Konva Annotation Layer               │    │ │  │  │
│  │  │  │  │        (标注交互层 - z-index: 30)            │    │ │  │  │
│  │  │  │  ├─────────────────────────────────────────────┤    │ │  │  │
│  │  │  │  │        HTML Text Layer                      │    │ │  │  │
│  │  │  │  │        (文本选择层 - z-index: 20)            │    │ │  │  │
│  │  │  │  ├─────────────────────────────────────────────┤    │ │  │  │
│  │  │  │  │        Canvas Render Layer (PDF.js)         │    │ │  │  │
│  │  │  │  │        (PDF渲染层 - z-index: 10)             │    │ │  │  │
│  │  │  │  └─────────────────────────────────────────────┘    │ │  │  │
│  │  │  └─────────────────────────────────────────────────────┘ │  │  │
│  │  │                                                           │  │  │
│  │  │  ┌────────────────────────────────────────────────────┐   │  │  │
│  │  │  │              Zustand Store (状态管理)              │   │  │  │
│  │  │  │  pdfStore | annotationStore | uiStore | toolStore  │   │  │  │
│  │  │  └────────────────────────────────────────────────────┘   │  │  │
│  │  └───────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 进程模型

```
Electron App
├── Main Process (1个)
│   ├── 窗口管理 (BrowserWindow)
│   ├── 文件系统 I/O (fs, chokidar)
│   ├── PDF 生成/合并 (pdf-lib)
│   ├── 原生菜单 & 快捷键
│   ├── 自动更新 (electron-updater)
│   └── IPC 调度 (ipcMain.handle)
│
├── Renderer Process (1个, sandbox=true)
│   ├── React 18 UI
│   ├── PDF.js 渲染 (Web Worker)
│   ├── Konva.js 标注交互
│   └── Zustand 状态管理
│
└── PDF.js Worker (1-2个)
    ├── PDF 解析 (pdf.worker.mjs)
    └── 字体加载 & CMap 处理
```

### 2.3 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户交互层                                │
│  鼠标点击 → DrawingController → AnnotationManager → Konva.Shape │
│  键盘输入 → ShortcutManager → Command → Store.dispatch          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        状态管理层                                │
│  Zustand Store                                                   │
│  ├── pdfStore     (文档/页面/缩放/旋转)                           │
│  ├── annotStore   (标注CRUD/选中/历史)                            │
│  ├── toolStore    (当前工具/样式/光标)                             │
│  └── uiStore      (侧边栏/面板/主题/全屏)                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        服务层                                    │
│  PDFService → PDFPageRenderer / PageCacheManager                 │
│  AnnotationService → AnnotationManager / HistoryManager          │
│  ExportService → pdf-lib 合并导出                                 │
│  StorageService → .verity 项目文件读写                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        IPC 通信层                                │
│  Renderer → electronAPI → ipcRenderer.invoke → ipcMain.handle   │
│  Main → BrowserWindow.webContents.send → ipcRenderer.on         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 多图层渲染架构

PDF 页面采用四层叠加设计，每层职责严格分离：

```
z-index: 30  ┌─────────────────────────────────────────────┐
             │  Konva Annotation Layer                      │
             │  - 所有标注图形 (Rect, Arrow, Line, Text...)  │
             │  - Transformer 选中框                         │
             │  - 绘制中的临时图形                            │
             │  - 鼠标交互事件捕获                            │
             └─────────────────────────────────────────────┘
z-index: 20  ┌─────────────────────────────────────────────┐
             │  HTML Text Layer                              │
             │  - PDF 文本内容的 HTML 映射                    │
             │  - pointer-events: none (穿透到 Konva)        │
             │  - 支持 Ctrl+F 浏览器搜索                     │
             │  - 支持文本选择和复制                          │
             └─────────────────────────────────────────────┘
z-index: 10  ┌─────────────────────────────────────────────┐
             │  Canvas Render Layer (PDF.js)                 │
             │  - PDF 页面光栅化渲染                          │
             │  - 含矢量图形、图片、字体                       │
             │  - pointer-events: none                      │
             └─────────────────────────────────────────────┘
z-index:  0  ┌─────────────────────────────────────────────┐
             │  Background Layer                             │
             │  - 页面白底 + box-shadow 阴影                 │
             │  - 虚拟滚动占位 (padding)                     │
             └─────────────────────────────────────────────┘
```

**关键设计决策**：
- Text Layer 设置 `pointer-events: none`，鼠标事件穿透到 Konva 层处理
- 当用户需要选择文本时，通过 `toolStore` 切换到"选择工具"模式，动态开启 Text Layer 的 `pointer-events`
- Konva Stage 覆盖整个页面区域，通过 `listening` 属性控制各图形是否响应事件

---

## 3. 开发环境搭建

### 3.1 基础环境

| 工具 | 最低版本 | 推荐版本 | 安装命令 |
|------|---------|---------|---------|
| Node.js | 18.x LTS | 20.x LTS | `nvm install 20` |
| pnpm | 8.x | 9.x | `npm i -g pnpm` |
| Git | 2.30+ | 最新 | `brew install git` |
| Python | 3.8+ (node-gyp) | 3.11+ | `brew install python` |
| Xcode CLT | 14+ (macOS) | 最新 | `xcode-select --install` |

### 3.2 项目初始化

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/VerityPDF.git
cd VerityPDF

# 2. 安装依赖 (pnpm 推荐)
pnpm install

# 3. 启动开发服务器 (Vite HMR + Electron)
pnpm dev
# → Vite dev server: http://localhost:5173
# → Electron 窗口自动打开

# 4. 仅启动渲染进程 (浏览器调试)
pnpm dev:web
# → 在浏览器中打开 http://localhost:5173

# 5. 构建生产版本
pnpm build

# 6. 预览生产构建
pnpm preview
```

### 3.3 IDE 推荐配置

**VS Code 扩展** (`.vscode/extensions.json`):

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

**VS Code 设置** (`.vscode/settings.json`):

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "files.associations": {
    "*.css": "tailwindcss"
  }
}
```

### 3.4 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NODE_ENV` | `development` | 运行环境 |
| `VITE_APP_VERSION` | (从 package.json 读取) | 应用版本号 |
| `VITE_PDF_WORKER_SRC` | `/pdf.worker.mjs` | PDF.js Worker 路径 |
| `VITE_CMAP_URL` | `/cmaps/` | CMap 字体映射路径 |
| `VITE_TELEMETRY_URL` | `""` | 遥测上报地址（空=禁用） |
| `ELECTRON_DEV_TOOLS` | `true` | 是否打开 DevTools |

### 3.5 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `node-gyp` 编译失败 | 缺少 Python / Xcode CLT | `xcode-select --install` 或 `apt install python3` |
| Electron 白屏 | Vite 未就绪 | 等待 Vite 输出 "ready" 后再加载 |
| PDF.js Worker 404 | Worker 路径配置错误 | 检查 `vite.config.ts` 中的 `optimizeDeps` 和静态资源复制 |
| macOS 签名失败 | 缺少证书 | `CSC_IDENTITY_AUTO_DISCOVERY=false` 跳过签名(仅开发) |
| Konva 在 Electron 中渲染异常 | GPU 加速问题 | 启动参数加 `--disable-gpu-compositing` |
| HMR 不生效 | Electron 渲染进程不走 Vite HMR | 使用 `electron-vite` 或 `vite-plugin-electron` |

---

## 4. 目录结构与模块划分

```
VerityPDF/
├── electron/                           # ═══ Electron 主进程 ═══
│   ├── main.ts                         # 主进程入口: 窗口创建、生命周期
│   ├── preload.ts                      # 预加载脚本: contextBridge API
│   ├── window/                         # 窗口管理
│   │   ├── mainWindow.ts              # 主窗口配置
│   │   ├── splashWindow.ts            # 启动闪屏窗口
│   │   └── printWindow.ts             # 打印预览窗口
│   ├── ipc/                            # IPC 处理器注册
│   │   ├── index.ts                   # 统一注册入口
│   │   ├── fileHandlers.ts            # 文件打开/保存/读取
│   │   ├── exportHandlers.ts          # PDF 导出
│   │   ├── systemHandlers.ts          # 系统信息/剪贴板
│   │   └── updateHandlers.ts          # 自动更新
│   ├── menu/                           # 原生菜单
│   │   ├── appMenu.ts                 # 应用菜单栏 (macOS)
│   │   ├── contextMenu.ts             # 右键上下文菜单
│   │   └── recentFiles.ts             # 最近文件列表
│   ├── services/                       # 主进程服务
│   │   ├── autoUpdater.ts             # 自动更新逻辑
│   │   ├── crashReporter.ts           # 崩溃上报
│   │   ├── fileWatcher.ts             # 文件变更监听 (chokidar)
│   │   └── printService.ts            # PDF 打印
│   └── utils/                          # 主进程工具
│       ├── logger.ts                  # 日志 (electron-log)
│       ├── platform.ts                # 平台检测
│       └── paths.ts                   # 路径解析 (app.getPath)
│
├── src/                                # ═══ 渲染进程 ═══
│   ├── main.tsx                        # 渲染进程入口 (React DOM render)
│   ├── App.tsx                         # 根组件: 布局 & 路由
│   ├── vite-env.d.ts                   # Vite 类型声明
│   │
│   ├── components/                     # ─── UI 组件 ───
│   │   ├── Layout/                     # 布局组件
│   │   │   ├── AppShell.tsx           # 主布局壳
│   │   │   ├── TitleBar.tsx           # 自定义标题栏 (Win/Linux)
│   │   │   └── StatusBar.tsx          # 底部状态栏
│   │   ├── Toolbar/                    # 顶部工具栏
│   │   │   ├── Toolbar.tsx            # 工具栏容器
│   │   │   ├── ToolButton.tsx         # 工具按钮
│   │   │   ├── ZoomControl.tsx        # 缩放控件
│   │   │   ├── PageNavigator.tsx      # 页码导航
│   │   │   └── StylePicker.tsx        # 颜色/线宽选择器
│   │   ├── Sidebar/                    # 左侧边栏
│   │   │   ├── Sidebar.tsx            # 侧边栏容器
│   │   │   ├── ThumbnailPanel.tsx     # 缩略图面板
│   │   │   ├── OutlinePanel.tsx       # PDF 大纲/书签
│   │   │   ├── AnnotationList.tsx     # 批注列表面板
│   │   │   └── SearchPanel.tsx        # 搜索结果面板
│   │   ├── Viewer/                     # 核心查看器
│   │   │   ├── PDFViewer.tsx          # 查看器主容器
│   │   │   ├── PageContainer.tsx      # 单页容器
│   │   │   ├── PDFCanvas.tsx          # PDF.js Canvas
│   │   │   ├── TextLayer.tsx          # 文本选择层
│   │   │   └── VirtualScroll.tsx      # 虚拟滚动
│   │   ├── Annotation/                 # 标注相关
│   │   │   ├── KonvaStage.tsx         # Konva Stage 包装
│   │   │   ├── AnnotationLayer.tsx    # 标注层管理
│   │   │   ├── AnnotationRenderer.tsx # 标注图形渲染
│   │   │   └── TransformHandler.tsx   # 选中变换器
│   │   ├── Properties/                 # 右侧属性面板
│   │   │   ├── PropertiesPanel.tsx    # 面板容器
│   │   │   ├── StyleEditor.tsx        # 样式编辑
│   │   │   ├── TextEditor.tsx         # 文本内容编辑
│   │   │   └── PositionEditor.tsx     # 位置/尺寸编辑
│   │   ├── Signature/                  # 签名模块
│   │   │   ├── SignatureDialog.tsx    # 签名对话框
│   │   │   ├── SignatureCanvas.tsx    # 手写签名画板
│   │   │   └── SignatureStamp.tsx     # 印章预览
│   │   ├── hyperlink/                  # 链接编辑模块
│   │   │   └── HyperlinkEditDialog.tsx # 超链接编辑对话框
│   │   ├── bookmark/                   # 书签编辑模块
│   │   │   └── BookmarkEditDialog.tsx  # 书签编辑对话框
│   │   ├── script/                     # 脚本执行模块
│   │   │   └── ScriptExecuteDialog.tsx # 脚本执行对话框
│   │   └── Dialogs/                    # 对话框
│   │       ├── ExportDialog.tsx       # 导出设置
│   │       ├── PrintDialog.tsx        # 打印设置
│   │       ├── AboutDialog.tsx        # 关于信息
│   │       └── PreferencesDialog.tsx  # 偏好设置
│   │
│   ├── services/                       # ─── 业务服务层 ───
│   │   ├── pdf/                        # PDF 渲染服务
│   │   │   ├── PDFService.ts          # 文档加载/管理
│   │   │   ├── PDFPageRenderer.ts     # 页面渲染
│   │   │   ├── PDFTextLayer.ts        # 文本层渲染
│   │   │   ├── PDFThumbnailRenderer.ts# 缩略图渲染
│   │   │   ├── PDFOutlineService.ts   # 大纲/书签
│   │   │   ├── PDFSearchService.ts    # 文本搜索
│   │   │   └── PageCacheManager.ts    # LRU 页面缓存
│   │   ├── annotation/                 # 标注服务
│   │   │   ├── AnnotationManager.ts   # 标注 CRUD 管理
│   │   │   ├── DrawingController.ts   # 绘制控制器
│   │   │   ├── HistoryManager.ts      # 撤销/重做
│   │   │   ├── SnapHelper.ts          # 对齐吸附
│   │   │   └── AnnotationExporter.ts  # 标注导出转换
│   │   ├── storage/                    # 持久化服务
│   │   │   ├── ProjectStorage.ts      # .verity 项目文件
│   │   │   ├── RecentFiles.ts         # 最近文件记录
│   │   │   └── PreferencesStore.ts    # 用户偏好
│   │   └── export/                     # 导出服务
│   │       ├── PDFExportService.ts     # PDF 合并导出
│   │       └── ImageExportService.ts   # 图片导出
│   │
│   ├── hooks/                          # ─── 自定义 Hooks ───
│   │   ├── usePDFDocument.ts          # 文档加载 Hook
│   │   ├── usePageRender.ts           # 页面渲染 Hook
│   │   ├── useAnnotations.ts          # 标注操作 Hook
│   │   ├── useDrawing.ts              # 绘制交互 Hook
│   │   ├── useKeyboardShortcuts.ts    # 快捷键 Hook
│   │   ├── useVirtualScroll.ts        # 虚拟滚动 Hook
│   │   ├── useResizeObserver.ts       # 尺寸监听 Hook
│   │   └── useClipboard.ts            # 剪贴板 Hook
│   │
│   ├── stores/                         # ─── Zustand 状态 ───
│   │   ├── pdfStore.ts                # PDF 文档状态
│   │   ├── annotationStore.ts         # 标注数据状态
│   │   ├── toolStore.ts               # 工具/样式状态
│   │   └── uiStore.ts                 # UI 布局状态
│   │
│   ├── types/                          # ─── 类型定义 ───
│   │   ├── pdf.ts                     # PDF 相关类型
│   │   ├── annotation.ts             # 标注相关类型
│   │   ├── electron.d.ts             # electronAPI 类型声明
│   │   ├── store.ts                  # Store 类型
│   │   └── ipc.ts                    # IPC 通道类型
│   │
│   ├── utils/                          # ─── 工具函数 ───
│   │   ├── coordinateConverter.ts     # 坐标转换
│   │   ├── colorUtils.ts             # 颜色转换
│   │   ├── idGenerator.ts            # UUID/短ID生成
│   │   ├── debounce.ts               # 防抖/节流
│   │   ├── mathUtils.ts              # 几何计算
│   │   └── formatUtils.ts            # 格式化(日期/尺寸)
│   │
│   ├── styles/                         # ─── 全局样式 ───
│   │   ├── globals.css                # 全局 CSS
│   │   ├── variables.css              # CSS 变量 (主题)
│   │   ├── pdf.css                    # PDF.js 样式覆写
│   │   └── konva.css                  # Konva 层样式
│   │
│   ├── i18n/                           # ─── 国际化 ───
│   │   ├── index.ts                   # i18n 初始化
│   │   ├── locales/
│   │   │   ├── zh-CN.json            # 中文简体
│   │   │   ├── en-US.json            # English
│   │   │   └── ja-JP.json            # 日本語
│   │   └── useTranslation.ts          # 翻译 Hook
│   │
│   └── assets/                         # ─── 静态资源 ───
│       ├── icons/                     # SVG 图标
│       ├── fonts/                     # 内嵌字体
│       └── stamps/                    # 预设印章图片
│
├── resources/                          # ═══ Electron 资源 ═══
│   ├── icon.icns                      # macOS 图标
│   ├── icon.ico                       # Windows 图标
│   ├── icon.png                       # Linux 图标
│   └── installer/                     # 安装器资源
│
├── tests/                              # ═══ 测试 ═══
│   ├── unit/                          # 单元测试 (Vitest)
│   ├── integration/                   # 集成测试
│   ├── e2e/                           # E2E 测试 (Playwright)
│   └── fixtures/                      # 测试数据
│
├── build/                              # ═══ 构建配置 ═══
│   ├── electron-builder.yml           # Electron 打包配置
│   ├── notarize.js                    # macOS 公证脚本
│   └── entitlements.mac.plist         # macOS 权限声明
│
├── vite.config.ts                      # Vite 配置
├── vitest.config.ts                    # Vitest 测试配置
├── tsconfig.json                       # TypeScript 配置
├── tsconfig.node.json                  # Node 端 TS 配置
├── .eslintrc.cjs                       # ESLint 配置
├── .prettierrc                         # Prettier 配置
├── tailwind.config.ts                  # Tailwind CSS 配置
├── postcss.config.js                   # PostCSS 配置
└── package.json                        # 项目配置
```

### 4.1 模块依赖关系

```
components/ ──────▶ hooks/ ──────▶ services/ ──────▶ utils/
    │                 │                │                │
    │                 │                │                │
    ▼                 ▼                ▼                ▼
  stores/ ◀────── stores/ ◀───── stores/          (纯函数)
    │
    ▼
  types/
```

**规则**：
- `components` 只能通过 `hooks` 间接调用 `services`
- `services` 可以互相调用，但不能依赖 `components` 和 `stores`
- `stores` 是纯数据层，通过 `actions` 调用 `services`
- `utils` 是纯函数，不依赖任何其他模块


---

## 5. Electron 主进程模块

### 5.1 主进程入口

```typescript
// electron/main.ts
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc';
import { createAppMenu } from './menu/appMenu';
import { setupAutoUpdater } from './services/autoUpdater';
import { logger } from './utils/logger';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

/**
 * 创建启动闪屏窗口
 */
function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
    },
  });
  splash.loadFile(path.join(__dirname, '../resources/splash.html'));
  return splash;
}

/**
 * 创建主窗口
 */
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'VerityPDF',
    show: false, // 先隐藏，ready-to-show 时再显示
    backgroundColor: '#1e1e2e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform === 'darwin' ? false : true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      // 性能调优
      backgroundThrottling: false,
    },
  });

  // 开发模式加载 Vite dev server
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 窗口准备好后显示
  win.once('ready-to-show', () => {
    splashWindow?.close();
    splashWindow = null;
    win.show();
  });

  // 窗口关闭处理
  win.on('close', (e) => {
    // 如果有未保存的修改，弹出确认对话框
    // ...
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

/**
 * 应用初始化
 */
async function initialize(): Promise<void> {
  // 单实例锁
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', (_event, argv) => {
    // 处理第二个实例传入的文件路径
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // 解析 argv 中的文件路径
      const filePath = argv.find(arg => arg.endsWith('.pdf'));
      if (filePath) {
        mainWindow.webContents.send('file:open-from-argv', filePath);
      }
    }
  });

  // macOS: 处理从 Dock / Finder 打开文件
  app.on('open-file', (_event, filePath) => {
    if (mainWindow) {
      mainWindow.webContents.send('file:open-from-argv', filePath);
    }
  });
}

app.whenReady().then(async () => {
  await initialize();

  // 创建闪屏
  splashWindow = createSplashWindow();

  // 注册 IPC 处理器
  registerIpcHandlers();

  // 创建菜单
  Menu.setApplicationMenu(createAppMenu());

  // 创建主窗口
  mainWindow = createMainWindow();

  // 设置自动更新
  if (process.env.NODE_ENV !== 'development') {
    setupAutoUpdater(mainWindow);
  }

  logger.info('Application ready', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  }
});

// 安全: 阻止新窗口创建
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
```

### 5.2 Preload 脚本 (安全桥接层)

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

/**
 * 定义暴露给渲染进程的 API 类型
 */
export interface ElectronAPI {
  // ── 文件操作 ──
  file: {
    open(): Promise<string | null>;
    read(filePath: string): Promise<ArrayBuffer>;
    save(data: ArrayBuffer, defaultName: string): Promise<string | null>;
    exists(filePath: string): Promise<boolean>;
    getRecentFiles(): Promise<string[]>;
    clearRecentFiles(): Promise<void>;
  };

  // ── PDF 导出 ──
  export: {
    pdf(annotations: unknown[], sourcePath: string, outputPath: string): Promise<boolean>;
    images(pageDataUrl: string, format: 'png' | 'jpeg'): Promise<string>;
  };

  // ── 系统交互 ──
  system: {
    getPlatform(): NodeJS.Platform;
    getAppVersion(): string;
    copyToClipboard(text: string): Promise<void>;
    readFromClipboard(): Promise<string>;
    showItemInFolder(filePath: string): void;
    openExternal(url: string): Promise<void>;
  };

  // ── 窗口控制 ──
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(callback: (maximized: boolean) => void): () => void;
  };

  // ── 自动更新 ──
  updater: {
    checkForUpdates(): void;
    downloadUpdate(): void;
    installUpdate(): void;
    onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void;
    onUpdateProgress(callback: (progress: number) => void): () => void;
  };

  // ── 事件监听 ──
  events: {
    onMenuAction(callback: (action: string) => void): () => void;
    onFileOpen(callback: (filePath: string) => void): () => void;
    onPrint(callback: () => void): () => void;
  };
}

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
}

/**
 * 安全地创建事件监听器，返回取消订阅函数
 */
function createListener(channel: string) {
  return (callback: (...args: unknown[]) => void) => {
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

/**
 * 通过 contextBridge 暴露安全 API
 */
contextBridge.exposeInMainWorld('electronAPI', {
  file: {
    open: () => ipcRenderer.invoke('file:open'),
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    save: (data: ArrayBuffer, defaultName: string) =>
      ipcRenderer.invoke('file:save', data, defaultName),
    exists: (filePath: string) => ipcRenderer.invoke('file:exists', filePath),
    getRecentFiles: () => ipcRenderer.invoke('file:recent-list'),
    clearRecentFiles: () => ipcRenderer.invoke('file:recent-clear'),
  },

  export: {
    pdf: (annotations: unknown[], sourcePath: string, outputPath: string) =>
      ipcRenderer.invoke('export:pdf', annotations, sourcePath, outputPath),
    images: (pageDataUrl: string, format: string) =>
      ipcRenderer.invoke('export:image', pageDataUrl, format),
  },

  system: {
    getPlatform: () => process.platform,
    getAppVersion: () => ipcRenderer.sendSync('app:version'),
    copyToClipboard: (text: string) => ipcRenderer.invoke('system:clipboard-write', text),
    readFromClipboard: () => ipcRenderer.invoke('system:clipboard-read'),
    showItemInFolder: (filePath: string) => ipcRenderer.send('system:show-in-folder', filePath),
    openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url),
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: createListener('window:maximized-changed'),
  },

  updater: {
    checkForUpdates: () => ipcRenderer.send('updater:check'),
    downloadUpdate: () => ipcRenderer.send('updater:download'),
    installUpdate: () => ipcRenderer.send('updater:install'),
    onUpdateAvailable: createListener('updater:available'),
    onUpdateProgress: createListener('updater:progress'),
  },

  events: {
    onMenuAction: createListener('menu:action'),
    onFileOpen: createListener('file:open-from-argv'),
    onPrint: createListener('menu:print'),
  },
} as ElectronAPI);
```

### 5.3 原生菜单系统

```typescript
// electron/menu/appMenu.ts
import { Menu, MenuItemConstructorOptions, BrowserWindow, app, shell } from 'electron';

export function createAppMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // macOS 应用菜单
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: '偏好设置...',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendMenuAction('preferences'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),

    // 文件菜单
    {
      label: '文件',
      submenu: [
        {
          label: '打开 PDF...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuAction('file-open'),
        },
        {
          label: '最近文件',
          id: 'recent-files',
          submenu: [
            { label: '(无最近文件)', enabled: false },
            { type: 'separator' },
            { label: '清除最近文件', click: () => sendMenuAction('clear-recent') },
          ],
        },
        { type: 'separator' },
        {
          label: '保存标注',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('save'),
        },
        {
          label: '另存为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuAction('save-as'),
        },
        { type: 'separator' },
        {
          label: '导出 PDF...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => sendMenuAction('export-pdf'),
        },
        { type: 'separator' },
        {
          label: '打印...',
          accelerator: 'CmdOrCtrl+P',
          click: () => sendMenuAction('print'),
        },
        ...(isMac ? [] : [
          { type: 'separator' as const },
          { role: 'quit' as const },
        ]),
      ],
    },

    // 编辑菜单
    {
      label: '编辑',
      submenu: [
        {
          label: '撤销',
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendMenuAction('undo'),
        },
        {
          label: '重做',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => sendMenuAction('redo'),
        },
        { type: 'separator' },
        {
          label: '复制',
          accelerator: 'CmdOrCtrl+C',
          click: () => sendMenuAction('copy'),
        },
        {
          label: '粘贴',
          accelerator: 'CmdOrCtrl+V',
          click: () => sendMenuAction('paste'),
        },
        { type: 'separator' },
        {
          label: '全选标注',
          accelerator: 'CmdOrCtrl+A',
          click: () => sendMenuAction('select-all'),
        },
        {
          label: '删除选中',
          accelerator: 'Delete',
          click: () => sendMenuAction('delete-selected'),
        },
      ],
    },

    // 视图菜单
    {
      label: '视图',
      submenu: [
        {
          label: '缩放',
          submenu: [
            { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => sendMenuAction('zoom-in') },
            { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => sendMenuAction('zoom-out') },
            { label: '适合宽度', accelerator: 'CmdOrCtrl+0', click: () => sendMenuAction('zoom-fit-width') },
            { label: '适合页面', accelerator: 'CmdOrCtrl+1', click: () => sendMenuAction('zoom-fit-page') },
            { label: '实际大小', accelerator: 'CmdOrCtrl+2', click: () => sendMenuAction('zoom-100') },
          ],
        },
        { type: 'separator' },
        {
          label: '页面布局',
          submenu: [
            { label: '单页', type: 'radio', checked: true, click: () => sendMenuAction('layout-single') },
            { label: '连续滚动', type: 'radio', click: () => sendMenuAction('layout-continuous') },
            { label: '双页', type: 'radio', click: () => sendMenuAction('layout-spread') },
          ],
        },
        { type: 'separator' },
        {
          label: '缩略图面板',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => sendMenuAction('toggle-thumbnails'),
        },
        {
          label: '大纲面板',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuAction('toggle-outline'),
        },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => sendMenuAction('toggle-fullscreen'),
        },
        ...(process.env.NODE_ENV === 'development' ? [
          { type: 'separator' as const },
          { role: 'toggleDevTools' as const },
          { role: 'reload' as const },
        ] : []),
      ],
    },

    // 页面导航菜单
    {
      label: '页面',
      submenu: [
        { label: '上一页', accelerator: 'PageUp', click: () => sendMenuAction('page-prev') },
        { label: '下一页', accelerator: 'PageDown', click: () => sendMenuAction('page-next') },
        { label: '首页', accelerator: 'Home', click: () => sendMenuAction('page-first') },
        { label: '末页', accelerator: 'End', click: () => sendMenuAction('page-last') },
        { type: 'separator' },
        { label: '顺时针旋转', accelerator: 'CmdOrCtrl+R', click: () => sendMenuAction('rotate-cw') },
        { label: '逆时针旋转', accelerator: 'CmdOrCtrl+L', click: () => sendMenuAction('rotate-ccw') },
      ],
    },

    // 帮助菜单
    {
      label: '帮助',
      submenu: [
        {
          label: '文档中心',
          click: () => shell.openExternal('https://veritypdf.dev/docs'),
        },
        {
          label: '提交问题',
          click: () => shell.openExternal('https://github.com/your-org/VerityPDF/issues'),
        },
        { type: 'separator' },
        {
          label: '关于 VerityPDF',
          click: () => sendMenuAction('about'),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function sendMenuAction(action: string): void {
  const win = BrowserWindow.getFocusedWindow();
  win?.webContents.send('menu:action', action);
}
```

---

## 6. PDF.js 渲染引擎

### 6.1 概述

[PDF.js](https://mozilla.github.io/pdf.js/) 是 Mozilla 维护的开源 PDF 渲染库，使用纯 JavaScript 解析和渲染 PDF 文件。VerityPDF 基于 `pdfjs-dist` 进行集成，利用其 Web Worker 架构实现非阻塞渲染。

**核心能力**：
- PDF 文件解析（结构树、对象树）
- Canvas 2D 光栅化渲染
- 文本层提取与渲染
- CMap 支持（中日韩字体）
- XFA 表单渲染
- 内联 SVG 渲染（可选）
- 加密 PDF 解密

### 6.2 PDF 文档加载服务

```typescript
// src/services/pdf/PDFService.ts
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// 配置 Worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface PDFDocumentInfo {
  numPages: number;
  fingerprint: string;
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  creationDate: Date | null;
  modificationDate: Date | null;
  isEncrypted: boolean;
  fileSize: number;
}

export interface PDFLoadOptions {
  password?: string;
  onProgress?: (loaded: number, total: number) => void;
}

export class PDFService {
  private pdfDocument: PDFDocumentProxy | null = null;
  private sourcePath: string | null = null;
  private sourceData: ArrayBuffer | null = null;

  /**
   * 从文件路径加载 PDF (通过主进程读取后传入)
   */
  async loadFromBuffer(
    data: ArrayBuffer,
    filePath: string,
    options: PDFLoadOptions = {}
  ): Promise<PDFDocumentInfo> {
    this.sourcePath = filePath;
    this.sourceData = data;

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(data),
      cMapUrl: '/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/standard_fonts/',
      enableXfa: true,
      isEvalSupported: false,
      password: options.password,
    });

    // 进度回调
    if (options.onProgress) {
      loadingTask.onProgress = (progress) => {
        options.onProgress!(progress.loaded, progress.total);
      };
    }

    try {
      this.pdfDocument = await loadingTask.promise;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'PasswordException') {
        throw new PDFPasswordError('PDF 文件需要密码');
      }
      throw err;
    }

    return this.getDocumentInfo();
  }

  /**
   * 获取文档元信息
   */
  async getDocumentInfo(): Promise<PDFDocumentInfo> {
    if (!this.pdfDocument) throw new Error('PDF 文档未加载');

    const metadata = await this.pdfDocument.getMetadata();
    const info = metadata.info as Record<string, string>;

    return {
      numPages: this.pdfDocument.numPages,
      fingerprint: this.pdfDocument.fingerprints[0],
      title: info.Title || '',
      author: info.Author || '',
      subject: info.Subject || '',
      creator: info.Creator || '',
      producer: info.Producer || '',
      creationDate: info.CreationDate
        ? this.parsePDFDate(info.CreationDate) : null,
      modificationDate: info.ModDate
        ? this.parsePDFDate(info.ModDate) : null,
      isEncrypted: (metadata as any).isAcroForm || false,
      fileSize: this.sourceData?.byteLength || 0,
    };
  }

  /**
   * 获取指定页面代理
   */
  async getPage(pageNumber: number): Promise<PDFPageProxy> {
    if (!this.pdfDocument) throw new Error('PDF 文档未加载');
    return this.pdfDocument.getPage(pageNumber);
  }

  /**
   * 获取页面总数
   */
  getPageCount(): number {
    return this.pdfDocument?.numPages ?? 0;
  }

  /**
   * 获取源文件路径
   */
  getSourcePath(): string | null {
    return this.sourcePath;
  }

  /**
   * 销毁文档，释放资源
   */
  async destroy(): Promise<void> {
    if (this.pdfDocument) {
      await this.pdfDocument.destroy();
      this.pdfDocument = null;
    }
    this.sourceData = null;
    this.sourcePath = null;
  }

  /**
   * 解析 PDF 日期格式 D:YYYYMMDDHHmmSS
   */
  private parsePDFDate(dateStr: string): Date | null {
    try {
      const match = dateStr.match(
        /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/
      );
      if (!match) return null;
      return new Date(
        parseInt(match[1]),
        (parseInt(match[2] || '1') - 1),
        parseInt(match[3] || '1'),
        parseInt(match[4] || '0'),
        parseInt(match[5] || '0'),
        parseInt(match[6] || '0')
      );
    } catch {
      return null;
    }
  }
}

export class PDFPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PDFPasswordError';
  }
}
```

### 6.3 页面渲染器

```typescript
// src/services/pdf/PDFPageRenderer.ts
import type { PDFPageProxy, PageViewport, RenderParameters } from 'pdfjs-dist';

export interface RenderOptions {
  pageNumber: number;
  scale: number;
  rotation: number;
  canvas: HTMLCanvasElement;
  background?: string;
}

export interface RenderResult {
  viewport: PageViewport;
  renderTime: number; // ms
}

export class PDFPageRenderer {
  private activeRenderTasks = new Map<number, { cancel: () => void }>();

  /**
   * 渲染 PDF 页面到 Canvas
   */
  async render(
    page: PDFPageProxy,
    options: RenderOptions
  ): Promise<RenderResult> {
    const { scale, rotation, canvas, background } = options;
    const startTime = performance.now();

    // 取消同一页面之前的渲染任务
    this.cancelPendingRender(options.pageNumber);

    // 获取视口
    const viewport = page.getViewport({ scale, rotation });

    // 高 DPI 支持
    const pixelRatio = window.devicePixelRatio || 1;
    const outputScale = pixelRatio;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = canvas.getContext('2d', { alpha: false })!;

    // 背景填充
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 缩放上下文以匹配设备像素比
    if (outputScale !== 1) {
      ctx.scale(outputScale, outputScale);
    }

    const transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0] as [number, number, number, number, number, number]
      : undefined;

    const renderContext: RenderParameters = {
      canvasContext: ctx,
      viewport,
      transform,
      background: background || '#ffffff',
    };

    // 执行渲染
    const renderTask = page.render(renderContext);

    // 注册可取消的任务
    this.activeRenderTasks.set(options.pageNumber, {
      cancel: () => renderTask.cancel(),
    });

    try {
      await renderTask.promise;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'RenderingCancelledException') {
        // 被取消的渲染，静默处理
        return { viewport, renderTime: 0 };
      }
      throw err;
    } finally {
      this.activeRenderTasks.delete(options.pageNumber);
    }

    const renderTime = performance.now() - startTime;
    return { viewport, renderTime };
  }

  /**
   * 取消指定页面的待处理渲染
   */
  cancelPendingRender(pageNumber: number): void {
    const task = this.activeRenderTasks.get(pageNumber);
    if (task) {
      task.cancel();
      this.activeRenderTasks.delete(pageNumber);
    }
  }

  /**
   * 取消所有待处理渲染
   */
  cancelAllRenders(): void {
    this.activeRenderTasks.forEach(task => task.cancel());
    this.activeRenderTasks.clear();
  }

  /**
   * 获取页面原始尺寸 (scale=1)
   */
  async getPageSize(page: PDFPageProxy): Promise<{ width: number; height: number }> {
    const viewport = page.getViewport({ scale: 1.0 });
    return { width: viewport.width, height: viewport.height };
  }
}
```

### 6.4 文本层渲染

```typescript
// src/services/pdf/PDFTextLayer.ts
import { renderTextLayer } from 'pdfjs-dist';
import type { PDFPageProxy, PageViewport, TextContent } from 'pdfjs-dist';

export class PDFTextLayer {
  /**
   * 渲染文本层
   * 生成 HTML 元素覆盖在 Canvas 之上，支持文本选择和浏览器搜索
   */
  async render(
    page: PDFPageProxy,
    container: HTMLDivElement,
    viewport: PageViewport
  ): Promise<void> {
    // 清空容器
    container.innerHTML = '';
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;

    // 获取文本内容
    const textContent: TextContent = await page.getTextContent();

    // 渲染文本层
    await renderTextLayer({
      textContentSource: textContent,
      container,
      viewport,
      textDivs: [],
      textStyles: [],
    }).promise;

    // 确保文本层不拦截鼠标事件（由 Konva 处理）
    container.style.pointerEvents = 'none';
    container.style.userSelect = 'none';
  }

  /**
   * 启用文本选择模式
   */
  enableTextSelection(container: HTMLDivElement): void {
    container.style.pointerEvents = 'auto';
    container.style.userSelect = 'text';
  }

  /**
   * 禁用文本选择模式
   */
  disableTextSelection(container: HTMLDivElement): void {
    container.style.pointerEvents = 'none';
    container.style.userSelect = 'none';
    // 清除选择
    window.getSelection()?.removeAllRanges();
  }

  /**
   * 提取页面纯文本内容
   */
  async extractText(page: PDFPageProxy): Promise<string> {
    const textContent = await page.getTextContent();
    return textContent.items
      .filter((item): item is { str: string } => 'str' in item)
      .map(item => item.str)
      .join('');
  }
}
```

### 6.5 缩略图渲染器

```typescript
// src/services/pdf/PDFThumbnailRenderer.ts
import type { PDFPageProxy } from 'pdfjs-dist';

export interface ThumbnailOptions {
  maxWidth: number;
  maxHeight: number;
}

export class PDFThumbnailRenderer {
  /**
   * 生成页面缩略图 (返回 DataURL)
   */
  async renderThumbnail(
    page: PDFPageProxy,
    options: ThumbnailOptions = { maxWidth: 150, maxHeight: 200 }
  ): Promise<string> {
    const baseViewport = page.getViewport({ scale: 1.0 });

    // 计算缩略图缩放比
    const scaleX = options.maxWidth / baseViewport.width;
    const scaleY = options.maxHeight / baseViewport.height;
    const scale = Math.min(scaleX, scaleY);

    const viewport = page.getViewport({ scale });

    // 使用 OffscreenCanvas 或 document.createElement
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(
          Math.floor(viewport.width),
          Math.floor(viewport.height)
        )
      : document.createElement('canvas');

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d')!;

    await page.render({
      canvasContext: ctx as CanvasRenderingContext2D,
      viewport,
    }).promise;

    // 转为 DataURL
    if (canvas instanceof HTMLCanvasElement) {
      return canvas.toDataURL('image/png');
    }

    // OffscreenCanvas 需要转换为 Blob
    const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 批量生成缩略图 (带并发控制)
   */
  async renderAllThumbnails(
    getPage: (n: number) => Promise<PDFPageProxy>,
    totalPages: number,
    options?: ThumbnailOptions,
    onProgress?: (completed: number, total: number) => void,
    concurrency: number = 3
  ): Promise<string[]> {
    const thumbnails: string[] = new Array(totalPages);
    const queue: number[] = Array.from({ length: totalPages }, (_, i) => i + 1);
    let completed = 0;

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const pageNum = queue.shift()!;
        const page = await getPage(pageNum);
        thumbnails[pageNum - 1] = await this.renderThumbnail(page, options);
        page.cleanup();
        completed++;
        onProgress?.(completed, totalPages);
      }
    }

    // 启动并发 Worker
    const workers = Array.from(
      { length: Math.min(concurrency, totalPages) },
      () => worker.call(this)
    );
    await Promise.all(workers);

    return thumbnails;
  }
}
```

### 6.6 大纲/书签服务

```typescript
// src/services/pdf/PDFOutlineService.ts
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineItem[];
  pageNumber?: number; // 解析后的页码
  bold: boolean;
  italic: boolean;
}

export class PDFOutlineService {
  /**
   * 获取 PDF 大纲树
   */
  async getOutline(pdfDocument: PDFDocumentProxy): Promise<OutlineItem[]> {
    const outline = await pdfDocument.getOutline();
    if (!outline) return [];

    return this.resolveOutlineItems(outline, pdfDocument);
  }

  /**
   * 递归解析大纲项，将 dest 转换为页码
   */
  private async resolveOutlineItems(
    items: any[],
    pdfDocument: PDFDocumentProxy
  ): Promise<OutlineItem[]> {
    const resolved: OutlineItem[] = [];

    for (const item of items) {
      let pageNumber: number | undefined;

      if (item.dest) {
        try {
          pageNumber = await this.resolveDestination(item.dest, pdfDocument);
        } catch {
          pageNumber = undefined;
        }
      }

      resolved.push({
        title: item.title || '(无标题)',
        dest: item.dest,
        pageNumber,
        bold: item.bold || false,
        italic: item.italic || false,
        items: item.items
          ? await this.resolveOutlineItems(item.items, pdfDocument)
          : [],
      });
    }

    return resolved;
  }

  /**
   * 解析 dest 引用，获取目标页码
   */
  private async resolveDestination(
    dest: string | unknown[],
    pdfDocument: PDFDocumentProxy
  ): Promise<number> {
    let destArray: unknown[];

    if (typeof dest === 'string') {
      // 命名目标
      const destinations = await pdfDocument.getDestination(dest);
      destArray = destinations as unknown[];
    } else {
      destArray = dest;
    }

    if (!destArray || destArray.length === 0) {
      throw new Error('Invalid destination');
    }

    const pageRef = destArray[0];
    const pageIndex = await pdfDocument.getPageIndex(pageRef);
    return pageIndex + 1; // 1-based
  }

  /**
   * 扁平化大纲树 (用于搜索/列表展示)
   */
  flattenOutline(items: OutlineItem[], depth: number = 0): Array<OutlineItem & { depth: number }> {
    const result: Array<OutlineItem & { depth: number }> = [];

    for (const item of items) {
      result.push({ ...item, depth });
      if (item.items.length > 0) {
        result.push(...this.flattenOutline(item.items, depth + 1));
      }
    }

    return result;
  }
}
```

### 6.7 文本搜索服务

```typescript
// src/services/pdf/PDFSearchService.ts
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface SearchResult {
  pageNumber: number;
  snippet: string;
  matches: Array<{
    begin: { index: number };
    end: { index: number };
    transform: number[];
  }>;
  pageIndex: number;
}

export class PDFSearchService {
  private cachedText: Map<number, string> = new Map();
  private searchCancelled = false;

  /**
   * 全文搜索
   */
  async search(
    pdfDocument: PDFDocumentProxy,
    query: string,
    options: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      onProgress?: (searchedPages: number, totalPages: number) => void;
    } = {}
  ): Promise<SearchResult[]> {
    this.searchCancelled = false;
    const results: SearchResult[] = [];
    const totalPages = pdfDocument.numPages;

    if (!query.trim()) return results;

    // 构建正则
    const pattern = this.buildSearchPattern(query, options);

    for (let i = 1; i <= totalPages; i++) {
      if (this.searchCancelled) break;

      const text = await this.getPageText(pdfDocument, i);
      const matches = this.findMatches(text, pattern);

      if (matches.length > 0) {
        results.push({
          pageNumber: i,
          pageIndex: i - 1,
          snippet: this.extractSnippet(text, matches[0].index, query.length),
          matches,
        });
      }

      options.onProgress?.(i, totalPages);
    }

    return results;
  }

  /**
   * 取消搜索
   */
  cancel(): void {
    this.searchCancelled = true;
  }

  /**
   * 获取页面文本 (带缓存)
   */
  private async getPageText(
    pdfDocument: PDFDocumentProxy,
    pageNumber: number
  ): Promise<string> {
    if (this.cachedText.has(pageNumber)) {
      return this.cachedText.get(pageNumber)!;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .filter((item): item is { str: string } => 'str' in item)
      .map(item => item.str)
      .join(' ');

    page.cleanup();
    this.cachedText.set(pageNumber, text);
    return text;
  }

  private buildSearchPattern(
    query: string,
    options: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ): RegExp {
    let source: string;
    if (options.regex) {
      source = query;
    } else {
      source = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (options.wholeWord) {
      source = `\\b${source}\\b`;
    }
    const flags = options.caseSensitive ? 'g' : 'gi';
    return new RegExp(source, flags);
  }

  private findMatches(
    text: string,
    pattern: RegExp
  ): Array<{ begin: { index: number }; end: { index: number }; transform: number[] }> {
    const matches = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        begin: { index: match.index },
        end: { index: match.index + match[0].length },
        transform: [],
      });
    }

    return matches;
  }

  private extractSnippet(text: string, matchIndex: number, matchLength: number): string {
    const contextLength = 40;
    const start = Math.max(0, matchIndex - contextLength);
    const end = Math.min(text.length, matchIndex + matchLength + contextLength);
    let snippet = text.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet += '...';
    return snippet;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedText.clear();
  }
}
```

### 6.8 LRU 页面缓存管理器

```typescript
// src/services/pdf/PageCacheManager.ts

interface CacheEntry {
  canvas: HTMLCanvasElement;
  scale: number;
  rotation: number;
  timestamp: number;
  size: number; // 估算内存 (bytes)
}

export class PageCacheManager {
  private cache = new Map<number, CacheEntry>();
  private maxEntries: number;
  private maxMemory: number; // bytes
  private currentMemory: number = 0;

  constructor(maxEntries = 15, maxMemoryMB = 256) {
    this.maxEntries = maxEntries;
    this.maxMemory = maxMemoryMB * 1024 * 1024;
  }

  /**
   * 获取缓存的页面 Canvas
   */
  get(pageNumber: number, scale: number, rotation: number): HTMLCanvasElement | null {
    const entry = this.cache.get(pageNumber);

    if (!entry) return null;

    // 缩放或旋转变化，缓存失效
    if (entry.scale !== scale || entry.rotation !== rotation) {
      this.evict(pageNumber);
      return null;
    }

    // 更新访问时间 (LRU)
    entry.timestamp = Date.now();
    return entry.canvas;
  }

  /**
   * 存入缓存
   */
  set(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number,
    rotation: number
  ): void {
    // 如果已存在，先移除
    if (this.cache.has(pageNumber)) {
      this.evict(pageNumber);
    }

    const size = canvas.width * canvas.height * 4; // RGBA 4 bytes/pixel
    const entry: CacheEntry = {
      canvas,
      scale,
      rotation,
      timestamp: Date.now(),
      size,
    };

    // 确保不超过限制
    while (
      (this.cache.size >= this.maxEntries || this.currentMemory + size > this.maxMemory) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    this.cache.set(pageNumber, entry);
    this.currentMemory += size;
  }

  /**
   * 判断缓存是否有效
   */
  isValid(pageNumber: number, scale: number, rotation: number): boolean {
    const entry = this.cache.get(pageNumber);
    if (!entry) return false;
    return entry.scale === scale && entry.rotation === rotation;
  }

  /**
   * 移除指定页面缓存
   */
  evict(pageNumber: number): void {
    const entry = this.cache.get(pageNumber);
    if (entry) {
      this.currentMemory -= entry.size;
      this.cache.delete(pageNumber);
      // 释放 Canvas 资源
      const ctx = entry.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      }
    }
  }

  /**
   * 移除最久未使用的缓存
   */
  private evictLRU(): void {
    let oldestKey = -1;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey >= 0) {
      this.evict(oldestKey);
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    for (const key of this.cache.keys()) {
      this.evict(key);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): { entries: number; memoryMB: number } {
    return {
      entries: this.cache.size,
      memoryMB: parseFloat((this.currentMemory / (1024 * 1024)).toFixed(2)),
    };
  }
}
```

### 6.9 PDF.js 性能优化策略

| 优化项 | 实现方式 | 效果 |
|--------|---------|------|
| **Web Worker 渲染** | PDF 解析在独立 Worker 线程执行 | UI 线程不阻塞 |
| **按需渲染** | IntersectionObserver 仅渲染可视区域页面 | 减少 80%+ 首次渲染时间 |
| **LRU Canvas 缓存** | 缓存已渲染页面，缩放/旋转变化时失效 | 翻页即时显示 |
| **高 DPI 适配** | devicePixelRatio 缩放，避免模糊 | Retina 屏幕清晰渲染 |
| **渲染取消** | 快速翻页时取消不可见页面的渲染任务 | 避免资源浪费 |
| **缩略图并发控制** | 最多 3 个并发缩略图渲染 | 避免阻塞主渲染 |
| **OffscreenCanvas** | 缩略图使用 OffscreenCanvas | 不占用主线程 |
| **文本缓存** | 搜索时缓存页面文本，避免重复解析 | 搜索性能提升 |

### 6.10 虚拟滚动实现

```typescript
// src/hooks/useVirtualScroll.ts
import { useCallback, useRef, useState, useEffect } from 'react';

interface VirtualScrollConfig {
  itemCount: number;       // 总页数
  itemSizeGetter: (index: number) => number; // 获取每页高度
  overscan: number;        // 前后预渲染页数
  containerHeight: number; // 可视区域高度
}

interface VirtualScrollResult {
  visibleRange: { start: number; end: number };
  totalHeight: number;
  getOffsetTop: (index: number) => number;
  onScroll: (scrollTop: number) => void;
}

export function useVirtualScroll(config: VirtualScrollConfig): VirtualScrollResult {
  const { itemCount, itemSizeGetter, overscan, containerHeight } = config;
  const [scrollTop, setScrollTop] = useState(0);
  const offsetCache = useRef<number[]>([]);

  // 预计算每页的 offsetTop
  useEffect(() => {
    const offsets: number[] = [0];
    for (let i = 0; i < itemCount; i++) {
      offsets.push(offsets[i] + itemSizeGetter(i));
    }
    offsetCache.current = offsets;
  }, [itemCount, itemSizeGetter]);

  const totalHeight = offsetCache.current[itemCount] || 0;

  // 二分查找当前 scrollTop 对应的起始页
  const findStartIndex = useCallback((scrollPos: number): number => {
    const offsets = offsetCache.current;
    let lo = 0, hi = itemCount - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (offsets[mid] <= scrollPos) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return Math.max(0, lo - 1);
  }, [itemCount]);

  const startIndex = findStartIndex(scrollTop);

  // 计算结束索引
  let endIndex = startIndex;
  while (
    endIndex < itemCount - 1 &&
    (offsetCache.current[endIndex + 1] || 0) < scrollTop + containerHeight
  ) {
    endIndex++;
  }

  // 加入 overscan
  const visibleRange = {
    start: Math.max(0, startIndex - overscan),
    end: Math.min(itemCount - 1, endIndex + overscan),
  };

  const getOffsetTop = useCallback((index: number): number => {
    return offsetCache.current[index] || 0;
  }, []);

  return {
    visibleRange,
    totalHeight,
    getOffsetTop,
    onScroll: setScrollTop,
  };
}
```


---

## 7. Konva.js 标注引擎

### 7.1 概述

[Konva.js](https://konvajs.org/) 是一个高性能 2D Canvas 图形库，支持场景图 (Scene Graph)、事件冒泡、变换器和丰富的图形类型。VerityPDF 使用 Konva 实现所有标注图形的绘制、编辑、选择和交互。

**选择 Konva 的原因**：
- 内置事件系统（click、drag、transform、mouseenter 等）
- 内置 Transformer（拖拽调整大小、旋转）
- 图层管理（多 Layer 独立刷新）
- React 绑定 (`react-konva`) 声明式渲染
- 性能优秀（批量绘制 `batchDraw`、离屏缓存）
- 支持序列化/反序列化

### 7.2 标注层场景图结构

```
Konva.Stage (覆盖整个页面区域)
  │
  ├── Konva.Layer ("annotations")       ← 主标注层
  │     │
  │     ├── Konva.Group (page:1)         ← 第 1 页标注组 (visible: true/false)
  │     │     ├── Konva.Rect     #ann-001   矩形标注
  │     │     ├── Konva.Ellipse  #ann-002   椭圆标注
  │     │     ├── Konva.Arrow    #ann-003   箭头标注
  │     │     ├── Konva.Line     #ann-004   自由画笔
  │     │     ├── Konva.Text     #ann-005   文本标注
  │     │     ├── Konva.Image    #ann-006   签名/印章
  │     │     └── Konva.Group    #ann-007   便签批注组
  │     │           ├── Konva.Rect (背景)
  │     │           └── Konva.Text (内容)
  │     │
  │     ├── Konva.Group (page:2)         ← 第 2 页标注组
  │     │     └── ...
  │     │
  │     └── Konva.Transformer            ← 全局选中变换器 (单例)
  │
  ├── Konva.Layer ("drawing")            ← 临时绘制层 (绘制中的图形)
  │     └── (当前正在绘制的临时 Shape)
  │
  └── Konva.Layer ("guides")             ← 辅助线层 (对齐吸附参考线)
        ├── Konva.Line (水平对齐线)
        └── Konva.Line (垂直对齐线)
```

**多图层设计的优势**：
- `drawing` 层的临时图形频繁重绘，不影响已完成的标注
- `guides` 层仅在拖拽/绘制时显示，完成后隐藏
- 各层独立 `batchDraw`，减少不必要的重绘

### 7.3 标注类型定义

```typescript
// src/types/annotation.ts

/**
 * 标注类型枚举
 */
export enum AnnotationType {
  RECTANGLE     = 'rectangle',
  ELLIPSE       = 'ellipse',
  ARROW         = 'arrow',
  LINE          = 'line',
  FREEHAND      = 'freehand',
  TEXT          = 'text',
  HIGHLIGHT     = 'highlight',
  UNDERLINE     = 'underline',
  STRIKETHROUGH = 'strikethrough',
  STICKY_NOTE   = 'sticky_note',
  STAMP         = 'stamp',
  SIGNATURE     = 'signature',
  IMAGE         = 'image',
  CALLOUT       = 'callout',
  POLYGON       = 'polygon',
  MEASUREMENT   = 'measurement',
}

/**
 * 标注样式
 */
export interface AnnotationStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  dash?: number[];
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffset?: { x: number; y: number };
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
}

/**
 * 标注基础接口
 */
export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  pageNumber: number;
  // 位置和尺寸 (Konva 坐标系)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // 样式
  style: AnnotationStyle;
  // 元数据
  createdAt: number;
  updatedAt: number;
  author: string;
  content?: string;       // 批注文本内容
  locked: boolean;
  visible: boolean;
  tags: string[];
}

/** 矩形标注 */
export interface RectAnnotation extends BaseAnnotation {
  type: AnnotationType.RECTANGLE;
  cornerRadius: number;
}

/** 椭圆标注 */
export interface EllipseAnnotation extends BaseAnnotation {
  type: AnnotationType.ELLIPSE;
  radiusX: number;
  radiusY: number;
}

/** 箭头标注 */
export interface ArrowAnnotation extends BaseAnnotation {
  type: AnnotationType.ARROW;
  points: number[];       // [x1,y1, x2,y2]
  pointerLength: number;
  pointerWidth: number;
}

/** 直线标注 */
export interface LineAnnotation extends BaseAnnotation {
  type: AnnotationType.LINE;
  points: number[];       // [x1,y1, x2,y2]
}

/** 自由画笔 */
export interface FreehandAnnotation extends BaseAnnotation {
  type: AnnotationType.FREEHAND;
  points: number[];       // [x1,y1, x2,y2, ...]
  tension: number;
  closed: boolean;
}

/** 文本标注 */
export interface TextAnnotation extends BaseAnnotation {
  type: AnnotationType.TEXT;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;      // 'normal' | 'bold' | 'italic' | 'bold italic'
  textDecoration: string; // '' | 'underline' | 'line-through'
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  padding: number;
}

/** 高亮标注 */
export interface HighlightAnnotation extends BaseAnnotation {
  type: AnnotationType.HIGHLIGHT;
  quads: Array<{ x: number; y: number; width: number; height: number }>;
  // 高亮覆盖的文本区域列表（来自 PDF 文本层）
}

/** 便签批注 */
export interface StickyNoteAnnotation extends BaseAnnotation {
  type: AnnotationType.STICKY_NOTE;
  noteText: string;
  noteColor: string;      // '#FFFF00' 等
  isOpen: boolean;
}

/** 签名/印章 */
export interface StampAnnotation extends BaseAnnotation {
  type: AnnotationType.STAMP | AnnotationType.SIGNATURE;
  imageData: string;      // base64 DataURL
  imageType: 'png' | 'jpeg';
}

/** 多边形标注 */
export interface PolygonAnnotation extends BaseAnnotation {
  type: AnnotationType.POLYGON;
  points: number[];       // [x1,y1, x2,y2, ...]
  closed: boolean;
}

/** 标注联合类型 */
export type Annotation =
  | RectAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | LineAnnotation
  | FreehandAnnotation
  | TextAnnotation
  | HighlightAnnotation
  | StickyNoteAnnotation
  | StampAnnotation
  | PolygonAnnotation;

/**
 * 默认样式配置
 */
export const DEFAULT_ANNOTATION_STYLE: AnnotationStyle = {
  stroke: '#FF0000',
  strokeWidth: 2,
  fill: 'transparent',
  opacity: 1,
  lineCap: 'round',
  lineJoin: 'round',
};

/**
 * 各标注类型的默认值
 */
export const ANNOTATION_DEFAULTS: Record<string, Partial<BaseAnnotation>> = {
  [AnnotationType.RECTANGLE]: {
    style: { ...DEFAULT_ANNOTATION_STYLE, fill: 'rgba(255,0,0,0.1)' },
  },
  [AnnotationType.HIGHLIGHT]: {
    style: {
      ...DEFAULT_ANNOTATION_STYLE,
      stroke: 'transparent',
      fill: 'rgba(255,255,0,0.35)',
    },
  },
  [AnnotationType.TEXT]: {
    style: { ...DEFAULT_ANNOTATION_STYLE, stroke: '#000000' },
  },
  [AnnotationType.FREEHAND]: {
    style: { ...DEFAULT_ANNOTATION_STYLE, strokeWidth: 3 },
  },
  [AnnotationType.STICKY_NOTE]: {
    style: {
      ...DEFAULT_ANNOTATION_STYLE,
      stroke: '#FFC107',
      fill: '#FFF9C4',
    },
  },
};
```

### 7.4 标注管理器 (AnnotationManager)

```typescript
// src/services/annotation/AnnotationManager.ts
import Konva from 'konva';
import type { Annotation, AnnotationType, BaseAnnotation } from '../../types/annotation';
import { generateId } from '../../utils/idGenerator';

export class AnnotationManager {
  private stage: Konva.Stage;
  private annotationLayer: Konva.Layer;
  private drawingLayer: Konva.Layer;
  private guideLayer: Konva.Layer;
  private transformer: Konva.Transformer;
  private pageGroups: Map<number, Konva.Group> = new Map();
  private nodeMap: Map<string, Konva.Node> = new Map(); // annotation.id → Konva.Node

  constructor(container: HTMLDivElement) {
    // 创建 Stage
    this.stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
    });

    // 创建分层
    this.annotationLayer = new Konva.Layer({ name: 'annotations' });
    this.drawingLayer = new Konva.Layer({ name: 'drawing' });
    this.guideLayer = new Konva.Layer({ name: 'guides', listening: false });

    this.stage.add(this.annotationLayer);
    this.stage.add(this.drawingLayer);
    this.stage.add(this.guideLayer);

    // 全局 Transformer (单例)
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      keepRatio: false,
      enabledAnchors: [
        'top-left', 'top-right', 'bottom-left', 'bottom-right',
        'middle-left', 'middle-right', 'top-center', 'bottom-center',
      ],
      borderStroke: '#1890ff',
      borderStrokeWidth: 1,
      anchorStroke: '#1890ff',
      anchorFill: '#ffffff',
      anchorSize: 8,
      anchorCornerRadius: 2,
      boundBoxFunc: (oldBox, newBox) => {
        // 最小尺寸限制
        if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
          return oldBox;
        }
        return newBox;
      },
    });
    this.annotationLayer.add(this.transformer);

    // Stage 全局事件
    this.setupStageEvents();
  }

  /**
   * 添加标注到指定页面
   */
  addAnnotation(annotation: Annotation): Konva.Node {
    const node = this.createKonvaNode(annotation);
    const group = this.getPageGroup(annotation.pageNumber);

    group.add(node);
    this.nodeMap.set(annotation.id, node);
    this.annotationLayer.batchDraw();

    return node;
  }

  /**
   * 移除标注
   */
  removeAnnotation(annotationId: string): void {
    const node = this.nodeMap.get(annotationId);
    if (node) {
      // 如果当前选中，先取消选中
      if (this.transformer.nodes().includes(node)) {
        this.deselectAll();
      }
      node.destroy();
      this.nodeMap.delete(annotationId);
      this.annotationLayer.batchDraw();
    }
  }

  /**
   * 更新标注样式
   */
  updateAnnotationStyle(annotationId: string, style: Partial<Annotation['style']>): void {
    const node = this.nodeMap.get(annotationId);
    if (!node) return;

    if (style.stroke) node.stroke(style.stroke);
    if (style.strokeWidth !== undefined) node.strokeWidth(style.strokeWidth);
    if (style.fill) node.fill(style.fill);
    if (style.opacity !== undefined) node.opacity(style.opacity);
    if (style.dash) node.dash(style.dash);

    this.annotationLayer.batchDraw();
  }

  /**
   * 选中一个或多个标注
   */
  select(ids: string[]): void {
    const nodes = ids
      .map(id => this.nodeMap.get(id))
      .filter((n): n is Konva.Node => n !== undefined);

    this.transformer.nodes(nodes);
    this.annotationLayer.batchDraw();
  }

  /**
   * 取消所有选中
   */
  deselectAll(): void {
    this.transformer.nodes([]);
    this.annotationLayer.batchDraw();
  }

  /**
   * 获取当前选中的标注 ID
   */
  getSelectedIds(): string[] {
    return this.transformer.nodes().map(node => node.id());
  }

  /**
   * 切换页面可见性
   */
  showPage(pageNumber: number): void {
    this.pageGroups.forEach((group, page) => {
      group.visible(page === pageNumber);
    });
    this.annotationLayer.batchDraw();
  }

  /**
   * 显示多页标注 (连续滚动模式)
   */
  showPages(pageNumbers: number[]): void {
    const pageSet = new Set(pageNumbers);
    this.pageGroups.forEach((group, page) => {
      group.visible(pageSet.has(page));
    });
    this.annotationLayer.batchDraw();
  }

  /**
   * 调整 Stage 尺寸
   */
  resize(width: number, height: number): void {
    this.stage.size({ width, height });
    this.stage.batchDraw();
  }

  /**
   * 导出 Stage 为图片 (用于截图/导出)
   */
  exportToDataURL(pageNumber: number, pixelRatio: number = 2): string {
    const group = this.pageGroups.get(pageNumber);
    if (!group) return '';

    // 临时显示该页
    this.showPage(pageNumber);

    return this.stage.toDataURL({
      pixelRatio,
      mimeType: 'image/png',
    });
  }

  /**
   * 获取 Drawing Layer (供 DrawingController 使用)
   */
  getDrawingLayer(): Konva.Layer {
    return this.drawingLayer;
  }

  /**
   * 获取 Guide Layer
   */
  getGuideLayer(): Konva.Layer {
    return this.guideLayer;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.stage.destroy();
    this.pageGroups.clear();
    this.nodeMap.clear();
  }

  // ═══════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════

  private getPageGroup(pageNumber: number): Konva.Group {
    let group = this.pageGroups.get(pageNumber);
    if (!group) {
      group = new Konva.Group({
        name: `page-${pageNumber}`,
        visible: false,
      });
      this.annotationLayer.add(group);
      this.pageGroups.set(pageNumber, group);
    }
    return group;
  }

  /**
   * 根据标注数据创建对应的 Konva 节点
   */
  private createKonvaNode(annotation: Annotation): Konva.Node {
    const { id, x, y, width, height, rotation, style, locked } = annotation;

    const commonProps = {
      id,
      x,
      y,
      rotation,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      fill: style.fill,
      opacity: style.opacity,
      dash: style.dash,
      draggable: !locked,
      listening: true,
    };

    switch (annotation.type) {
      case 'rectangle':
        return new Konva.Rect({
          ...commonProps,
          width,
          height,
          cornerRadius: (annotation as any).cornerRadius || 0,
        });

      case 'ellipse':
        return new Konva.Ellipse({
          ...commonProps,
          radiusX: width / 2,
          radiusY: height / 2,
          offsetX: -width / 2,
          offsetY: -height / 2,
        });

      case 'arrow': {
        const arrowAnn = annotation as any;
        return new Konva.Arrow({
          ...commonProps,
          points: arrowAnn.points,
          pointerLength: arrowAnn.pointerLength,
          pointerWidth: arrowAnn.pointerWidth,
          fill: style.stroke,
        });
      }

      case 'freehand':
      case 'line': {
        const lineAnn = annotation as any;
        return new Konva.Line({
          ...commonProps,
          points: lineAnn.points,
          tension: lineAnn.tension || 0,
          closed: lineAnn.closed || false,
          lineCap: style.lineCap || 'round',
          lineJoin: style.lineJoin || 'round',
        });
      }

      case 'text': {
        const textAnn = annotation as any;
        return new Konva.Text({
          ...commonProps,
          text: textAnn.text,
          fontSize: textAnn.fontSize,
          fontFamily: textAnn.fontFamily,
          fontStyle: textAnn.fontStyle,
          textDecoration: textAnn.textDecoration,
          align: textAnn.align,
          lineHeight: textAnn.lineHeight || 1.2,
          width,
          padding: textAnn.padding || 5,
        });
      }

      case 'highlight': {
        const hlAnn = annotation as any;
        const group = new Konva.Group({ ...commonProps });
        // 为每个 quad 创建一个半透明矩形
        for (const quad of hlAnn.quads) {
          group.add(new Konva.Rect({
            x: quad.x - x,
            y: quad.y - y,
            width: quad.width,
            height: quad.height,
            fill: style.fill || 'rgba(255,255,0,0.35)',
            opacity: style.opacity,
            listening: false,
          }));
        }
        return group;
      }

      case 'sticky_note': {
        const noteAnn = annotation as any;
        const group = new Konva.Group({ ...commonProps });
        // 便签背景
        group.add(new Konva.Rect({
          width,
          height,
          fill: noteAnn.noteColor || '#FFF9C4',
          stroke: style.stroke,
          strokeWidth: 1,
          shadowColor: 'rgba(0,0,0,0.2)',
          shadowBlur: 5,
          shadowOffset: { x: 2, y: 2 },
          cornerRadius: 4,
        }));
        // 便签文本
        group.add(new Konva.Text({
          x: 8,
          y: 8,
          width: width - 16,
          text: noteAnn.noteText,
          fontSize: 12,
          fontFamily: 'sans-serif',
          fill: '#333',
        }));
        return group;
      }

      case 'stamp':
      case 'signature': {
        const stampAnn = annotation as any;
        // 异步加载图片，先返回占位 Rect
        const imageNode = new Konva.Rect({
          ...commonProps,
          width,
          height,
          fill: 'rgba(0,0,0,0.05)',
        });

        // 异步加载图片
        const img = new window.Image();
        img.onload = () => {
          const konvaImage = new Konva.Image({
            ...commonProps,
            image: img,
            width,
            height,
          });
          imageNode.replace(konvaImage);
          this.nodeMap.set(id, konvaImage);
          this.annotationLayer.batchDraw();
        };
        img.src = stampAnn.imageData;

        return imageNode;
      }

      default:
        return new Konva.Rect({ ...commonProps, width, height });
    }
  }

  private setupStageEvents(): void {
    // 点击空白区域取消选中
    this.stage.on('click tap', (e) => {
      if (e.target === this.stage) {
        this.deselectAll();
      }
    });
  }
}
```

### 7.5 绘制控制器 (DrawingController)

```typescript
// src/services/annotation/DrawingController.ts
import Konva from 'konva';
import type { AnnotationType, AnnotationStyle } from '../../types/annotation';

export enum DrawTool {
  NONE        = 'none',        // 选择模式
  RECTANGLE   = 'rectangle',
  ELLIPSE     = 'ellipse',
  ARROW       = 'arrow',
  LINE        = 'line',
  FREEHAND    = 'freehand',
  TEXT        = 'text',
  HIGHLIGHT   = 'highlight',
  STICKY_NOTE = 'sticky_note',
  STAMP       = 'stamp',
  ERASER      = 'eraser',
  PAN         = 'pan',         // 平移/抓手
}

interface DrawingState {
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  tempShape: Konva.Shape | null;
  currentPoints: number[];
}

type DrawCompleteCallback = (
  type: AnnotationType,
  bounds: { x: number; y: number; width: number; height: number },
  extraData?: Record<string, unknown>
) => void;

export class DrawingController {
  private state: DrawingState = {
    isDrawing: false,
    startPoint: null,
    tempShape: null,
    currentPoints: [],
  };

  private currentTool: DrawTool = DrawTool.NONE;
  private style: AnnotationStyle;
  private onComplete: DrawCompleteCallback | null = null;

  constructor(
    private stage: Konva.Stage,
    private drawingLayer: Konva.Layer
  ) {
    this.style = {
      stroke: '#FF0000',
      strokeWidth: 2,
      fill: 'transparent',
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    };

    this.bindEvents();
  }

  /**
   * 切换绘制工具
   */
  setTool(tool: DrawTool): void {
    this.currentTool = tool;
    this.cancelDrawing();

    // 更新光标
    const cursors: Record<DrawTool, string> = {
      [DrawTool.NONE]: 'default',
      [DrawTool.PAN]: 'grab',
      [DrawTool.TEXT]: 'text',
      [DrawTool.ERASER]: 'pointer',
      [DrawTool.STAMP]: 'copy',
      [DrawTool.STICKY_NOTE]: 'copy',
    };
    this.stage.container().style.cursor =
      cursors[tool] || 'crosshair';
  }

  getTool(): DrawTool {
    return this.currentTool;
  }

  /**
   * 设置绘制样式
   */
  setStyle(style: Partial<AnnotationStyle>): void {
    Object.assign(this.style, style);
  }

  /**
   * 注册绘制完成回调
   */
  onDrawComplete(callback: DrawCompleteCallback): void {
    this.onComplete = callback;
  }

  /**
   * 取消当前绘制
   */
  cancelDrawing(): void {
    if (this.state.tempShape) {
      this.state.tempShape.destroy();
      this.drawingLayer.batchDraw();
    }
    this.state = {
      isDrawing: false,
      startPoint: null,
      tempShape: null,
      currentPoints: [],
    };
  }

  // ═══════════════════════════════════════════
  // 事件处理
  // ═══════════════════════════════════════════

  private bindEvents(): void {
    this.stage.on('mousedown touchstart', (e) => this.handlePointerDown(e));
    this.stage.on('mousemove touchmove', (e) => this.handlePointerMove(e));
    this.stage.on('mouseup touchend', () => this.handlePointerUp());

    // 键盘取消
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.cancelDrawing();
      }
    });
  }

  private handlePointerDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    if (this.currentTool === DrawTool.NONE) return;
    if (e.target !== this.stage && this.currentTool !== DrawTool.ERASER) return;

    const pos = this.stage.getPointerPosition();
    if (!pos) return;

    this.state.isDrawing = true;
    this.state.startPoint = pos;
    this.state.currentPoints = [pos.x, pos.y];

    switch (this.currentTool) {
      case DrawTool.RECTANGLE:
        this.state.tempShape = new Konva.Rect({
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          ...this.getKonvaStyle(),
          fill: this.style.fill === 'transparent'
            ? 'rgba(255,0,0,0.1)' : this.style.fill,
        });
        break;

      case DrawTool.ELLIPSE:
        this.state.tempShape = new Konva.Ellipse({
          x: pos.x,
          y: pos.y,
          radiusX: 0,
          radiusY: 0,
          ...this.getKonvaStyle(),
        });
        break;

      case DrawTool.ARROW:
        this.state.tempShape = new Konva.Arrow({
          points: [pos.x, pos.y, pos.x, pos.y],
          ...this.getKonvaStyle(),
          fill: this.style.stroke,
          pointerLength: 12,
          pointerWidth: 12,
        });
        break;

      case DrawTool.LINE:
        this.state.tempShape = new Konva.Line({
          points: [pos.x, pos.y, pos.x, pos.y],
          ...this.getKonvaStyle(),
        });
        break;

      case DrawTool.FREEHAND:
        this.state.tempShape = new Konva.Line({
          points: [pos.x, pos.y],
          ...this.getKonvaStyle(),
          tension: 0.5,
          lineCap: 'round',
          lineJoin: 'round',
        });
        break;

      case DrawTool.HIGHLIGHT:
        this.state.tempShape = new Konva.Rect({
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          fill: 'rgba(255,255,0,0.35)',
          stroke: 'transparent',
          strokeWidth: 0,
          globalCompositeOperation: 'multiply',
        });
        break;
    }

    if (this.state.tempShape) {
      this.drawingLayer.add(this.state.tempShape);
    }
  }

  private handlePointerMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    if (!this.state.isDrawing || !this.state.startPoint) return;

    const pos = this.stage.getPointerPosition();
    if (!pos) return;

    const shape = this.state.tempShape;
    if (!shape) return;

    const { startPoint } = this.state;

    switch (this.currentTool) {
      case DrawTool.RECTANGLE:
      case DrawTool.HIGHLIGHT: {
        const rect = shape as Konva.Rect;
        const x = Math.min(startPoint.x, pos.x);
        const y = Math.min(startPoint.y, pos.y);
        const w = Math.abs(pos.x - startPoint.x);
        const h = Math.abs(pos.y - startPoint.y);

        // Shift 键约束正方形
        if (e.evt.shiftKey) {
          const size = Math.max(w, h);
          rect.width(size);
          rect.height(size);
        } else {
          rect.width(w);
          rect.height(h);
        }
        rect.x(x);
        rect.y(y);
        break;
      }

      case DrawTool.ELLIPSE: {
        const ellipse = shape as Konva.Ellipse;
        const cx = (startPoint.x + pos.x) / 2;
        const cy = (startPoint.y + pos.y) / 2;
        const rx = Math.abs(pos.x - startPoint.x) / 2;
        const ry = Math.abs(pos.y - startPoint.y) / 2;
        ellipse.position({ x: cx, y: cy });
        ellipse.radiusX(rx);
        ellipse.radiusY(ry);
        break;
      }

      case DrawTool.ARROW:
      case DrawTool.LINE: {
        const line = shape as Konva.Line;
        line.points([startPoint.x, startPoint.y, pos.x, pos.y]);
        break;
      }

      case DrawTool.FREEHAND: {
        const line = shape as Konva.Line;
        this.state.currentPoints.push(pos.x, pos.y);
        line.points([...this.state.currentPoints]);
        break;
      }
    }

    this.drawingLayer.batchDraw();
  }

  private handlePointerUp(): void {
    if (!this.state.isDrawing) return;

    const shape = this.state.tempShape;
    if (!shape || !this.state.startPoint || !this.onComplete) {
      this.cancelDrawing();
      return;
    }

    // 计算绘制边界
    const bounds = this.calculateBounds(shape);

    // 忽略过小的图形 (可能是误触)
    if (bounds.width < 3 && bounds.height < 3) {
      this.cancelDrawing();
      return;
    }

    // 构建额外数据
    const extraData: Record<string, unknown> = {};
    if (this.currentTool === DrawTool.ARROW || this.currentTool === DrawTool.LINE) {
      extraData.points = (shape as Konva.Line).points();
    }
    if (this.currentTool === DrawTool.FREEHAND) {
      extraData.points = this.state.currentPoints;
      extraData.tension = 0.5;
    }

    // 清除临时图形
    shape.destroy();
    this.drawingLayer.batchDraw();

    // 通知完成
    this.onComplete(this.currentTool as unknown as AnnotationType, bounds, extraData);

    // 重置状态
    this.state.isDrawing = false;
    this.state.tempShape = null;
    this.state.currentPoints = [];
  }

  private calculateBounds(shape: Konva.Shape) {
    if (shape instanceof Konva.Rect) {
      return {
        x: shape.x(),
        y: shape.y(),
        width: shape.width(),
        height: shape.height(),
      };
    }
    if (shape instanceof Konva.Ellipse) {
      return {
        x: shape.x() - shape.radiusX(),
        y: shape.y() - shape.radiusY(),
        width: shape.radiusX() * 2,
        height: shape.radiusY() * 2,
      };
    }
    if (shape instanceof Konva.Arrow || shape instanceof Konva.Line) {
      const points = (shape as Konva.Line).points();
      const xs = points.filter((_, i) => i % 2 === 0);
      const ys = points.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX,
        y: minY,
        width: Math.max(...xs) - minX,
        height: Math.max(...ys) - minY,
      };
    }
    return { x: shape.x(), y: shape.y(), width: shape.width(), height: shape.height() };
  }

  private getKonvaStyle() {
    return {
      stroke: this.style.stroke,
      strokeWidth: this.style.strokeWidth,
      fill: this.style.fill,
      opacity: this.style.opacity,
      dash: this.style.dash,
      lineCap: this.style.lineCap || 'round',
      lineJoin: this.style.lineJoin || 'round',
    };
  }
}
```

### 7.6 撤销/重做系统 (HistoryManager)

```typescript
// src/services/annotation/HistoryManager.ts
import type { Annotation } from '../../types/annotation';

interface HistoryEntry {
  action: 'add' | 'remove' | 'update' | 'batch';
  annotations: Annotation[];          // 受影响的标注 (操作后状态)
  previousAnnotations?: Annotation[]; // 操作前状态 (update/remove 时需要)
  timestamp: number;
}

export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxStackSize: number;

  constructor(maxStackSize = 200) {
    this.maxStackSize = maxStackSize;
  }

  /**
   * 记录操作
   */
  push(entry: Omit<HistoryEntry, 'timestamp'>): void {
    this.undoStack.push({
      ...entry,
      timestamp: Date.now(),
    });

    // 新操作清空 redo 栈
    this.redoStack = [];

    // 限制栈大小
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
  }

  /**
   * 撤销
   */
  undo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    this.redoStack.push(entry);
    return entry;
  }

  /**
   * 重做
   */
  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    this.undoStack.push(entry);
    return entry;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoCount(): number {
    return this.undoStack.length;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
```

### 7.7 对齐吸附 (SnapHelper)

```typescript
// src/services/annotation/SnapHelper.ts
import Konva from 'konva';

interface SnapLine {
  orientation: 'horizontal' | 'vertical';
  position: number;
  diff: number;
}

export class SnapHelper {
  private threshold: number;

  constructor(threshold = 5) {
    this.threshold = threshold;
  }

  /**
   * 计算拖拽吸附
   * @param movingNode 正在拖拽的节点
   * @param allNodes 同一页面所有其他节点
   * @returns 吸附后的偏移修正和参考线
   */
  calculateSnap(
    movingNode: Konva.Node,
    allNodes: Konva.Node[]
  ): { offsetX: number; offsetY: number; guides: SnapLine[] } {
    const guides: SnapLine[] = [];
    let offsetX = 0;
    let offsetY = 0;

    const movingBox = {
      left: movingNode.x(),
      right: movingNode.x() + movingNode.width(),
      top: movingNode.y(),
      bottom: movingNode.y() + movingNode.height(),
      centerX: movingNode.x() + movingNode.width() / 2,
      centerY: movingNode.y() + movingNode.height() / 2,
    };

    let minDiffX = Infinity;
    let minDiffY = Infinity;

    for (const node of allNodes) {
      if (node === movingNode) continue;

      const targetBox = {
        left: node.x(),
        right: node.x() + node.width(),
        top: node.y(),
        bottom: node.y() + node.height(),
        centerX: node.x() + node.width() / 2,
        centerY: node.y() + node.height() / 2,
      };

      // 垂直对齐线检查 (左对齐、居中、右对齐)
      const verticalChecks = [
        { moving: movingBox.left, target: targetBox.left },
        { moving: movingBox.right, target: targetBox.right },
        { moving: movingBox.centerX, target: targetBox.centerX },
        { moving: movingBox.left, target: targetBox.right },
        { moving: movingBox.right, target: targetBox.left },
      ];

      for (const check of verticalChecks) {
        const diff = Math.abs(check.moving - check.target);
        if (diff < this.threshold && diff < minDiffX) {
          minDiffX = diff;
          offsetX = check.target - check.moving;
          guides.length = 0; // 清除旧线
          guides.push({
            orientation: 'vertical',
            position: check.target,
            diff,
          });
        }
      }

      // 水平对齐线检查
      const horizontalChecks = [
        { moving: movingBox.top, target: targetBox.top },
        { moving: movingBox.bottom, target: targetBox.bottom },
        { moving: movingBox.centerY, target: targetBox.centerY },
        { moving: movingBox.top, target: targetBox.bottom },
        { moving: movingBox.bottom, target: targetBox.top },
      ];

      for (const check of horizontalChecks) {
        const diff = Math.abs(check.moving - check.target);
        if (diff < this.threshold && diff < minDiffY) {
          minDiffY = diff;
          offsetY = check.target - check.moving;
          guides.push({
            orientation: 'horizontal',
            position: check.target,
            diff,
          });
        }
      }
    }

    return { offsetX, offsetY, guides };
  }

  /**
   * 渲染吸附参考线
   */
  renderGuides(guideLayer: Konva.Layer, guides: SnapLine[], stageSize: { width: number; height: number }): void {
    guideLayer.destroyChildren();

    for (const guide of guides) {
      if (guide.orientation === 'vertical') {
        guideLayer.add(new Konva.Line({
          points: [guide.position, 0, guide.position, stageSize.height],
          stroke: '#ff6b6b',
          strokeWidth: 1,
          dash: [4, 4],
        }));
      } else {
        guideLayer.add(new Konva.Line({
          points: [0, guide.position, stageSize.width, guide.position],
          stroke: '#ff6b6b',
          strokeWidth: 1,
          dash: [4, 4],
        }));
      }
    }

    guideLayer.batchDraw();
  }

  /**
   * 清除参考线
   */
  clearGuides(guideLayer: Konva.Layer): void {
    guideLayer.destroyChildren();
    guideLayer.batchDraw();
  }
}
```

---

## 8. 坐标系统与多图层同步

### 8.1 坐标系差异

| 坐标系 | 原点 | Y轴方向 | 单位 | 使用场景 |
|--------|------|---------|------|---------|
| **PDF 文档** | 左下角 | 向上 ↑ | points (1pt = 1/72 inch) | pdf-lib 操作 |
| **PDF.js Viewport** | 左上角 | 向下 ↓ | CSS pixels | Canvas 渲染 |
| **Konva Stage** | 左上角 | 向下 ↓ | CSS pixels | 标注交互 |
| **屏幕坐标** | 左上角 | 向下 ↓ | CSS pixels | 鼠标事件 |

### 8.2 坐标转换工具

```typescript
// src/utils/coordinateConverter.ts

/**
 * PDF 坐标 (左下角原点) ↔ Konva/屏幕坐标 (左上角原点)
 */
export class CoordinateConverter {
  /**
   * PDF 坐标 → Konva 坐标
   */
  static pdfToKonva(
    pdfX: number,
    pdfY: number,
    pageHeight: number,  // PDF 页面原始高度 (points)
    scale: number
  ): { x: number; y: number } {
    return {
      x: pdfX * scale,
      y: (pageHeight - pdfY) * scale,
    };
  }

  /**
   * Konva 坐标 → PDF 坐标
   */
  static konvaToPdf(
    konvaX: number,
    konvaY: number,
    pageHeight: number,
    scale: number
  ): { x: number; y: number } {
    return {
      x: konvaX / scale,
      y: pageHeight - (konvaY / scale),
    };
  }

  /**
   * PDF 矩形 → Konva 矩形
   * PDF 矩形用 (x, y, w, h) 其中 y 是底边
   */
  static pdfRectToKonva(
    pdfX: number,
    pdfY: number,
    pdfW: number,
    pdfH: number,
    pageHeight: number,
    scale: number
  ): { x: number; y: number; width: number; height: number } {
    return {
      x: pdfX * scale,
      y: (pageHeight - pdfY - pdfH) * scale,
      width: pdfW * scale,
      height: pdfH * scale,
    };
  }

  /**
   * Konva 矩形 → PDF 矩形
   */
  static konvaRectToPdf(
    konvaX: number,
    konvaY: number,
    konvaW: number,
    konvaH: number,
    pageHeight: number,
    scale: number
  ): { x: number; y: number; width: number; height: number } {
    return {
      x: konvaX / scale,
      y: pageHeight - (konvaY / scale) - (konvaH / scale),
      width: konvaW / scale,
      height: konvaH / scale,
    };
  }

  /**
   * 屏幕坐标 → Konva 坐标 (考虑容器滚动偏移)
   */
  static screenToKonva(
    screenX: number,
    screenY: number,
    container: HTMLElement,
    stage: { x(): number; y(): number; scale(): { x: number; y: number } }
  ): { x: number; y: number } {
    const rect = container.getBoundingClientRect();
    const stageScale = stage.scale();
    return {
      x: (screenX - rect.left - stage.x()) / stageScale.x,
      y: (screenY - rect.top - stage.y()) / stageScale.y,
    };
  }
}
```

### 8.3 缩放同步

当用户缩放 PDF 页面时，Konva Stage 需要同步调整：

```typescript
/**
 * 同步 Konva Stage 与 PDF 缩放
 */
function syncKonvaScale(
  stage: Konva.Stage,
  pdfScale: number,
  pageWidth: number,   // PDF 页面原始宽度
  pageHeight: number   // PDF 页面原始高度
): void {
  stage.scale({ x: pdfScale, y: pdfScale });
  stage.width(pageWidth * pdfScale);
  stage.height(pageHeight * pdfScale);
  stage.batchDraw();
}

/**
 * 监听缩放变化，同步更新
 */
function useScaleSync(pdfScale: number, pageDimensions: { width: number; height: number }) {
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    if (!stageRef.current) return;
    syncKonvaScale(
      stageRef.current,
      pdfScale,
      pageDimensions.width,
      pageDimensions.height
    );
  }, [pdfScale, pageDimensions]);
}
```

---

## 9. 状态管理 (Zustand)

### 9.1 Store 拆分策略

为避免单一巨大 Store，按领域拆分为 4 个独立 Store：

```
┌──────────────────┐  ┌──────────────────┐
│   pdfStore       │  │ annotationStore  │
│                  │  │                  │
│ documentPath     │  │ annotations[]    │
│ currentPage      │  │ selectedIds[]    │
│ totalPages       │  │ history          │
│ scale            │  │ clipboard        │
│ rotation         │  │                  │
│ layoutMode       │  │                  │
│ searchText       │  │                  │
│ searchResults    │  │                  │
└──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐
│   toolStore      │  │   uiStore        │
│                  │  │                  │
│ activeTool       │  │ sidebarOpen      │
│ style            │  │ sidebarTab       │
│ recentColors[]   │  │ propertiesOpen   │
│ fontSize         │  │ theme            │
│ fontFamily       │  │ fullscreen       │
│                  │  │ loading          │
│                  │  │ dialogs{}        │
└──────────────────┘  └──────────────────┘
```

### 9.2 pdfStore 实现

```typescript
// src/stores/pdfStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type LayoutMode = 'single' | 'continuous' | 'spread';

interface PDFState {
  // 文档信息
  documentPath: string | null;
  documentInfo: PDFDocumentInfo | null;
  currentPage: number;
  totalPages: number;

  // 视图
  scale: number;
  rotation: number; // 0 | 90 | 180 | 270
  layoutMode: LayoutMode;

  // 搜索
  searchText: string;
  searchResults: SearchResult[];
  currentSearchIndex: number;

  // 加载状态
  isLoading: boolean;
  loadingProgress: number;
  error: string | null;

  // Actions
  setDocument: (path: string, info: PDFDocumentInfo) => void;
  closeDocument: () => void;
  setCurrentPage: (page: number) => void;
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFitWidth: (containerWidth: number, pageWidth: number) => void;
  zoomFitPage: (containerHeight: number, pageHeight: number) => void;
  zoom100: () => void;
  setRotation: (rotation: number) => void;
  rotateCW: () => void;
  rotateCCW: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setSearchText: (text: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean, progress?: number) => void;
  setError: (error: string | null) => void;
}

const SCALE_MIN = 0.1;
const SCALE_MAX = 10.0;
const SCALE_STEP = 0.25;

export const usePdfStore = create<PDFState>()(
  devtools(
    (set, get) => ({
      documentPath: null,
      documentInfo: null,
      currentPage: 1,
      totalPages: 0,
      scale: 1.0,
      rotation: 0,
      layoutMode: 'continuous',
      searchText: '',
      searchResults: [],
      currentSearchIndex: -1,
      isLoading: false,
      loadingProgress: 0,
      error: null,

      setDocument: (path, info) => set({
        documentPath: path,
        documentInfo: info,
        totalPages: info.numPages,
        currentPage: 1,
        error: null,
      }),

      closeDocument: () => set({
        documentPath: null,
        documentInfo: null,
        currentPage: 1,
        totalPages: 0,
        searchResults: [],
        searchText: '',
      }),

      setCurrentPage: (page) => {
        const { totalPages } = get();
        set({ currentPage: Math.max(1, Math.min(page, totalPages)) });
      },

      setScale: (scale) => set({
        scale: Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale)),
      }),

      zoomIn: () => {
        const { scale } = get();
        set({ scale: Math.min(SCALE_MAX, scale + SCALE_STEP) });
      },

      zoomOut: () => {
        const { scale } = get();
        set({ scale: Math.max(SCALE_MIN, scale - SCALE_STEP) });
      },

      zoomFitWidth: (containerWidth, pageWidth) => {
        const padding = 40; // 页面间距
        set({ scale: (containerWidth - padding) / pageWidth });
      },

      zoomFitPage: (containerHeight, pageHeight) => {
        const padding = 40;
        set({ scale: (containerHeight - padding) / pageHeight });
      },

      zoom100: () => set({ scale: 1.0 }),

      setRotation: (rotation) => set({
        rotation: ((rotation % 360) + 360) % 360,
      }),

      rotateCW: () => {
        const { rotation } = get();
        set({ rotation: (rotation + 90) % 360 });
      },

      rotateCCW: () => {
        const { rotation } = get();
        set({ rotation: (rotation - 90 + 360) % 360 });
      },

      setLayoutMode: (mode) => set({ layoutMode: mode }),

      setSearchText: (text) => set({ searchText: text }),

      setSearchResults: (results) => set({
        searchResults: results,
        currentSearchIndex: results.length > 0 ? 0 : -1,
      }),

      setLoading: (loading, progress = 0) => set({
        isLoading: loading,
        loadingProgress: progress,
      }),

      setError: (error) => set({ error, isLoading: false }),
    }),
    { name: 'pdfStore' }
  )
);
```

### 9.3 annotationStore 实现

```typescript
// src/stores/annotationStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Annotation } from '../types/annotation';

interface AnnotationState {
  annotations: Annotation[];
  selectedIds: string[];
  clipboard: Annotation[];
  isModified: boolean;

  // CRUD
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  removeAnnotations: (ids: string[]) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  updateAnnotationStyle: (id: string, style: Partial<Annotation['style']>) => void;
  updateAnnotationPosition: (id: string, position: { x: number; y: number; width?: number; height?: number; rotation?: number }) => void;

  // 选择
  selectAnnotation: (id: string) => void;
  selectAnnotations: (ids: string[]) => void;
  deselectAll: () => void;
  toggleSelect: (id: string) => void;

  // 剪贴板
  copySelected: () => void;
  paste: (offsetX?: number, offsetY?: number) => Annotation[];
  cutSelected: () => void;
  duplicateSelected: () => void;

  // 批量操作
  getAnnotationsByPage: (pageNumber: number) => Annotation[];
  clearAll: () => void;
  loadAnnotations: (annotations: Annotation[]) => void;

  // 持久化标记
  markSaved: () => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  devtools(
    (set, get) => ({
      annotations: [],
      selectedIds: [],
      clipboard: [],
      isModified: false,

      addAnnotation: (annotation) => set((state) => ({
        annotations: [...state.annotations, annotation],
        isModified: true,
      })),

      removeAnnotation: (id) => set((state) => ({
        annotations: state.annotations.filter(a => a.id !== id),
        selectedIds: state.selectedIds.filter(sid => sid !== id),
        isModified: true,
      })),

      removeAnnotations: (ids) => {
        const idSet = new Set(ids);
        set((state) => ({
          annotations: state.annotations.filter(a => !idSet.has(a.id)),
          selectedIds: state.selectedIds.filter(sid => !idSet.has(sid)),
          isModified: true,
        }));
      },

      updateAnnotation: (id, updates) => set((state) => ({
        annotations: state.annotations.map(a =>
          a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
        ),
        isModified: true,
      })),

      updateAnnotationStyle: (id, style) => set((state) => ({
        annotations: state.annotations.map(a =>
          a.id === id
            ? { ...a, style: { ...a.style, ...style }, updatedAt: Date.now() }
            : a
        ),
        isModified: true,
      })),

      updateAnnotationPosition: (id, position) => set((state) => ({
        annotations: state.annotations.map(a =>
          a.id === id ? { ...a, ...position, updatedAt: Date.now() } : a
        ),
        isModified: true,
      })),

      selectAnnotation: (id) => set({ selectedIds: [id] }),

      selectAnnotations: (ids) => set({ selectedIds: ids }),

      deselectAll: () => set({ selectedIds: [] }),

      toggleSelect: (id) => set((state) => ({
        selectedIds: state.selectedIds.includes(id)
          ? state.selectedIds.filter(sid => sid !== id)
          : [...state.selectedIds, id],
      })),

      copySelected: () => set((state) => ({
        clipboard: state.annotations.filter(a => state.selectedIds.includes(a.id)),
      })),

      paste: (offsetX = 10, offsetY = 10) => {
        const { clipboard } = get();
        const newAnnotations = clipboard.map(a => ({
          ...a,
          id: crypto.randomUUID(),
          x: a.x + offsetX,
          y: a.y + offsetY,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));

        set((state) => ({
          annotations: [...state.annotations, ...newAnnotations],
          selectedIds: newAnnotations.map(a => a.id),
          isModified: true,
        }));

        return newAnnotations;
      },

      cutSelected: () => {
        get().copySelected();
        get().removeAnnotations(get().selectedIds);
      },

      duplicateSelected: () => {
        get().copySelected();
        get().paste(20, 20);
      },

      getAnnotationsByPage: (pageNumber) => {
        return get().annotations.filter(a => a.pageNumber === pageNumber);
      },

      clearAll: () => set({
        annotations: [],
        selectedIds: [],
        isModified: true,
      }),

      loadAnnotations: (annotations) => set({
        annotations,
        selectedIds: [],
        isModified: false,
      }),

      markSaved: () => set({ isModified: false }),
    }),
    { name: 'annotationStore' }
  )
);
```

### 9.4 toolStore 实现

```typescript
// src/stores/toolStore.ts
import { create } from 'zustand';
import type { AnnotationStyle } from '../types/annotation';
import { DrawTool } from '../services/annotation/DrawingController';

interface ToolState {
  activeTool: DrawTool;
  style: AnnotationStyle;
  fontSize: number;
  fontFamily: string;
  recentColors: string[];
  maxRecentColors: number;

  setTool: (tool: DrawTool) => void;
  setStyle: (style: Partial<AnnotationStyle>) => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setOpacity: (opacity: number) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  addRecentColor: (color: string) => void;
}

export const useToolStore = create<ToolState>()(
  (set, get) => ({
    activeTool: DrawTool.NONE,
    style: {
      stroke: '#FF0000',
      strokeWidth: 2,
      fill: 'transparent',
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    },
    fontSize: 16,
    fontFamily: 'Arial',
    recentColors: ['#FF0000', '#000000', '#0066CC', '#00AA00', '#FF6600'],
    maxRecentColors: 12,

    setTool: (tool) => set({ activeTool: tool }),

    setStyle: (style) => set((state) => ({
      style: { ...state.style, ...style },
    })),

    setStrokeColor: (color) => {
      set((state) => ({ style: { ...state.style, stroke: color } }));
      get().addRecentColor(color);
    },

    setFillColor: (color) => set((state) => ({
      style: { ...state.style, fill: color },
    })),

    setStrokeWidth: (width) => set((state) => ({
      style: { ...state.style, strokeWidth: width },
    })),

    setOpacity: (opacity) => set((state) => ({
      style: { ...state.style, opacity },
    })),

    setFontSize: (size) => set({ fontSize: size }),
    setFontFamily: (family) => set({ fontFamily: family }),

    addRecentColor: (color) => set((state) => {
      const filtered = state.recentColors.filter(c => c !== color);
      return {
        recentColors: [color, ...filtered].slice(0, state.maxRecentColors),
      };
    }),
  })
);
```


---

## 10. UI 组件体系

### 10.1 整体布局

```
┌────────────────────────────────────────────────────────────────────────┐
│ TitleBar (macOS: hiddenInset | Win/Linux: 自定义标题栏)                │
├───────┬───────────────────────────────────────────────┬────────────────┤
│       │ Toolbar (工具栏)                              │                │
│       │ ┌─────────────────────────────────────────────┐│                │
│       │ │ [选择][矩形][椭圆][箭头][画笔][文本][高亮]   ││                │
│       │ │ [印章][签名] | 颜色 | 线宽 | 透明度          ││                │
│       │ │ | [撤销][重做] | 页码: [1/100] | 缩放: [100%]││                │
│       │ └─────────────────────────────────────────────┘│                │
│ Side  ├───────────────────────────────────────────────┤ Properties     │
│ bar   │                                               │ Panel          │
│       │ PDF Viewer (核心视图区)                        │                │
│ [缩略 │                                               │ [样式编辑]     │
│  图]  │  ┌─────────────┐                              │ [颜色]         │
│ [大纲 │  │  Page 1      │                              │ [线宽]         │
│  ]    │  │  ┌─────────┐ │                              │ [字体]         │
│ [批注 │  │  │ Konva   │ │                              │ [位置/尺寸]    │
│  列表 │  │  │ Layer   │ │                              │ [批注内容]     │
│  ]    │  │  └─────────┘ │                              │                │
│ [搜索 │  │  ┌─────────┐ │                              │                │
│  ]    │  │  │ Page 2  │ │                              │                │
│       │  │  │  ...    │ │                              │                │
│       │  └─────────────┘                              │                │
├───────┴───────────────────────────────────────────────┴────────────────┤
│ StatusBar: [页码] [缩放] [文档信息] [修改标记] [版本]                    │
└────────────────────────────────────────────────────────────────────────┘
```

### 10.2 核心组件设计

#### PDFViewer 组件

```typescript
// src/components/Viewer/PDFViewer.tsx
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePdfStore } from '../../stores/pdfStore';
import { useAnnotationStore } from '../../stores/annotationStore';
import { useVirtualScroll } from '../../hooks/useVirtualScroll';
import { PageContainer } from './PageContainer';
import { PDFService } from '../../services/pdf/PDFService';

interface PDFViewerProps {
  pdfService: PDFService;
  onReady?: () => void;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ pdfService, onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const { totalPages, scale, rotation, layoutMode, currentPage } = usePdfStore();
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number }>>(new Map());

  // 监听容器尺寸变化
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 获取页面尺寸
  useEffect(() => {
    const loadDimensions = async () => {
      const dims = new Map<number, { width: number; height: number }>();
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfService.getPage(i);
        const viewport = page.getViewport({ scale: 1, rotation });
        dims.set(i, { width: viewport.width, height: viewport.height });
        page.cleanup();
      }
      setPageDimensions(dims);
    };
    if (totalPages > 0) loadDimensions();
  }, [totalPages, rotation, pdfService]);

  // 虚拟滚动
  const { visibleRange, totalHeight, getOffsetTop, onScroll } = useVirtualScroll({
    itemCount: totalPages,
    itemSizeGetter: (index) => {
      const dim = pageDimensions.get(index + 1);
      if (!dim) return 842 * scale + 32; // 默认 A4 高度
      return dim.height * scale + 32; // 32px 页面间距
    },
    overscan: 2,
    containerHeight: containerSize.height,
  });

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    onScroll(e.currentTarget.scrollTop);

    // 更新当前页码
    const scrollTop = e.currentTarget.scrollTop;
    for (let i = totalPages; i >= 1; i--) {
      if (getOffsetTop(i - 1) <= scrollTop) {
        usePdfStore.getState().setCurrentPage(i);
        break;
      }
    }
  }, [totalPages, onScroll, getOffsetTop]);

  return (
    <div
      ref={containerRef}
      className="pdf-viewer"
      onScroll={handleScroll}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#525659',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: totalHeight,
          minWidth: '100%',
        }}
      >
        {Array.from(
          { length: visibleRange.end - visibleRange.start + 1 },
          (_, i) => visibleRange.start + i
        ).map((pageIndex) => {
          const pageNumber = pageIndex + 1;
          const dim = pageDimensions.get(pageNumber);
          if (!dim) return null;

          return (
            <PageContainer
              key={pageNumber}
              pageNumber={pageNumber}
              offsetTop={getOffsetTop(pageIndex)}
              width={dim.width * scale}
              height={dim.height * scale}
              scale={scale}
              rotation={rotation}
              pdfService={pdfService}
              isActive={pageNumber === currentPage}
            />
          );
        })}
      </div>
    </div>
  );
};
```

#### Toolbar 组件

```typescript
// src/components/Toolbar/Toolbar.tsx
import React from 'react';
import { useToolStore } from '../../stores/toolStore';
import { DrawTool } from '../../services/annotation/DrawingController';
import { ZoomControl } from './ZoomControl';
import { PageNavigator } from './PageNavigator';
import { StylePicker } from './StylePicker';

const TOOLS: Array<{ tool: DrawTool; icon: string; label: string; shortcut: string }> = [
  { tool: DrawTool.NONE,        icon: 'cursor',    label: '选择',    shortcut: 'V' },
  { tool: DrawTool.PAN,         icon: 'hand',      label: '平移',    shortcut: 'H' },
  { tool: DrawTool.RECTANGLE,   icon: 'rect',      label: '矩形',    shortcut: 'R' },
  { tool: DrawTool.ELLIPSE,     icon: 'ellipse',   label: '椭圆',    shortcut: 'O' },
  { tool: DrawTool.ARROW,       icon: 'arrow',     label: '箭头',    shortcut: 'A' },
  { tool: DrawTool.LINE,        icon: 'line',      label: '直线',    shortcut: 'L' },
  { tool: DrawTool.FREEHAND,    icon: 'pen',       label: '画笔',    shortcut: 'P' },
  { tool: DrawTool.TEXT,        icon: 'text',      label: '文本',    shortcut: 'T' },
  { tool: DrawTool.HIGHLIGHT,   icon: 'highlight', label: '高亮',    shortcut: 'U' },
  { tool: DrawTool.STICKY_NOTE, icon: 'note',      label: '便签',    shortcut: 'N' },
  { tool: DrawTool.STAMP,       icon: 'stamp',     label: '印章',    shortcut: 'S' },
  { tool: DrawTool.ERASER,      icon: 'eraser',    label: '橡皮',    shortcut: 'E' },
];

export const Toolbar: React.FC = () => {
  const { activeTool, setTool } = useToolStore();

  return (
    <div className="toolbar" role="toolbar" aria-label="标注工具栏">
      {/* 工具按钮组 */}
      <div className="toolbar__tools">
        {TOOLS.map(({ tool, icon, label, shortcut }) => (
          <button
            key={tool}
            className={`toolbar__btn ${activeTool === tool ? 'toolbar__btn--active' : ''}`}
            onClick={() => setTool(tool)}
            title={`${label} (${shortcut})`}
            aria-label={label}
            aria-pressed={activeTool === tool}
          >
            <svg className="toolbar__icon">
              <use href={`#icon-${icon}`} />
            </svg>
          </button>
        ))}
      </div>

      <div className="toolbar__separator" />

      {/* 样式选择器 */}
      <StylePicker />

      <div className="toolbar__separator" />

      {/* 撤销/重做 */}
      <UndoRedoButtons />

      <div className="toolbar__spacer" />

      {/* 页码导航 */}
      <PageNavigator />

      <div className="toolbar__separator" />

      {/* 缩放控件 */}
      <ZoomControl />
    </div>
  );
};
```

### 10.3 组件通信模式

```
用户操作 → Component → Store Action → Service → IPC → Main Process
     ↑                                                        │
     └──── Store State Update ← Store ← Service ← IPC ←───────┘
```

**原则**：
- 组件不直接调用 Service，通过 Store Action 间接调用
- Service 不持有 UI 引用，纯逻辑层
- IPC 调用只在 Service 层或 Store Action 中发起
- 跨组件通信通过 Store 订阅实现，避免 prop drilling

---

## 11. IPC 通信协议

### 11.1 通道定义

```typescript
// src/types/ipc.ts

/**
 * IPC 通道定义
 * 格式: 'domain:action'
 */
export const IPC_CHANNELS = {
  // ── 文件操作 ──
  FILE_OPEN:           'file:open',
  FILE_READ:           'file:read',
  FILE_SAVE:           'file:save',
  FILE_EXISTS:         'file:exists',
  FILE_RECENT_LIST:    'file:recent-list',
  FILE_RECENT_CLEAR:   'file:recent-clear',

  // ── PDF 导出 ──
  EXPORT_PDF:          'export:pdf',
  EXPORT_IMAGE:        'export:image',

  // ── 系统 ──
  SYSTEM_CLIPBOARD_WRITE: 'system:clipboard-write',
  SYSTEM_CLIPBOARD_READ:  'system:clipboard-read',
  SYSTEM_SHOW_IN_FOLDER:  'system:show-in-folder',
  SYSTEM_OPEN_EXTERNAL:   'system:open-external',

  // ── 窗口 ──
  WINDOW_MINIMIZE:       'window:minimize',
  WINDOW_MAXIMIZE:       'window:maximize',
  WINDOW_CLOSE:          'window:close',
  WINDOW_IS_MAXIMIZED:   'window:is-maximized',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed',

  // ── 自动更新 ──
  UPDATER_CHECK:         'updater:check',
  UPDATER_DOWNLOAD:      'updater:download',
  UPDATER_INSTALL:       'updater:install',
  UPDATER_AVAILABLE:     'updater:available',
  UPDATER_PROGRESS:      'updater:progress',

  // ── 菜单事件 (Main → Renderer) ──
  MENU_ACTION:           'menu:action',
  FILE_OPEN_FROM_ARGV:   'file:open-from-argv',
  MENU_PRINT:            'menu:print',

  // ── 应用 ──
  APP_VERSION:           'app:version',

  // ── 超链接标注 ──
  HYPERLINK_LIST:        'hyperlink:list',
  HYPERLINK_ADD:         'hyperlink:add',
  HYPERLINK_EDIT:        'hyperlink:edit',
  HYPERLINK_REMOVE:      'hyperlink:remove',

  // ── 书签 ──
  BOOKMARK_GET:          'bookmark:get',
  BOOKMARK_EDIT:         'bookmark:edit',
  BOOKMARK_SET:          'bookmark:set',

  // ── 脚本执行 ──
  SCRIPT_EXECUTE:        'script:execute',
  SCRIPT_VALIDATE:       'script:validate',
  SCRIPT_STATS:          'script:stats',
} as const;

/**
 * IPC 请求/响应类型映射
 */
export interface IpcRequestMap {
  [IPC_CHANNELS.FILE_OPEN]: void;
  [IPC_CHANNELS.FILE_READ]: { filePath: string };
  [IPC_CHANNELS.FILE_SAVE]: { data: ArrayBuffer; defaultName: string };
  [IPC_CHANNELS.FILE_EXISTS]: { filePath: string };
  [IPC_CHANNELS.EXPORT_PDF]: {
    annotations: unknown[];
    sourcePath: string;
    outputPath: string;
  };
  [IPC_CHANNELS.SYSTEM_CLIPBOARD_WRITE]: { text: string };
  [IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL]: { url: string };
}

export interface IpcResponseMap {
  [IPC_CHANNELS.FILE_OPEN]: string | null;
  [IPC_CHANNELS.FILE_READ]: ArrayBuffer;
  [IPC_CHANNELS.FILE_SAVE]: string | null;
  [IPC_CHANNELS.FILE_EXISTS]: boolean;
  [IPC_CHANNELS.EXPORT_PDF]: boolean;
  [IPC_CHANNELS.SYSTEM_CLIPBOARD_READ]: string;
  [IPC_CHANNELS.APP_VERSION]: string;
}
```

### 11.2 IPC 处理器注册

```typescript
// electron/ipc/index.ts
import { ipcMain, dialog, clipboard, shell, BrowserWindow, app } from 'electron';
import * as fs from 'fs/promises';
import { IPC_CHANNELS } from '../../src/types/ipc';

export function registerIpcHandlers(): void {
  // ── 文件操作 ──
  ipcMain.handle(IPC_CHANNELS.FILE_OPEN, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'PDF 文件', extensions: ['pdf'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, { filePath }) => {
    const buffer = await fs.readFile(filePath);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
  });

  ipcMain.handle(IPC_CHANNELS.FILE_SAVE, async (_event, { data, defaultName }) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, Buffer.from(data));
    return result.filePath;
  });

  ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, async (_event, { filePath }) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // ── 系统 ──
  ipcMain.handle(IPC_CHANNELS.SYSTEM_CLIPBOARD_WRITE, async (_event, { text }) => {
    clipboard.writeText(text);
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_CLIPBOARD_READ, async () => {
    return clipboard.readText();
  });

  ipcMain.on(IPC_CHANNELS.SYSTEM_SHOW_IN_FOLDER, (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, async (_event, { url }) => {
    await shell.openExternal(url);
  });

  // ── 窗口 ──
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  // ── 应用 ──
  ipcMain.on(IPC_CHANNELS.APP_VERSION, (event) => {
    event.returnValue = app.getVersion();
  });
}
```

---

## 12. 数据持久化与文件格式

### 12.1 .verity 项目文件

标注数据保存在与 PDF 同目录的 `.verity` 文件中，不修改原始 PDF：

```typescript
// src/types/project.ts

interface VerityProjectFile {
  /** 文件版本 (用于向前兼容) */
  version: string;  // "2.0"

  /** 关联的 PDF 文件路径 */
  documentPath: string;

  /** PDF 文件指纹 (用于校验文件是否被替换) */
  documentFingerprint: string;

  /** 创建时间 */
  createdAt: number;

  /** 最后修改时间 */
  updatedAt: number;

  /** 所有标注数据 */
  annotations: Annotation[];

  /** 视图状态 */
  viewState: {
    currentPage: number;
    scale: number;
    rotation: number;
    layoutMode: LayoutMode;
    sidebarOpen: boolean;
    sidebarTab: string;
  };

  /** 用户偏好 (文档级别) */
  preferences: {
    defaultStyle: AnnotationStyle;
    defaultFontFamily: string;
    defaultFontSize: number;
  };
}
```

### 12.2 持久化服务

```typescript
// src/services/storage/ProjectStorage.ts
import type { VerityProjectFile } from '../../types/project';

export class ProjectStorage {
  /**
   * 保存项目文件
   */
  async save(pdfPath: string, data: VerityProjectFile): Promise<void> {
    const projectPath = this.getProjectPath(pdfPath);
    const json = JSON.stringify(data, null, 2);
    await window.electronAPI.file.save(
      new TextEncoder().encode(json).buffer,
      projectPath
    );
  }

  /**
   * 加载项目文件
   */
  async load(pdfPath: string): Promise<VerityProjectFile | null> {
    const projectPath = this.getProjectPath(pdfPath);

    const exists = await window.electronAPI.file.exists(projectPath);
    if (!exists) return null;

    try {
      const buffer = await window.electronAPI.file.read(projectPath);
      const text = new TextDecoder().decode(buffer);
      const data = JSON.parse(text) as VerityProjectFile;

      // 版本迁移
      return this.migrateIfNeeded(data);
    } catch (error) {
      console.error('Failed to load project file:', error);
      return null;
    }
  }

  /**
   * 自动保存 (防抖, 2秒间隔)
   */
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  scheduleAutoSave(pdfPath: string, data: VerityProjectFile): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(() => {
      this.save(pdfPath, data);
    }, 2000);
  }

  /**
   * 版本迁移
   */
  private migrateIfNeeded(data: VerityProjectFile): VerityProjectFile {
    if (data.version === '1.0') {
      // v1.0 → v2.0 迁移: style 字段重构
      data.annotations = data.annotations.map(ann => ({
        ...ann,
        style: {
          stroke: (ann as any).stroke || '#FF0000',
          strokeWidth: (ann as any).strokeWidth || 2,
          fill: (ann as any).fill || 'transparent',
          opacity: (ann as any).opacity ?? 1,
        },
      }));
      data.version = '2.0';
    }
    return data;
  }

  private getProjectPath(pdfPath: string): string {
    return pdfPath.replace(/\.pdf$/i, '.verity');
  }
}
```

### 12.3 用户偏好存储

```typescript
// src/services/storage/PreferencesStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Preferences {
  // 通用
  language: 'zh-CN' | 'en-US' | 'ja-JP';
  theme: 'light' | 'dark' | 'system';
  autoSave: boolean;
  autoSaveInterval: number; // seconds

  // 默认标注样式
  defaultStrokeColor: string;
  defaultFillColor: string;
  defaultStrokeWidth: number;
  defaultOpacity: number;
  defaultFontFamily: string;
  defaultFontSize: number;

  // 视图
  defaultLayoutMode: 'single' | 'continuous' | 'spread';
  defaultScale: number;
  showThumbnails: boolean;
  thumbnailSize: number;

  // 性能
  maxCachePages: number;
  maxCacheMemoryMB: number;
  enableHardwareAcceleration: boolean;

  // 导出
  defaultExportFormat: 'pdf' | 'png';
  exportQuality: number; // 0-1
}

export const usePreferencesStore = create<Preferences>()(
  persist(
    () => ({
      language: 'zh-CN',
      theme: 'system',
      autoSave: true,
      autoSaveInterval: 5,
      defaultStrokeColor: '#FF0000',
      defaultFillColor: 'transparent',
      defaultStrokeWidth: 2,
      defaultOpacity: 1,
      defaultFontFamily: 'Arial',
      defaultFontSize: 16,
      defaultLayoutMode: 'continuous',
      defaultScale: 1.0,
      showThumbnails: true,
      thumbnailSize: 150,
      maxCachePages: 15,
      maxCacheMemoryMB: 256,
      enableHardwareAcceleration: true,
      defaultExportFormat: 'pdf',
      exportQuality: 0.92,
    }),
    {
      name: 'veritypdf-preferences',
      storage: {
        getItem: async (name) => {
          // 使用 electron-store 或 localStorage
          const value = localStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
```

---

## 13. PDF 导出与合并

### 13.1 导出服务 (主进程)

```typescript
// electron/ipc/exportHandlers.ts
import { ipcMain } from 'electron';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import * as fs from 'fs/promises';
import { IPC_CHANNELS } from '../../src/types/ipc';

interface ExportAnnotation {
  type: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  style: {
    stroke: string;
    strokeWidth: number;
    fill: string;
    opacity: number;
  };
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  imageData?: string;
  points?: number[];
}

export function registerExportHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.EXPORT_PDF, async (
    _event,
    { annotations, sourcePath, outputPath }: {
      annotations: ExportAnnotation[];
      sourcePath: string;
      outputPath: string;
    }
  ) => {
    try {
      const sourceBytes = await fs.readFile(sourcePath);
      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: true,
      });

      const pages = pdfDoc.getPages();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // 按页码分组标注
      const annotationsByPage = new Map<number, ExportAnnotation[]>();
      for (const ann of annotations) {
        const list = annotationsByPage.get(ann.pageNumber) || [];
        list.push(ann);
        annotationsByPage.set(ann.pageNumber, list);
      }

      // 逐页绘制标注
      for (const [pageNum, pageAnns] of annotationsByPage) {
        const page = pages[pageNum - 1];
        if (!page) continue;

        const pageHeight = page.getHeight();
        const pageWidth = page.getWidth();

        for (const ann of pageAnns) {
          // Konva 坐标 → PDF 坐标
          const pdfX = ann.x;
          const pdfY = pageHeight - ann.y - ann.height;
          const color = hexToRgbColor(ann.style.stroke);
          const fillColor = hexToRgbColor(ann.style.fill);

          switch (ann.type) {
            case 'rectangle':
              page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: ann.width,
                height: ann.height,
                borderColor: color,
                borderWidth: ann.style.strokeWidth,
                color: fillColor.a > 0 ? fillColor : undefined,
                opacity: ann.style.opacity,
                rotate: degrees(-ann.rotation),
              });
              break;

            case 'ellipse':
              page.drawEllipse({
                x: pdfX + ann.width / 2,
                y: pdfY + ann.height / 2,
                xScale: ann.width / 2,
                yScale: ann.height / 2,
                borderColor: color,
                borderWidth: ann.style.strokeWidth,
                color: fillColor.a > 0 ? fillColor : undefined,
                opacity: ann.style.opacity,
              });
              break;

            case 'text':
              page.drawText(ann.text || '', {
                x: pdfX,
                y: pdfY + ann.height - (ann.fontSize || 16),
                size: ann.fontSize || 16,
                font: helveticaFont,
                color: color,
                opacity: ann.style.opacity,
                rotate: degrees(-ann.rotation),
              });
              break;

            case 'highlight':
              page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: ann.width,
                height: ann.height,
                color: fillColor,
                opacity: ann.style.opacity,
                borderWidth: 0,
              });
              break;

            case 'arrow':
            case 'line':
            case 'freehand':
              if (ann.points && ann.points.length >= 4) {
                // 使用 pdf-lib 的路径 API 绘制线段
                for (let i = 0; i < ann.points.length - 2; i += 2) {
                  const x1 = ann.points[i];
                  const y1 = pageHeight - ann.points[i + 1];
                  const x2 = ann.points[i + 2];
                  const y2 = pageHeight - ann.points[i + 3];
                  page.drawLine({
                    start: { x: x1, y: y1 },
                    end: { x: x2, y: y2 },
                    thickness: ann.style.strokeWidth,
                    color: color,
                    opacity: ann.style.opacity,
                  });
                }
              }
              break;

            case 'stamp':
            case 'signature':
              if (ann.imageData) {
                try {
                  const imageBytes = Buffer.from(
                    ann.imageData.replace(/^data:image\/\w+;base64,/, ''),
                    'base64'
                  );
                  const image = ann.imageData.includes('image/png')
                    ? await pdfDoc.embedPng(imageBytes)
                    : await pdfDoc.embedJpg(imageBytes);

                  page.drawImage(image, {
                    x: pdfX,
                    y: pdfY,
                    width: ann.width,
                    height: ann.height,
                    opacity: ann.style.opacity,
                    rotate: degrees(-ann.rotation),
                  });
                } catch (err) {
                  console.error('Failed to embed image:', err);
                }
              }
              break;
          }
        }
      }

      // 保存
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      return true;
    } catch (error) {
      console.error('PDF export failed:', error);
      return false;
    }
  });
}

function hexToRgbColor(hex: string) {
  if (!hex || hex === 'transparent') return rgb(0, 0, 0);
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b, a: isNaN(r) ? 0 : 1 };
}
```

---

## 14. 键盘快捷键系统

### 14.1 快捷键映射表

| 快捷键 | 操作 | 上下文 |
|--------|------|--------|
| `Ctrl+O` / `Cmd+O` | 打开 PDF 文件 | 全局 |
| `Ctrl+S` / `Cmd+S` | 保存标注 | 有文档时 |
| `Ctrl+Shift+S` | 另存为 | 有文档时 |
| `Ctrl+Shift+E` | 导出 PDF | 有文档时 |
| `Ctrl+P` / `Cmd+P` | 打印 | 有文档时 |
| `Ctrl+Z` | 撤销 | 全局 |
| `Ctrl+Shift+Z` | 重做 | 全局 |
| `Ctrl+C` | 复制选中标注 | 有选中时 |
| `Ctrl+V` | 粘贴标注 | 有剪贴板时 |
| `Ctrl+X` | 剪切选中标注 | 有选中时 |
| `Ctrl+D` | 复制选中标注 (原位偏移) | 有选中时 |
| `Delete` / `Backspace` | 删除选中标注 | 有选中时 |
| `Ctrl+A` | 全选当前页标注 | 有文档时 |
| `Escape` | 取消绘制 / 取消选中 | 绘制/选中时 |
| `V` | 选择工具 | 全局 |
| `H` | 平移/抓手工具 | 全局 |
| `R` | 矩形工具 | 全局 |
| `O` | 椭圆工具 | 全局 |
| `A` | 箭头工具 | 全局 |
| `L` | 直线工具 | 全局 |
| `P` | 画笔工具 | 全局 |
| `T` | 文本工具 | 全局 |
| `U` | 高亮工具 | 全局 |
| `N` | 便签工具 | 全局 |
| `E` | 橡皮工具 | 全局 |
| `Ctrl+=` / `Cmd+=` | 放大 | 有文档时 |
| `Ctrl+-` / `Cmd+-` | 缩小 | 有文档时 |
| `Ctrl+0` | 适合宽度 | 有文档时 |
| `Ctrl+1` | 适合页面 | 有文档时 |
| `Ctrl+2` | 实际大小 (100%) | 有文档时 |
| `Ctrl+R` | 顺时针旋转 | 有文档时 |
| `Ctrl+L` | 逆时针旋转 | 有文档时 |
| `PageUp` / `↑` | 上一页 | 有文档时 |
| `PageDown` / `↓` | 下一页 | 有文档时 |
| `Home` | 首页 | 有文档时 |
| `End` | 末页 | 有文档时 |
| `Ctrl+F` / `Cmd+F` | 打开搜索 | 有文档时 |
| `F3` / `Enter` (搜索框) | 下一个搜索结果 | 搜索时 |
| `Shift+F3` | 上一个搜索结果 | 搜索时 |
| `F11` / `Ctrl+Cmd+F` | 全屏切换 | 全局 |
| `Ctrl+,` | 偏好设置 | 全局 |
| `[` | 减小线宽 | 绘制工具时 |
| `]` | 增大线宽 | 绘制工具时 |
| `Space` (长按) | 临时切换到平移工具 | 非文本输入时 |

### 14.2 快捷键 Hook

```typescript
// src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react';
import { useToolStore } from '../stores/toolStore';
import { usePdfStore } from '../stores/pdfStore';
import { useAnnotationStore } from '../stores/annotationStore';
import { DrawTool } from '../services/annotation/DrawingController';

const TOOL_SHORTCUTS: Record<string, DrawTool> = {
  v: DrawTool.NONE,
  h: DrawTool.PAN,
  r: DrawTool.RECTANGLE,
  o: DrawTool.ELLIPSE,
  a: DrawTool.ARROW,
  l: DrawTool.LINE,
  p: DrawTool.FREEHAND,
  t: DrawTool.TEXT,
  u: DrawTool.HIGHLIGHT,
  n: DrawTool.STICKY_NOTE,
  e: DrawTool.ERASER,
};

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框内的按键
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();

      // ── 工具快捷键 (无修饰键) ──
      if (!isCtrlOrCmd && !isShift && TOOL_SHORTCUTS[key]) {
        e.preventDefault();
        useToolStore.getState().setTool(TOOL_SHORTCUTS[key]);
        return;
      }

      // ── Ctrl/Cmd 组合键 ──
      if (isCtrlOrCmd) {
        switch (key) {
          case 'o':
            e.preventDefault();
            window.electronAPI?.events.onMenuAction((action) => {
              if (action === 'file-open') handleFileOpen();
            });
            break;
          case 's':
            e.preventDefault();
            if (isShift) handleSaveAs();
            else handleSave();
            break;
          case 'z':
            e.preventDefault();
            if (isShift) handleRedo();
            else handleUndo();
            break;
          case 'c':
            e.preventDefault();
            useAnnotationStore.getState().copySelected();
            break;
          case 'v':
            e.preventDefault();
            useAnnotationStore.getState().paste();
            break;
          case 'x':
            e.preventDefault();
            useAnnotationStore.getState().cutSelected();
            break;
          case 'd':
            e.preventDefault();
            useAnnotationStore.getState().duplicateSelected();
            break;
          case 'a':
            e.preventDefault();
            handleSelectAll();
            break;
          case '=':
          case '+':
            e.preventDefault();
            usePdfStore.getState().zoomIn();
            break;
          case '-':
            e.preventDefault();
            usePdfStore.getState().zoomOut();
            break;
          case '0':
            e.preventDefault();
            handleZoomFitWidth();
            break;
          case 'f':
            e.preventDefault();
            handleOpenSearch();
            break;
        }
      }

      // ── 删除键 ──
      if (key === 'delete' || key === 'backspace') {
        const { selectedIds } = useAnnotationStore.getState();
        if (selectedIds.length > 0) {
          e.preventDefault();
          useAnnotationStore.getState().removeAnnotations(selectedIds);
        }
      }

      // ── Escape ──
      if (key === 'escape') {
        useAnnotationStore.getState().deselectAll();
        useToolStore.getState().setTool(DrawTool.NONE);
      }

      // ── 线宽调整 ──
      if (key === '[') {
        const { style } = useToolStore.getState();
        useToolStore.getState().setStrokeWidth(Math.max(1, style.strokeWidth - 1));
      }
      if (key === ']') {
        const { style } = useToolStore.getState();
        useToolStore.getState().setStrokeWidth(Math.min(20, style.strokeWidth + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
```

---

## 15. 国际化 (i18n)

### 15.1 架构

使用 `i18next` + `react-i18next`：

```typescript
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import jaJP from './locales/ja-JP.json';

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
    'ja-JP': { translation: jaJP },
  },
  lng: localStorage.getItem('language') || 'zh-CN',
  fallbackLng: 'en-US',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
```

### 15.2 翻译文件结构

```json
// src/i18n/locales/zh-CN.json
{
  "app": {
    "title": "VerityPDF",
    "unsavedChanges": "未保存的更改"
  },
  "menu": {
    "file": "文件",
    "edit": "编辑",
    "view": "视图",
    "page": "页面",
    "help": "帮助",
    "open": "打开 PDF...",
    "save": "保存标注",
    "saveAs": "另存为...",
    "export": "导出 PDF...",
    "print": "打印...",
    "preferences": "偏好设置...",
    "undo": "撤销",
    "redo": "重做",
    "copy": "复制",
    "paste": "粘贴",
    "cut": "剪切",
    "selectAll": "全选",
    "delete": "删除"
  },
  "toolbar": {
    "select": "选择",
    "pan": "平移",
    "rectangle": "矩形",
    "ellipse": "椭圆",
    "arrow": "箭头",
    "line": "直线",
    "freehand": "画笔",
    "text": "文本",
    "highlight": "高亮",
    "stickyNote": "便签",
    "stamp": "印章",
    "signature": "签名",
    "eraser": "橡皮"
  },
  "sidebar": {
    "thumbnails": "缩略图",
    "outline": "大纲",
    "annotations": "批注",
    "search": "搜索",
    "noOutline": "此文档没有大纲",
    "noAnnotations": "暂无批注",
    "searchPlaceholder": "搜索文档...",
    "searchResults": "找到 {{count}} 个结果"
  },
  "properties": {
    "title": "属性",
    "style": "样式",
    "stroke": "描边颜色",
    "fill": "填充颜色",
    "strokeWidth": "线宽",
    "opacity": "透明度",
    "fontFamily": "字体",
    "fontSize": "字号",
    "position": "位置",
    "size": "尺寸",
    "rotation": "旋转",
    "content": "批注内容",
    "noSelection": "未选中任何标注"
  },
  "dialog": {
    "confirm": "确认",
    "cancel": "取消",
    "close": "关闭",
    "yes": "是",
    "no": "否",
    "ok": "确定",
    "saveBeforeClose": "是否保存对文档的更改？",
    "exportTitle": "导出 PDF",
    "exportSuccess": "导出成功",
    "exportFailed": "导出失败"
  },
  "statusbar": {
    "page": "第 {{current}} / {{total}} 页",
    "scale": "{{scale}}%",
    "modified": "已修改"
  }
}
```

---

## 16. 性能优化策略

### 16.1 渲染性能

| 策略 | 实现 | 效果 |
|------|------|------|
| **虚拟滚动** | 仅渲染可视区域 ±2 页 | 1000 页文档只渲染 5-7 页 |
| **LRU Canvas 缓存** | 缓存已渲染页面 Canvas | 回翻页面即时显示 |
| **渲染取消** | 快速翻页时取消不可见页面渲染 | 避免 CPU 浪费 |
| **requestAnimationFrame** | 滚动事件节流 | 减少重绘次数 |
| **OffscreenCanvas** | 缩略图使用离屏 Canvas | 不阻塞主线程 |
| **batchDraw** | Konva 批量绘制 | 减少 Canvas 重绘 |

### 16.2 内存管理

| 策略 | 实现 | 效果 |
|------|------|------|
| **Canvas 缓存上限** | 最大 15 页 / 256MB | 防止内存溢出 |
| **页面 cleanup** | 渲染完成后调用 `page.cleanup()` | 释放 PDF.js 内部资源 |
| **Konva 节点销毁** | 移除标注时调用 `node.destroy()` | 释放 Canvas 缓存 |
| **文本缓存清理** | 切换文档时清除搜索文本缓存 | 避免累积 |
| **事件监听清理** | 组件卸载时移除所有 listener | 防止内存泄漏 |

### 16.3 启动优化

```typescript
// 懒加载策略: 按需加载 PDF.js Worker
async function loadPdfWorker() {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
  return pdfjsLib;
}

// React.lazy 懒加载重型组件
const SignatureDialog = lazy(() => import('./components/Signature/SignatureDialog'));
const ExportDialog = lazy(() => import('./components/Dialogs/ExportDialog'));
const PreferencesDialog = lazy(() => import('./components/Dialogs/PreferencesDialog'));
const HyperlinkEditDialog = lazy(() => import('./components/hyperlink/HyperlinkEditDialog').then(m => ({ default: m.HyperlinkEditDialog })));
const BookmarkEditDialog = lazy(() => import('./components/bookmark/BookmarkEditDialog').then(m => ({ default: m.BookmarkEditDialog })));
const ScriptExecuteDialog = lazy(() => import('./components/script/ScriptExecuteDialog').then(m => ({ default: m.ScriptExecuteDialog })));
```

---

## 17. 安全模型

### 17.1 Electron 安全配置

```typescript
// 主窗口安全配置
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,    // ✅ 启用上下文隔离
    nodeIntegration: false,    // ✅ 禁用 Node 集成
    sandbox: true,             // ✅ 启用沙箱
    webSecurity: true,         // ✅ 启用 Web 安全
    allowRunningInsecureContent: false, // ✅ 禁止不安全内容
    experimentalFeatures: false,
    enableBlinkFeatures: '',
    webviewTag: false,         // ✅ 禁用 webview
  },
});

// 阻止新窗口创建
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

// CSP (Content Security Policy)
win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; " +
        "font-src 'self' data:; " +
        "connect-src 'self'"
      ],
    },
  });
});
```

### 17.2 IPC 安全

- 所有 IPC 通道使用 `ipcMain.handle` (请求-响应模式)，避免 `ipcMain.on` 的单向通信
- Preload 脚本只暴露最小化 API，不暴露 `ipcRenderer` 本身
- 文件路径验证：确保读取的文件在用户授权的范围内
- 外部 URL 打开使用 `shell.openExternal`，经过验证

### 17.3 数据安全

- 标注数据存储在本地 `.verity` 文件，不上传任何服务器
- 用户偏好存储在 `localStorage`，不包含敏感信息
- PDF 文件内容仅在内存中处理，不做临时文件缓存
- 签名图片数据以 base64 存储在标注数据中，不写入临时文件

---

## 18. 错误处理与日志

### 18.1 全局错误捕获

```typescript
// src/main.tsx (渲染进程入口)
import { ErrorBoundary } from './components/ErrorBoundary';

// 全局未捕获异常
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // 上报到日志服务
  logError('unhandledrejection', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  logError('uncaught', event.error);
});

// React 错误边界
<ErrorBoundary fallback={<CrashScreen />}>
  <App />
</ErrorBoundary>
```

### 18.2 日志系统 (主进程)

```typescript
// electron/utils/logger.ts
import log from 'electron-log';
import * as path from 'path';
import { app } from 'electron';

// 配置日志文件路径
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath('userData'), 'logs', 'main.log');

log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// 开发环境输出到控制台
if (process.env.NODE_ENV === 'development') {
  log.transports.console.level = 'debug';
} else {
  log.transports.console.level = 'warn';
}

export const logger = log;
```

### 18.3 错误分类与处理

| 错误类型 | 处理方式 | 用户反馈 |
|----------|---------|---------|
| PDF 加载失败 | 显示错误页面 + 重试按钮 | Toast 通知 |
| PDF 密码错误 | 弹出密码输入对话框 | 对话框 |
| 导出失败 | 记录日志 + Toast 错误 | Toast 通知 |
| 文件不存在 | 从最近文件列表移除 + 提示 | Toast 通知 |
| 内存不足 | 清除缓存 + 提示用户 | 对话框 |
| 渲染异常 | 降低渲染质量 (关闭 GPU) | 静默降级 |
| 未保存退出 | 拦截关闭事件 + 确认对话框 | 对话框 |

---

## 19. 测试策略

### 19.1 测试分层

```
┌─────────────────────────────────────────┐
│           E2E 测试 (Playwright)          │  ← 10% 关键流程
│  打开PDF → 标注 → 导出 → 验证输出        │
├─────────────────────────────────────────┤
│        集成测试 (Vitest + Testing Library)│  ← 30% 模块协作
│  Store + Service 联动、组件交互           │
├─────────────────────────────────────────┤
│           单元测试 (Vitest)              │  ← 60% 纯逻辑
│  坐标转换、缓存、历史管理、工具函数        │
└─────────────────────────────────────────┘
```

### 19.2 单元测试示例

```typescript
// tests/unit/coordinateConverter.test.ts
import { describe, it, expect } from 'vitest';
import { CoordinateConverter } from '../../src/utils/coordinateConverter';

describe('CoordinateConverter', () => {
  const pageHeight = 842; // A4
  const scale = 1.5;

  describe('pdfToKonva', () => {
    it('应将左下角原点转换为左上角原点', () => {
      const result = CoordinateConverter.pdfToKonva(0, 0, pageHeight, 1);
      expect(result.x).toBe(0);
      expect(result.y).toBe(pageHeight);
    });

    it('应将右上角原点正确转换', () => {
      const result = CoordinateConverter.pdfToKonva(595, 842, pageHeight, 1);
      expect(result.x).toBe(595);
      expect(result.y).toBe(0);
    });

    it('应正确应用缩放因子', () => {
      const result = CoordinateConverter.pdfToKonva(100, 421, pageHeight, scale);
      expect(result.x).toBeCloseTo(150);
      expect(result.y).toBeCloseTo(631.5);
    });
  });

  describe('konvaToPdf', () => {
    it('应是 pdfToKonva 的逆操作', () => {
      const konva = CoordinateConverter.pdfToKonva(200, 500, pageHeight, scale);
      const pdf = CoordinateConverter.konvaToPdf(konva.x, konva.y, pageHeight, scale);
      expect(pdf.x).toBeCloseTo(200);
      expect(pdf.y).toBeCloseTo(500);
    });
  });
});

// tests/unit/PageCacheManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PageCacheManager } from '../../src/services/pdf/PageCacheManager';

describe('PageCacheManager', () => {
  let cache: PageCacheManager;

  beforeEach(() => {
    cache = new PageCacheManager(3);
  });

  it('应正确存取缓存', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 200;
    cache.set(1, canvas, 1.0, 0);
    expect(cache.get(1, 1.0, 0)).toBe(canvas);
  });

  it('缩放变化时应返回 null', () => {
    const canvas = document.createElement('canvas');
    cache.set(1, canvas, 1.0, 0);
    expect(cache.get(1, 2.0, 0)).toBeNull();
  });

  it('超过最大条目时应淘汰最旧项', () => {
    for (let i = 1; i <= 4; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      cache.set(i, canvas, 1.0, 0);
    }
    // 第1页应被淘汰
    expect(cache.get(1, 1.0, 0)).toBeNull();
    expect(cache.get(4, 1.0, 0)).not.toBeNull();
  });
});
```

### 19.3 E2E 测试示例

```typescript
// tests/e2e/pdf-viewer.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await electron.launch({ args: ['./'] });
  window = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
});

test('应正确打开 PDF 文件', async () => {
  // 模拟文件打开
  await window.evaluate(() => {
    // 通过 IPC 模拟
  });

  // 验证页面渲染
  const viewer = await window.$('.pdf-viewer');
  expect(viewer).not.toBeNull();
});

test('应正确绘制矩形标注', async () => {
  // 选择矩形工具
  await window.click('[aria-label="矩形"]');

  // 在页面上拖拽绘制
  const page = await window.$('.pdf-page');
  const box = await page!.boundingBox();
  if (!box) return;

  await window.mouse.move(box.x + 50, box.y + 50);
  await window.mouse.down();
  await window.mouse.move(box.x + 200, box.y + 150);
  await window.mouse.up();

  // 验证标注已创建
  const annotation = await window.$('.konva-annotation');
  expect(annotation).not.toBeNull();
});
```

### 19.4 测试覆盖率要求

| 模块 | 最低覆盖率 | 说明 |
|------|-----------|------|
| `utils/` | 95% | 纯函数，易测试 |
| `services/` | 80% | 核心业务逻辑 |
| `stores/` | 85% | 状态管理 |
| `hooks/` | 70% | 需要 Mock 环境 |
| `components/` | 60% | 关键交互路径 |
| `electron/` | 50% | IPC 处理器 |

---

## 20. 构建、打包与发布

### 20.1 Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    ]),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      external: ['electron'],
    },
  },

  optimizeDeps: {
    include: ['pdfjs-dist', 'konva', 'react-konva'],
  },

  // PDF.js 静态资源
  publicDir: 'public',
});
```

### 20.2 electron-builder 配置

```yaml
# electron-builder.yml
appId: com.veritypdf.app
productName: VerityPDF
copyright: Copyright © 2026 VerityPDF Team

directories:
  output: release
  buildResources: resources

files:
  - dist/**/*
  - dist-electron/**/*

extraResources:
  - from: node_modules/pdfjs-dist/cmaps
    to: cmaps
  - from: node_modules/pdfjs-dist/standard_fonts
    to: standard_fonts

asar: true
asarUnpack:
  - "**/*.node"

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: build/notarize.js
  icon: resources/icon.icns

win:
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
  icon: resources/icon.ico
  publisherName: VerityPDF Team

linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  category: Office
  icon: resources/icon.png

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true

publish:
  provider: github
  owner: your-org
  repo: VerityPDF
```

### 20.3 代码签名 (macOS)

```javascript
// build/notarize.js
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    tool: 'notarytool',
    appBundleId: 'com.veritypdf.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```

```xml
<!-- build/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

---

## 21. CI/CD 流水线

### 21.1 GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test:unit --coverage
      - run: pnpm build

      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  e2e:
    needs: lint-and-test
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm test:e2e
```

### 21.2 发布流水线

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Package & Publish
        run: pnpm exec electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```

### 21.3 版本管理

遵循 [Semantic Versioning](https://semver.org/)：

- `MAJOR.MINOR.PATCH` (如 `2.1.3`)
- 预发布: `2.1.3-beta.1`, `2.1.3-rc.1`
- Tag 触发发布: `git tag v2.1.3 && git push --tags`

---

## 22. 已知限制与路线图

### 22.1 当前限制

| 限制 | 影响 | 缓解方案 |
|------|------|---------|
| PDF.js 对 Type 3 字体支持有限 | 部分文档字体渲染异常 | 提示用户安装缺失字体 |
| 大文件 (>200 页) 首次加载慢 | 启动等待时间长 | 闪屏 + 进度条 + 懒加载 |
| 自由画笔在高 DPI 屏幕锯齿 | 线条不够平滑 | 开启抗锯齿 + 增加 tension |
| 不支持 PDF 表单填写 | 交互式表单无法填写 | 路线图 P2 |
| 标注不支持 PDF 标准嵌入 | 导出后标注不可编辑 | 路线图: 支持 PDF Annotation 标准 |
| 单窗口模式 | 不能同时编辑多个文档 | 路线图: 多标签页支持 |

### 22.2 版本路线图

| 版本 | 目标 | 关键特性 |
|------|------|---------|
| **v1.0** | MVP 发布 | PDF 浏览、基础标注、导出 |
| **v1.1** | 体验优化 | 撤销/重做、对齐吸附、键盘快捷键 |
| **v1.2** | 签名功能 | 手写签名、印章、签名管理 |
| **v1.3** | 编辑增强 | 链接编辑、书签编辑、脚本执行 |
| **v1.4** | 协作基础 | 批注评论、导出评论汇总 |
| **v2.0** | 大版本 | 多标签页、插件系统、OCR |
| **v2.1** | 表单支持 | PDF 表单填写、表单数据导出 |
| **v2.2** | 云端集成 | 云存储同步、实时协作标注 |
| **v3.0** | AI 增强 | AI 辅助摘要、智能标注建议 |

---

## 23. 附录：依赖清单

### 23.1 生产依赖

| 包名 | 版本 | 用途 | License |
|------|------|------|---------|
| `electron` | ^30.0.0 | 桌面应用框架 | MIT |
| `pdfjs-dist` | ^4.0.0 | PDF 解析与渲染 | Apache-2.0 |
| `konva` | ^9.3.0 | 2D Canvas 图形引擎 | MIT |
| `react` | ^18.3.0 | UI 框架 | MIT |
| `react-dom` | ^18.3.0 | React DOM 渲染 | MIT |
| `react-konva` | ^18.2.0 | Konva React 绑定 | MIT |
| `zustand` | ^4.5.0 | 状态管理 | MIT |
| `pdf-lib` | ^1.17.0 | PDF 生成/修改 | MIT |
| `i18next` | ^23.0.0 | 国际化 | MIT |
| `react-i18next` | ^14.0.0 | React i18n 绑定 | MIT |
| `electron-log` | ^5.0.0 | 日志系统 | MIT |
| `electron-updater` | ^6.0.0 | 自动更新 | MIT |
| `chokidar` | ^3.6.0 | 文件监听 | MIT |

### 23.2 开发依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `typescript` | ^5.4.0 | 类型系统 |
| `vite` | ^5.2.0 | 构建工具 |
| `vite-plugin-electron` | ^0.28.0 | Vite Electron 集成 |
| `@vitejs/plugin-react` | ^4.2.0 | React 快速刷新 |
| `vitest` | ^1.5.0 | 单元测试 |
| `@testing-library/react` | ^15.0.0 | React 组件测试 |
| `playwright` | ^1.43.0 | E2E 测试 |
| `electron-builder` | ^24.0.0 | 打包发布 |
| `eslint` | ^9.0.0 | 代码检查 |
| `prettier` | ^3.2.0 | 代码格式化 |
| `tailwindcss` | ^3.4.0 | CSS 框架 |
| `@electron/notarize` | ^2.0.0 | macOS 公证 |
| `husky` | ^9.0.0 | Git hooks |
| `lint-staged` | ^15.0.0 | 暂存文件检查 |

---

## 24. 附录：开发规范

### 24.1 代码规范

| 规则 | 说明 |
|------|------|
| TypeScript 严格模式 | `strict: true`，所有文件必须类型完整 |
| 函数式组件 | 只使用函数式组件 + Hooks，禁止 class 组件 |
| 命名约定 | 组件: PascalCase, 服务/工具: camelCase, 常量: UPPER_SNAKE_CASE |
| 文件命名 | 组件文件与目录同名 (`Toolbar/Toolbar.tsx`) |
| 导入顺序 | react → 第三方库 → 内部模块 → 类型 → 样式 |
| 注释 | 公共 API 必须 JSDoc，内部逻辑关键步骤加注释 |
| 标注操作 | 必须通过 `AnnotationManager`，禁止直接操作 Konva 节点 |
| 错误处理 | 异步操作必须 try-catch，不允许静默吞错 |

### 24.2 Git 提交规范

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Type 列表**：

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 代码重构 (不影响功能) |
| `perf` | 性能优化 |
| `style` | 代码格式调整 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `build` | 构建系统/依赖更新 |
| `ci` | CI 配置变更 |
| `chore` | 其他杂项 |
| `revert` | 回滚提交 |

**Scope 列表**：`pdf`, `annotation`, `electron`, `ui`, `export`, `i18n`, `perf`, `test`

示例：
```
feat(annotation): 添加对齐吸附参考线

- 实现 SnapHelper 吸附算法
- 拖拽时显示红色虚线参考线
- 阈值可配置 (默认 5px)

Closes #42
```

### 24.3 分支策略

```
main ──────────────────────── 稳定发布分支
  │                     ↑ merge
  ├── release/v1.2 ──── 发布准备 (bug fix only)
  │                     ↑ merge
  └── develop ────────── 开发集成分支
        │               ↑ merge
        ├── feature/snap-helper ─── 功能分支
        ├── feature/signature ────── 功能分支
        ├── fix/pdf-render-bug ───── 修复分支
        └── perf/cache-optimization ─ 优化分支
```

### 24.4 代码审查清单

- [ ] 类型完整，无 `any` (除非有充分理由并注释)
- [ ] 新增公共 API 有 JSDoc
- [ ] 关键逻辑有单元测试
- [ ] 无 console.log 残留 (用 logger 替代)
- [ ] 错误处理完整 (try-catch / ErrorBoundary)
- [ ] 无内存泄漏风险 (事件监听已清理)
- [ ] 国际化文本使用 i18n key
- [ ] 样式使用 CSS 变量 / Tailwind (无内联硬编码颜色)

---

*文档版本: v1.0.0 | 生成日期: 2026-06-15 | 技术栈: Electron 30 · PDF.js 4.x · Konva.js 9.x*
