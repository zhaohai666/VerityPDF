# VerityPDF

一款功能强大的开源桌面端 PDF 工具箱，基于 Electron + PDF.js + Konva.js 构建，提供专业级的 PDF 批注、编辑、转换和管理能力。

## ✨ 功能特性

### 📖 文档浏览

- **高保真 PDF 渲染** - 基于 PDF.js 4.x，支持 PDF 1.7 标准，兼容中日韩字体
- **多视图模式** - 单页视图 / 连续滚动 / 双页浏览
- **灵活缩放** - 适应页宽 / 适应页高 / 实际大小 / 自定义缩放
- **导航系统** - 缩略图面板、大纲书签跳转、页码导航
- **全文搜索** - 支持关键词高亮、搜索结果列表、逐一定位
- **文本选择** - 支持文本选择、复制、搜索

### ✏️ 标注工具

| 工具 | 说明 |
|------|------|
| 选择工具 | 选中、移动、缩放、旋转、删除标注 |
| 矩形/椭圆 | 几何形状标注，支持边框/填充/透明度 |
| 箭头/直线 | 方向指示与连接线，支持多种箭头样式 |
| 自由画笔 | 手绘标注，支持压感与平滑处理 |
| 文本标注 | 文本框，支持字体/字号/颜色自定义 |
| 高亮/下划线/删除线 | 文本标记工具 |
| 便签批注 | Sticky Note 便签，支持评论回复 |
| 印章 | 预设印章与自定义图片印章 |
| 手写签名 | 鼠标/触摸板手写签名 |
| 橡皮擦 | 擦除标注 |

- **撤销/重做** - 完整历史记录，支持 50+ 步操作回溯
- **样式管理** - 颜色、线宽、透明度、字体等样式可定制
- **标注列表** - 侧边栏集中管理所有标注，支持筛选与跳转

### 📄 页面管理

- **页面旋转** - 90°/180°/270° 顺时针/逆时针旋转
- **页面删除** - 批量删除指定页面
- **页面重排** - 拖拽调整页面顺序
- **插入空白页** - 自定义尺寸插入空白页面
- **页面提取** - 提取指定页面为新 PDF
- **多文件合并** - 将多个 PDF 文件合并为一个
- **文件拆分** - 按范围或页码拆分为多个文件
- **批量旋转** - 批量处理指定页面方向
- **批量裁剪** - 自定义边距批量裁剪页面
- **空白页检测** - 自动检测并标记空白页面

### 🔐 安全与加密

- **PDF 加密** - 用户密码/所有者密码双重保护
- **权限控制** - 打印、复制、修改、批注、表单填写、内容提取权限精细控制
- **加密移除** - 已知密码下移除 PDF 加密
- **QPDF 集成** - 高性能加密/解密处理

### 🗜️ 智能压缩

- **多档预设** - 最小体积 / 平衡 / 高质量三档预设
- **参数可调** - 图像 DPI、图像质量、灰度转换、元数据清理、字体子集化
- **Ghostscript 引擎** - 专业级 PDF 压缩优化

### 🔄 格式转换

- **多格式支持** - Word (doc/docx)、Excel (xls/xlsx)、PowerPoint (ppt/pptx)、HTML、Markdown、RTF、ODT/ODS/ODP 等
- **批量转换** - 多文件批量转换
- **LibreOffice 引擎** - 高质量文档格式转换
- **图像 DPI 可调** - 输出图像分辨率自定义

### 📝 表单处理

- **表单域检测** - 自动识别 PDF 中的表单字段
- **表单填写** - 批量填充表单字段值
- **表单扁平化** - 将表单内容合并为文档内容，不可再编辑

### ✍️ 数字签名

- **手写签名** - 鼠标/触摸板手写签名
- **数字证书签名** - PAdES 标准数字签名，支持 P12 证书
- **可见签名** - 自定义签名外观与位置
- **签名验证** - 验证 PDF 签名有效性与证书链
- **时间戳** - 支持签名时间戳

### █ 密文修订 (Redaction)

- **区域涂黑** - 矩形区域永久擦除内容
- **敏感信息检测** - 正则规则自动检测身份证号、手机号、邮箱、银行卡号等敏感信息
- **批量涂黑** - 一键涂黑所有匹配的敏感信息
- **内容流擦除** - 真正删除 PDF 内容流中的文本数据，而非仅视觉遮挡

