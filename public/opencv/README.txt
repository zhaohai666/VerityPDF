OpenCV.js 文件放置说明
======================

本目录需要放置 OpenCV.js 的 WASM 文件，用于 OCR 图像预处理。

需要下载的文件:
1. opencv.js    (~1MB, JavaScript loader)
2. opencv_js.wasm (~7MB, WASM 核心)

下载地址:
- 官方构建: https://docs.opencv.org/4.x/opencv.js
- GitHub Releases: https://github.com/opencv/opencv/releases

版本要求: OpenCV 4.x

放置位置:
  public/opencv/opencv.js
  public/opencv/opencv_js.wasm

注意事项:
- 这两个文件体积较大，已添加到 .gitignore
- 开发前需手动下载放入本目录
- 打包时会自动包含到 dist 目录中
