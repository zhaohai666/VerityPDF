VerityPDF 兼容性测试样本集
===========================

本目录用于存放兼容性测试所需的 PDF 样本文件。

## 目录结构

```
test/
├── sample-manifest.json    # 样本清单（22 个测试场景）
└── samples/
    ├── README.md           # 本文件
    ├── basic-text.pdf      # 基础文本 PDF
    ├── cjk-content.pdf     # 中日韩文字 PDF
    ├── encrypted-*.pdf     # 加密文档
    ├── pdfa-archive.pdf    # PDF/A 归档文档
    └── ...                 # 其他样本文件
```

## 样本分类

| 分类 | 样本数 | 说明 |
|------|--------|------|
| basic | 1 | 基础功能验证 |
| font | 2 | 字体渲染与兜底 |
| image | 2 | 图片处理性能 |
| performance | 2 | 大文档内存管理 |
| encryption | 2 | 加密与权限控制 |
| format | 2 | PDF/A, PDF/X 兼容 |
| forms | 1 | 表单交互 |
| annotations | 1 | 标注性能 |
| layout | 4 | 页面布局变化 |
| repair | 2 | 损坏文件修复 |
| navigation | 1 | 书签与链接 |
| graphics | 1 | 图形渲染 |
| security | 1 | 数字签名 |

## 如何添加样本

1. 将 PDF 文件放入本目录
2. 文件名与 `sample-manifest.json` 中的 `file` 字段匹配
3. 确保样本文件无版权限制，可用于测试

## 样本来源建议

- 使用工具生成测试 PDF（如 reportlab、fpdf、pdf-lib）
- 从公开数据集中收集（如 PDF 标准测试文件）
- 使用 LibreOffice / Word 导出不同格式的 PDF