### 📝 PDF 文本编辑

- **文本段检测** - 自动识别页面中的文本段及其属性
- **文本替换** - 替换指定文本段内容
- **文本删除** - 删除指定文本段
- **样式修改** - 修改字体大小、颜色等样式属性
- **内容流级编辑** - 直接操作 PDF 内容流，保证精确性

### 🔧 批量处理与任务队列

- **任务中心** - 统一管理批量任务，实时查看进度
- **流水线编辑** - 自定义多步骤处理流水线 (Pipeline)
- **任务控制** - 提交、取消、重试、移除任务
- **批量水印** - 批量添加文字/图片水印
- **批量页码** - 批量添加页码，支持多种位置与样式
- **批量页眉页脚** - 批量添加页眉页脚

### 💧 水印与页码

- **文字水印** - 自定义文字、字体、颜色、透明度、旋转角度
- **图片水印** - 支持自定义图片水印
- **布局模式** - 居中 / 平铺 (Tile) 两种布局
- **页码** - 多种位置、样式、起始编号可配置
- **页眉页脚** - 自定义页眉页脚文字与样式

### 🎨 更多高级功能

| 功能 | 说明 |
|------|------|
| **PDF 叠加** | 将一个 PDF 作为背景或前景叠加到另一个 PDF 上 |
| **图片提取** | 批量提取 PDF 中的所有内嵌图片 |
| **标注移除** | 检测并批量移除 PDF 中的标注，可保留签名 |
| **元数据编辑** | 编辑标题、作者、主题、关键词、创建者等元数据 |
| **页面调整** | 调整页面尺寸，支持适应/拉伸/裁剪三种缩放模式 |
| **N-up 排版** | 多页拼版 (2x1, 1x2, 2x2, 3x3, 4x4)，支持边距与边框 |
| **PDF 对比** | 对比两个 PDF 文件的内容差异 |
| **小册子制作** | 自动排版生成可装订的小册子 (Booklet) |
| **颜色替换** | 检测 PDF 中的颜色并批量替换 |
| **PDF 修复** | 修复损坏的 PDF 文件 |
| **OCR 文字识别** | 基于 Tesseract.js 的图像文字识别，生成可搜索 PDF |
| **链接编辑** | 添加、编辑、删除 PDF 超链接标注，支持 URI 链接和页面跳转 |
| **书签编辑** | 树形结构管理 PDF 书签，支持增删改、层级调整 |
| **脚本执行** | 基于 QuickJS 沙箱的安全脚本执行引擎，支持语法验证与资源限制 |

### 🌍 国际化

- **中文简体** (zh-CN)
- **英文** (en-US)

## 🛠️ 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **桌面框架** | Electron | 30.x | 跨平台桌面应用框架 |
| **UI 框架** | React | 18.x | 前端 UI 框架 |
| **语言** | TypeScript | 5.x | 类型安全的 JavaScript 超集 |
| **构建工具** | Vite | 5.x | 下一代前端构建工具 |
| **状态管理** | Zustand | 4.x | 轻量级状态管理库 |
| **UI 组件库** | Ant Design | 5.x | 企业级 UI 组件库 |
| **PDF 渲染** | PDF.js | 4.x | Mozilla 官方 PDF 渲染引擎 |
| **标注引擎** | Konva.js | 9.x | Canvas 2D 图形交互库 |
| **PDF 操作** | pdf-lib | 1.x | 纯 JavaScript PDF 创建与编辑库 |
| **OCR** | Tesseract.js | 7.x | 纯 JavaScript OCR 引擎 |
| **加密/签名** | node-forge | 1.x | 加密与数字证书处理 |
| **国际化** | i18next | 23.x | 国际化框架 |
| **测试框架** | Vitest | 1.x | Vite 原生测试框架 |
| **代码检查** | ESLint | 8.x | JavaScript/TypeScript 代码检查 |

### 原生依赖

- **Ghostscript** - PDF 压缩与处理
- **QPDF** - PDF 加密/解密与结构优化
- **LibreOffice** - 文档格式转换

## 📦 安装

### 系统要求

| 平台 | 最低版本 | 推荐版本 |
|------|---------|---------|
| **macOS** | 11.0 (Big Sur) | 13.0+ |
| **Windows** | Windows 10 1809 | Windows 11 |
| **Linux** | Ubuntu 20.04 / Fedora 36 | Ubuntu 22.04+ |
| **通用** | 500MB 磁盘空间, 4GB RAM | SSD + 8GB RAM |

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-org/VerityPDF.git
cd VerityPDF

# 安装依赖
npm install

# 启动开发模式
npm run dev

# 构建生产版本
npm run build

# 构建指定平台安装包
npm run pack:mac      # macOS DMG
npm run pack:win      # Windows NSIS
npm run pack:linux    # Linux AppImage / DEB
```

## 🚀 快速开始

### 开发调试

```bash
# 启动 Vite 开发服务器 + Electron
npm run electron:dev

# 仅启动渲染进程（浏览器调试）
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 运行单元测试
npm run test
```

### 目录结构

```
VerityPDF/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 主进程入口
│   ├── preload.ts               # 预加载脚本 (contextBridge)
│   ├── ipc/handlers.ts          # IPC 处理器注册
│   ├── menu/appMenu.ts          # 原生应用菜单
│   ├── annotation/              # 标注移除服务
│   ├── batch/                   # 批量处理（页面/水印/压缩/任务队列）
│   ├── booklet/                 # 小册子制作
│   ├── color/                   # 颜色替换
│   ├── compress/                # PDF 压缩 (Ghostscript)
│   ├── convert/                 # 格式转换 (LibreOffice)
│   ├── diff/                    # PDF 对比
│   ├── encryption/              # 加密解密 (QPDF)
│   ├── export/                  # PDF 导出
│   ├── extract/                 # 图片提取
│   ├── form/                    # 表单处理
│   ├── nup/                     # N-up 排版
│   ├── overlay/                 # PDF 叠加
│   ├── pdf/                     # 内容流编辑
│   ├── redact/                  # 敏感信息涂黑
│   ├── redaction/               # 密文修订
│   ├── repair/                  # PDF 修复
│   ├── resize/                  # 页面尺寸调整
│   └── signature/               # 数字签名
│
├── src/                         # 渲染进程 (React)
│   ├── main.tsx                 # 渲染入口
│   ├── App.tsx                  # 根组件
│   ├── components/              # UI 组件
│   │   ├── viewer/              # PDF 查看器
│   │   ├── toolbar/             # 工具栏
│   │   ├── sidebar/             # 侧边栏（缩略图/大纲/标注/页面）
│   │   ├── annotation/          # 标注相关组件
│   │   ├── batch/               # 批量处理组件
│   │   ├── search/              # 搜索面板
│   │   ├── property/            # 属性面板
│   │   ├── signature/           # 签名组件
│   │   ├── ocr/                 # OCR 面板
│   │   ├── form/                # 表单面板
│   │   ├── comment/             # 评论面板
│   │   └── ...                  # 更多功能对话框组件
│   ├── services/                # 业务服务层
│   │   ├── pdf/                 # PDF 渲染服务
│   │   ├── annotation/          # 标注管理服务
│   │   ├── export/              # 导出服务
│   │   ├── search/              # 搜索服务
│   │   ├── ocr/                 # OCR 服务
│   │   ├── form/                # 表单服务
│   │   └── storage/             # 存储服务
│   ├── stores/                  # Zustand 状态管理
│   │   ├── pdfStore.ts          # PDF 文档状态
│   │   ├── annotationStore.ts   # 标注状态
│   │   ├── toolStore.ts         # 工具状态
│   │   ├── uiStore.ts           # UI 状态
│   │   ├── pageStore.ts         # 页面状态
│   │   ├── searchStore.ts       # 搜索状态
│   │   ├── taskStore.ts         # 任务队列状态
│   │   ├── ocrStore.ts          # OCR 状态
│   │   └── formStore.ts         # 表单状态
│   ├── hooks/                   # 自定义 React Hooks
│   ├── utils/                   # 工具函数
│   ├── types/                   # TypeScript 类型定义
│   ├── i18n/                    # 国际化资源
│   └── styles/                  # 全局样式
│
├── public/                      # 静态资源
│   ├── cmaps/                   # PDF.js CMap 字体映射
│   └── standard_fonts/          # 标准字体文件
│
├── vendor/                      # 第三方二进制依赖
│   ├── gs/                      # Ghostscript
│   └── qpdf/                    # QPDF
│
├── test/                        # 测试资源
├── package.json                 # 项目配置
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 配置
├── vitest.config.ts             # Vitest 配置
└── .eslintrc.cjs                # ESLint 配置
```

## 🏗️ 架构设计

### 进程模型

```
Electron App
├── Main Process (1个)
│   ├── 窗口管理 (BrowserWindow)
│   ├── 文件系统 I/O
│   ├── PDF 处理服务 (pdf-lib / Ghostscript / QPDF)
│   ├── 格式转换 (LibreOffice)
│   ├── 原生菜单 & 快捷键
│   └── IPC 调度 (ipcMain.handle)
│
├── Preload Script (安全桥接层)
│   └── contextBridge - 暴露受限 electronAPI
│
├── Renderer Process (1个, sandbox=true)
│   ├── React 18 UI
│   ├── PDF.js 渲染 (Web Worker)
│   ├── Konva.js 标注交互
│   └── Zustand 状态管理
│
└── PDF.js Worker (1-2个)
    ├── PDF 解析
    └── 字体加载 & CMap 处理
```

### 多图层渲染架构

PDF 页面采用四层叠加设计，每层职责严格分离：

```
z-index: 30  ┌─────────────────────────────┐
             │  Konva Annotation Layer      │  标注图形、交互事件捕获
z-index: 20  ├─────────────────────────────┤
             │  HTML Text Layer             │  文本选择、搜索高亮
z-index: 10  ├─────────────────────────────┤
             │  Canvas Render Layer         │  PDF.js 光栅化渲染
z-index:  0  ├─────────────────────────────┤
             │  Background Layer            │  页面背景 + 阴影
             └─────────────────────────────┘
```

### 数据流

```
用户交互 → 事件处理 → Store 更新 → Service 调用 → IPC 通信 → 主进程处理
   ↑                                                          ↓
   └────────────── UI 重渲染 ← Store 订阅更新 ← 结果返回 ─────┘
```

## ⌨️ 快捷键

| 功能 | 快捷键 |
|------|--------|
| 打开 PDF | `Ctrl/Cmd + O` |
| 保存 | `Ctrl/Cmd + S` |
| 另存为 | `Ctrl/Cmd + Shift + S` |
| 导出 PDF | `Ctrl/Cmd + Shift + E` |
| 打印 | `Ctrl/Cmd + P` |
| 撤销 | `Ctrl/Cmd + Z` |
| 重做 | `Ctrl/Cmd + Shift + Z` |
| 复制 | `Ctrl/Cmd + C` |
| 粘贴 | `Ctrl/Cmd + V` |
| 全选 | `Ctrl/Cmd + A` |
| 删除选中 | `Delete / Backspace` |
| 放大 | `Ctrl/Cmd + = / +` |
| 缩小 | `Ctrl/Cmd + -` |
| 适应宽度 | `Ctrl/Cmd + 0` |
| 适应页面 | `Ctrl/Cmd + 1` |
| 实际大小 | `Ctrl/Cmd + 2` |
| 上一页 | `PageUp` |
| 下一页 | `PageDown` |
| 首页 | `Home` |
| 末页 | `End` |
| 顺时针旋转 | `Ctrl/Cmd + R` |
| 逆时针旋转 | `Ctrl/Cmd + L` |
| 全屏 | `F11 / Ctrl+Cmd+F` |
| 搜索 | `Ctrl/Cmd + F` |

## 🔒 安全特性

- **Context Isolation** - 渲染进程与主进程隔离，通过 contextBridge 暴露受限 API
- **Sandbox 模式** - 渲染进程运行在沙箱环境中
- **路径验证** - 文件路径安全校验，防止路径遍历与符号链接攻击
- **CSP 策略** - 内容安全策略，禁止 eval 与内联脚本
- **无远程代码执行** - 所有处理在本地完成，无云端依赖

## 🧪 测试

```bash
# 运行单元测试
npm run test

# 监听模式
npm run test:watch

# 覆盖率报告
npm run test:coverage

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 自动修复
npm run lint:fix
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📚 相关文档

- [技术文档](VerityPDF-技术文档.md) - 详细的技术架构与实现说明
- [执行计划书](VerityPDF-执行计划书.md) - 项目规划与里程碑
