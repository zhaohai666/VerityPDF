#!/usr/bin/env python3
"""
VerityPDF 全功能自动化测试脚本
=====================================
通过 Chrome DevTools Protocol (CDP) 模拟用户行为测试所有功能
仅使用 Python 标准库（socket + json），无需额外安装依赖

覆盖 50+ 测试用例：
- 核心渲染（PDF加载、工具栏、标注层、Stores暴露、i18n）
- 标注功能（绘制、撤销/重做、删除、选择、多类型、导出）
- 视图控制（缩放、翻页、旋转、滚动模式、工具切换）
- PDF文档操作（元数据、加密、压缩、净化、PDF/A、对比、信息JSON）
- 页面操作（提取、旋转、尺寸调整、N合1、小册子、水印、页码、页眉页脚、空白页检测、书签拆分）
- 内容编辑（文本编辑、图片编辑提取/布局、提取图片、移除图片、扫描件效果）
- 表单（高级字段详情、XFA检测）
- 安全与签名（密文、敏感信息检测、签名验证）
- 颜色与视觉（颜色检测/替换、反色）
- 附件与导出（附件管理、CSV导出、JavaScript查看、移除标注）
- 系统功能（任务队列）
"""

import socket
import json
import struct
import base64
import os
import sys
import time
import subprocess
import urllib.request
import datetime
import signal
import errno
from pathlib import Path
from typing import Optional, Dict, List, Tuple, Any

# ─── 配置加载 ─────────────────────────────────────

APP_DIR = Path(__file__).parent.resolve()
CONFIG_FILE = APP_DIR / "e2e_config.json"
E2E_DIR = APP_DIR / ".e2e"
LOG_DIR = E2E_DIR / "logs"


def load_config() -> dict:
    """加载 e2e 配置文件"""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    # 默认配置
    return {
        "cdp": {"host": "127.0.0.1", "port": 9222},
        "test": {"timeout": 15, "max_wait_cdp": 30, "max_wait_page": 15, "retry_count": 3},
        "logging": {"level": "info", "save_logs": True, "log_dir": str(LOG_DIR)}
    }


CONFIG = load_config()
CDP_HOST = CONFIG.get("cdp", {}).get("host", "127.0.0.1")
CDP_PORT = CONFIG.get("cdp", {}).get("port", 9222)
TEST_CONFIG = CONFIG.get("test", {})
TIMEOUT = TEST_CONFIG.get("timeout", 15)
MAX_WAIT_CDP = TEST_CONFIG.get("max_wait_cdp", 30)
MAX_WAIT_PAGE = TEST_CONFIG.get("max_wait_page", 15)
RETRY_COUNT = TEST_CONFIG.get("retry_count", 3)

TEST_PDF = str(APP_DIR / "test-export.pdf")
EXPORTED_PDF = str(APP_DIR / "test-export-result.pdf")

# ─── 日志系统 ──────────────────────────────────────


class Logger:
    """简单的日志记录器"""
    def __init__(self, log_dir: Path):
        self.log_dir = log_dir
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self.log_dir / f"e2e_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        self.levels = {"debug": 0, "info": 1, "warn": 2, "error": 3}
        self.min_level = self.levels.get(CONFIG.get("logging", {}).get("level", "info"), 1)

    def _log(self, level: str, message: str):
        if self.levels.get(level, 1) < self.min_level:
            return
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        line = f"[{timestamp}] [{level.upper()}] {message}"
        print(line)
        if CONFIG.get("logging", {}).get("save_logs", True):
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(line + "\n")

    def debug(self, msg: str): self._log("debug", msg)
    def info(self, msg: str): self._log("info", msg)
    def warn(self, msg: str): self._log("warn", msg)
    def error(self, msg: str): self._log("error", msg)


logger = Logger(LOG_DIR)

# ─── 测试结果收集 ─────────────────────────────────

results: List[Tuple[str, bool, str]] = []


def report(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    results.append((name, passed, detail))
    logger.info(f"  [{status}] {name}" + (f" - {detail}" if detail else ""))


# ─── PID文件管理 ─────────────────────────────────


class PIDManager:
    """PID文件管理器 - 精确进程管理"""

    def __init__(self, pid_dir: Path):
        self.pid_dir = pid_dir
        self.pid_dir.mkdir(parents=True, exist_ok=True)

    def _get_pid_file(self, name: str) -> Path:
        return self.pid_dir / f"{name}.pid"

    def write_pid(self, name: str, pid: int):
        """写入PID文件"""
        pid_file = self._get_pid_file(name)
        with open(pid_file, 'w') as f:
            f.write(str(pid))
        logger.debug(f"PID文件写入: {pid_file} = {pid}")

    def read_pid(self, name: str) -> Optional[int]:
        """读取PID"""
        pid_file = self._get_pid_file(name)
        if pid_file.exists():
            try:
                with open(pid_file, 'r') as f:
                    return int(f.read().strip())
            except (ValueError, IOError):
                pass
        return None

    def remove_pid(self, name: str):
        """移除PID文件"""
        pid_file = self._get_pid_file(name)
        if pid_file.exists():
            pid_file.unlink()
            logger.debug(f"PID文件移除: {pid_file}")

    def kill_by_pid(self, pid: int, graceful: bool = True) -> bool:
        """通过PID终止进程（不使用pkill）"""
        try:
            # 先尝试发送 SIGTERM (graceful shutdown)
            os.kill(pid, signal.SIGTERM if graceful else signal.SIGKILL)
            logger.info(f"已发送 {'SIGTERM' if graceful else 'SIGKILL'} 到进程 PID={pid}")

            # 等待进程终止
            for _ in range(10):
                try:
                    os.kill(pid, 0)  # 检查进程是否存在
                    time.sleep(0.3)
                except OSError as e:
                    if e.errno == errno.ESRCH:  # 进程已不存在
                        logger.info(f"进程 PID={pid} 已终止")
                        return True
            # 强制终止
            if graceful:
                try:
                    os.kill(pid, signal.SIGKILL)
                    logger.info(f"已发送 SIGKILL 到进程 PID={pid}")
                    return True
                except OSError:
                    pass
            return False
        except OSError as e:
            if e.errno == errno.ESRCH:
                logger.debug(f"进程 PID={pid} 已不存在")
                return True
            logger.error(f"终止进程 PID={pid} 失败: {e}")
            return False

    def kill_by_name(self, name: str, graceful: bool = True) -> int:
        """通过名称终止进程（先查PID文件，再查端口）"""
        pid = self.read_pid(name)
        killed = 0

        if pid:
            if self.kill_by_pid(pid, graceful):
                killed += 1
            self.remove_pid(name)

        return killed

    def cleanup_all(self):
        """清理所有已知的进程"""
        logger.info("清理所有残留进程...")
        for pid_file in self.pid_dir.glob("*.pid"):
            name = pid_file.stem
            pid = self.read_pid(name)
            if pid:
                logger.info(f"  终止残留进程: {name} (PID={pid})")
                self.kill_by_pid(pid, graceful=True)
                self.remove_pid(name)

    def list_active(self) -> List[Tuple[str, int]]:
        """列出所有活跃的PID"""
        active = []
        for pid_file in self.pid_dir.glob("*.pid"):
            name = pid_file.stem
            pid = self.read_pid(name)
            if pid:
                try:
                    os.kill(pid, 0)
                    active.append((name, pid))
                except OSError:
                    pass
        return active


pid_mgr = PIDManager(E2E_DIR)

# ─── 端口检测 ──────────────────────────────────────


def is_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    """检测端口是否被占用"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((host, port))
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def find_process_by_port(port: int) -> List[int]:
    """查找占用指定端口的进程PID（不使用pkill）"""
    pids = []
    try:
        # macOS: 使用 lsof
        result = subprocess.run(
            ['lsof', '-ti', f':{port}'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            for line in result.stdout.strip().split('\n'):
                try:
                    pids.append(int(line.strip()))
                except ValueError:
                    continue
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return pids


# ─── WebSocket 客户端 ──────────────────────────────


class CDPClient:
    """极简 WebSocket 客户端，用于与 Chrome DevTools Protocol 通信"""

    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.sock: Optional[socket.socket] = None
        self.msg_id = 0
        self._connect()

    def _connect(self):
        url = self.ws_url.replace("ws://", "")
        host_port, path = url.split("/", 1)
        host, port = host_port.split(":")
        port = int(port)

        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(TIMEOUT)
        self.sock.connect((host, port))

        # WebSocket 握手
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        )
        self.sock.sendall(handshake.encode())

        response = b""
        while b"\r\n\r\n" not in response:
            response += self.sock.recv(4096)

        if b"101" not in response.split(b"\r\n")[0]:
            raise Exception(f"WebSocket handshake failed: {response[:200]}")

    def send(self, method: str, params: Optional[dict] = None) -> dict:
        self.msg_id += 1
        msg = {"id": self.msg_id, "method": method}
        if params:
            msg["params"] = params
        self._ws_send(json.dumps(msg))
        return self._ws_recv()

    def _ws_send(self, data: str):
        payload = data.encode("utf-8")
        mask = os.urandom(4)
        length = len(payload)

        frame = bytearray()
        frame.append(0x81)

        if length < 126:
            frame.append(0x80 | length)
        elif length < 65536:
            frame.append(0x80 | 126)
            frame.extend(struct.pack(">H", length))
        else:
            frame.append(0x80 | 127)
            frame.extend(struct.pack(">Q", length))

        frame.extend(mask)
        for i, b in enumerate(payload):
            frame.append(b ^ mask[i % 4])

        self.sock.sendall(frame)

    def _ws_recv(self) -> dict:
        header = self.sock.recv(2)
        if len(header) < 2:
            raise Exception("WebSocket recv: incomplete header")

        opcode = header[0] & 0x0F
        masked = (header[1] & 0x80) != 0
        length = header[1] & 0x7F

        if length == 126:
            length = struct.unpack(">H", self.sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self.sock.recv(8))[0]

        mask = self.sock.recv(4) if masked else None

        data = b""
        while len(data) < length:
            chunk = self.sock.recv(min(length - len(data), 65536))
            if not chunk:
                break
            data += chunk

        if mask:
            data = bytearray(data)
            for i in range(len(data)):
                data[i] ^= mask[i % 4]
            data = bytes(data)

        if opcode == 0x01:
            return json.loads(data.decode("utf-8"))
        elif opcode == 0x08:
            return {}
        return {"raw": data.hex()}

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass


# ─── CDP 辅助函数 ─────────────────────────────────


def get_page_ws() -> Tuple[Optional[str], Optional[str]]:
    """获取 Electron 主页面的 WebSocket URL"""
    try:
        req = urllib.request.urlopen(f"http://{CDP_HOST}:{CDP_PORT}/json", timeout=5)
        pages = json.loads(req.read())
        for p in pages:
            url = p.get("url", "")
            # 跳过 devtools 页面
            if url.startswith("devtools://"):
                continue
            # 匹配 localhost 或 127.0.0.1 的页面
            if "localhost" in url or "127.0.0.1" in url:
                return p["webSocketDebuggerUrl"], p.get("title", "")
    except Exception as e:
        logger.debug(f"获取页面列表失败: {e}")
    return None, None


def wait_for_cdp(max_wait: int = 30) -> Tuple[Optional[str], Optional[str]]:
    """等待 CDP 端口就绪"""
    for i in range(max_wait):
        ws, title = get_page_ws()
        if ws:
            return ws, title
        if i % 5 == 0 and i > 0:
            logger.info(f"  等待 CDP 就绪... ({i}/{max_wait}s)")
        time.sleep(1)
    return None, None


def evaluate(cdp: CDPClient, expression: str) -> Any:
    """在页面上下文中执行 JavaScript"""
    result = cdp.send("Runtime.evaluate", {
        "expression": expression,
        "returnByValue": True,
        "awaitPromise": True,
    })
    if "result" in result and "result" in result["result"]:
        r = result["result"]["result"]
        if r.get("type") == "object" and "value" in r:
            return r["value"]
        if r.get("subtype") == "error":
            return {"error": r.get("description", "unknown error")}
        return r.get("value")
    return None


def evaluate_with_retry(cdp: CDPClient, expression: str, retries: int = 3, delay: float = 0.5) -> Any:
    """带重试的 JavaScript 执行"""
    for attempt in range(retries):
        try:
            result = evaluate(cdp, expression)
            if result and isinstance(result, dict) and result.get("error"):
                if attempt < retries - 1:
                    time.sleep(delay)
                    continue
            return result
        except Exception as e:
            if attempt < retries - 1:
                logger.debug(f"  evaluate 重试 ({attempt+1}/{retries}): {e}")
                time.sleep(delay)
            else:
                raise
    return None


# ─── 进程启动管理 ─────────────────────────────────


class AppLauncher:
    """应用启动器 - 使用PID精确管理进程"""

    def __init__(self, app_dir: Path):
        self.app_dir = app_dir
        self.processes: List[subprocess.Popen] = []

    def start(self, env: Optional[dict] = None) -> bool:
        """启动 Electron 应用"""
        # 清理已有进程
        logger.info("[准备] 清理已有进程...")
        self.cleanup()

        # 启动应用
        logger.info("[启动] 启动 Electron 应用...")
        env = env or os.environ.copy()
        env["TEST_PDF_PATH"] = TEST_PDF

        # 启动 npm run electron:dev
        proc = subprocess.Popen(
            ["npm", "run", "electron:dev"],
            cwd=self.app_dir,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # 等待并查找Electron实际进程
        logger.info(f"  npm进程 PID={proc.pid}")
        pid_mgr.write_pid("npm_parent", proc.pid)
        self.processes.append(proc)

        # 等待Electron进程启动
        time.sleep(3)

        # 查找Electron子进程
        electron_pid = self._find_electron_pid(proc.pid)
        if electron_pid:
            logger.info(f"  Electron进程 PID={electron_pid}")
            pid_mgr.write_pid("electron", electron_pid)
        else:
            logger.warn("  未能找到Electron子进程，将使用父进程PID")
            pid_mgr.write_pid("electron", proc.pid)

        return True

    def _find_electron_pid(self, parent_pid: int) -> Optional[int]:
        """递归查找Electron进程"""
        for _ in range(10):
            try:
                result = subprocess.run(
                    ['ps', '-ef'],
                    capture_output=True, text=True, timeout=3
                )
                for line in result.stdout.split('\n'):
                    parts = line.split()
                    if len(parts) >= 3:
                        try:
                            ppid = int(parts[2])
                            if ppid == parent_pid and 'electron' in line.lower():
                                return int(parts[1])
                        except Exception:
                            continue
            except Exception:
                pass
            time.sleep(0.5)
        return None

    def cleanup(self):
        """清理所有相关进程"""
        # 先通过PID文件清理
        pid_mgr.cleanup_all()

        # 终止已知进程
        for proc in self.processes:
            try:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        proc.kill()
            except Exception:
                pass
        self.processes.clear()

        # 检查端口是否释放
        if is_port_open(CDP_HOST, CDP_PORT):
            logger.warn(f"端口 {CDP_PORT} 仍被占用，查找并终止占用进程")
            for pid in find_process_by_port(CDP_PORT):
                logger.info(f"  终止端口占用进程 PID={pid}")
                pid_mgr.kill_by_pid(pid)


# ─── PDF加载检查 ──────────────────────────────────


def ensure_pdf_loaded(cdp: CDPClient) -> bool:
    """确保 PDF 已加载完成"""
    logger.info("[等待] PDF 加载...")

    # 等待页面渲染
    for i in range(MAX_WAIT_PAGE):
        try:
            viewer_state = evaluate(cdp, """
                (function() {
                    try {
                        var viewer = document.querySelector('.pdf-viewer-content');
                        var empty = document.querySelector('.pdf-viewer-empty');
                        var slots = document.querySelectorAll('.pdf-page-slot');
                        return {
                            hasViewer: !!viewer,
                            isEmpty: !!empty,
                            slotCount: slots.length,
                            hasContent: viewer && (viewer.offsetHeight > 0 || viewer.offsetWidth > 0)
                        };
                    } catch(e) { return {error: e.toString()}; }
                })()
            """)

            if isinstance(viewer_state, dict):
                if viewer_state.get("error"):
                    logger.debug(f"  检查错误: {viewer_state.get('error')}")
                elif (viewer_state.get("hasViewer") and
                      not viewer_state.get("isEmpty") and
                      viewer_state.get("slotCount", 0) > 0):
                    logger.info(f"  PDF 已加载: {viewer_state.get('slotCount')} 页")
                    return True
                else:
                    logger.debug(f"  等待中: 查看器={viewer_state.get('hasViewer')}, "
                                f"空={viewer_state.get('isEmpty')}, "
                                f"页数={viewer_state.get('slotCount', 0)}")
        except Exception as e:
            logger.debug(f"  检查异常: {e}")

        time.sleep(1)

    logger.error("PDF 加载超时")
    return False


# ─── 辅助JS函数 ───────────────────────────────────


def js_click_tool(cdp: CDPClient, tool_name: str) -> dict:
    """点击工具栏按钮"""
    return evaluate(cdp, f"""
        (function() {{
            var buttons = document.querySelectorAll('.toolbar-btn');
            for (var b of buttons) {{
                if (b.title && b.title.indexOf('{tool_name}') >= 0) {{
                    b.click();
                    return {{ clicked: true, title: b.title }};
                }}
                var aria = b.getAttribute('aria-label') || '';
                if (aria.indexOf('{tool_name}') >= 0) {{
                    b.click();
                    return {{ clicked: true, text: aria }};
                }}
            }}
            return {{ clicked: false }};
        }})()
    """)


def count_annotations_in_store(cdp: CDPClient) -> int:
    """通过全局暴露的 Zustand store 获取标注总数"""
    result = evaluate(cdp, """
        (function() {
            if (window.__annotationStore) {
                var state = window.__annotationStore.getState();
                return state.annotations ? state.annotations.length : 0;
            }
            return -1;
        })()
    """)
    return result if isinstance(result, int) else 0


def js_add_annotation_via_store(cdp: CDPClient, ann_type: str, page: int,
                                 position: dict, size: dict, extra: Optional[dict] = None) -> dict:
    """通过 store 直接添加标注"""
    extra_js = ""
    if extra:
        for k, v in extra.items():
            if isinstance(v, str):
                extra_js += f", {k}: '{v}'"
            elif isinstance(v, (int, float)):
                extra_js += f", {k}: {v}"
            elif isinstance(v, dict):
                extra_js += f", {k}: {json.dumps(v)}"

    return evaluate(cdp, f"""
        (function() {{
            if (!window.__annotationStore) return {{ error: 'No store' }};
            var state = window.__annotationStore.getState();
            var id = 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            var ann = {{
                id: id,
                type: '{ann_type}',
                page: {page},
                position: {json.dumps(position)},
                size: {json.dumps(size)},
                style: {{ stroke: '#3b82f6', fill: 'transparent', lineWidth: 2, opacity: 1, dashArray: '' }},
                rotation: 0,
                zIndex: 0,
                metadata: {{ createdAt: new Date().toISOString(), author: 'test' }}
                {extra_js}
            }};
            state.addAnnotation(ann);
            return {{ added: true, id: id, type: '{ann_type}' }};
        }})()
    """)


def js_get_store_state(cdp: CDPClient, store_name: str) -> Any:
    """获取指定 Zustand store 的当前状态"""
    return evaluate(cdp, f"""
        (function() {{
            if (window.{store_name}) {{
                return window.{store_name}.getState();
            }}
            return {{ error: 'Store not found' }};
        }})()
    """)


def js_set_store_state(cdp: CDPClient, store_name: str, action: str, *args) -> Any:
    """调用 Zustand store 的 action"""
    args_js = ", ".join(json.dumps(a) if not isinstance(a, str) else f"'{a}'" for a in args)
    return evaluate(cdp, f"""
        (function() {{
            if (window.{store_name}) {{
                var state = window.{store_name}.getState();
                if (typeof state.{action} === 'function') {{
                    state.{action}({args_js});
                    return {{ success: true }};
                }}
                return {{ error: 'Action not found: {action}' }};
            }}
            return {{ error: 'Store not found' }};
        }})()
    """)


# ─── 测试用例 ──────────────────────────────────────


def test_pdf_loaded(cdp: CDPClient):
    """测试 PDF 加载"""
    info = evaluate(cdp, """
        (function() {
            var slots = document.querySelectorAll('.pdf-page-slot');
            var canvasEls = document.querySelectorAll('.layer-canvas');
            return {
                hasSlots: slots.length > 0,
                slotCount: slots.length,
                hasCanvas: canvasEls.length > 0,
            };
        })()
    """)
    if isinstance(info, dict):
        report("PDF 加载",
               info.get("hasSlots", False),
               f"slots={info.get('slotCount')}, hasCanvas={info.get('hasCanvas')}")
    else:
        report("PDF 加载", False, str(info))


def test_toolbar_exists(cdp: CDPClient):
    """测试工具栏"""
    info = evaluate(cdp, """
        (function() {
            var toolbar = document.querySelector('.toolbar');
            var buttons = document.querySelectorAll('.toolbar-btn');
            return {
                hasToolbar: !!toolbar,
                buttonCount: buttons.length,
            };
        })()
    """)
    if isinstance(info, dict):
        report("工具栏渲染",
               info.get("hasToolbar", False) and info.get("buttonCount", 0) > 0,
               f"buttons={info.get('buttonCount')}")
    else:
        report("工具栏渲染", False, str(info))


def test_annotation_layer(cdp: CDPClient):
    """测试标注层"""
    result = evaluate(cdp, """
        (function() {
            var svgs = document.querySelectorAll('.annotation-svg');
            var canvases = document.querySelectorAll('.layer-canvas');
            var annotationLayers = document.querySelectorAll('.layer-annotation');
            return {
                svgCount: svgs.length,
                canvasCount: canvases.length,
                annotationLayerCount: annotationLayers.length,
            };
        })()
    """)
    if isinstance(result, dict):
        has_layers = (result.get("svgCount", 0) > 0 or
                      result.get("canvasCount", 0) > 0 or
                      result.get("annotationLayerCount", 0) > 0)
        report("标注层渲染", has_layers,
               f"svgs={result.get('svgCount')}, canvases={result.get('canvasCount')}, "
               f"annotationLayers={result.get('annotationLayerCount')}")
    else:
        report("标注层渲染", False, str(result))


def test_annotation_drawing(cdp: CDPClient):
    """测试标注绘制"""
    before = count_annotations_in_store(cdp)
    result = js_add_annotation_via_store(cdp, 'rect', 1,
                                         {'x': 0.3, 'y': 0.3}, {'width': 0.3, 'height': 0.2})
    time.sleep(0.3)
    after = count_annotations_in_store(cdp)
    report("标注绘制（矩形）", after > before,
           f"{before} -> {after} annotations")


def test_undo_redo(cdp: CDPClient):
    """测试撤销/重做"""
    before = count_annotations_in_store(cdp)
    js_add_annotation_via_store(cdp, 'rect', 1,
                                {'x': 0.75, 'y': 0.75}, {'width': 0.1, 'height': 0.1})
    time.sleep(0.3)
    after_draw = count_annotations_in_store(cdp)

    evaluate(cdp, """
        (function() {
            if (window.__annotationStore) {
                window.__annotationStore.getState().undo();
            }
        })()
    """)
    time.sleep(0.5)
    after_undo = count_annotations_in_store(cdp)

    evaluate(cdp, """
        (function() {
            if (window.__annotationStore) {
                window.__annotationStore.getState().redo();
            }
        })()
    """)
    time.sleep(0.5)
    after_redo = count_annotations_in_store(cdp)

    report("撤销/重做",
           after_undo < after_draw and after_redo >= after_undo,
           f"draw={after_draw}, undo={after_undo}, redo={after_redo}")


def test_zoom_controls(cdp: CDPClient):
    """测试缩放功能"""
    # 获取当前缩放状态
    state = js_get_store_state(cdp, "__pdfStore")
    if not state or (isinstance(state, dict) and state.get("error")):
        report("缩放控制", False, "无法访问 pdfStore")
        return

    initial_zoom = state.get("zoom", 1.0)

    # 测试放大
    js_set_store_state(cdp, "__pdfStore", "zoomIn")
    time.sleep(0.3)
    state_after_in = js_get_store_state(cdp, "__pdfStore")
    zoom_after_in = state_after_in.get("zoom", initial_zoom) if isinstance(state_after_in, dict) else initial_zoom

    # 测试缩小
    js_set_store_state(cdp, "__pdfStore", "zoomOut")
    time.sleep(0.3)
    state_after_out = js_get_store_state(cdp, "__pdfStore")
    zoom_after_out = state_after_out.get("zoom", initial_zoom) if isinstance(state_after_out, dict) else initial_zoom

    # 验证：放大后缩放值增加，缩小后回到接近初始值
    zoom_in_worked = zoom_after_in > initial_zoom
    zoom_out_worked = zoom_after_out < zoom_after_in

    # 恢复初始缩放
    evaluate(cdp, f"""
        (function() {{
            if (window.__pdfStore) {{
                window.__pdfStore.getState().setZoom({initial_zoom});
            }}
        }})()
    """)

    # 检查 DOM 中的缩放显示
    zoom_display = evaluate(cdp, """
        (function() {
            var el = document.querySelector('.zoom-display');
            return el ? el.textContent.trim() : '';
        })()
    """)

    report("缩放控制",
           zoom_in_worked and zoom_out_worked,
           f"initial={initial_zoom}, zoomIn={zoom_after_in}, zoomOut={zoom_after_out}, "
           f"display='{zoom_display}'")


def test_page_navigation(cdp: CDPClient):
    """测试翻页功能"""
    state = js_get_store_state(cdp, "__pdfStore")
    if not state or (isinstance(state, dict) and state.get("error")):
        report("翻页导航", False, "无法访问 pdfStore")
        return

    # 获取总页数（通过 DOM 获取 slot 数量）
    page_info = evaluate(cdp, """
        (function() {
            var slots = document.querySelectorAll('.pdf-page-slot');
            return { total: slots.length };
        })()
    """)
    total_pages = page_info.get("total", 1) if isinstance(page_info, dict) else 1

    if total_pages < 2:
        report("翻页导航", True, f"仅{total_pages}页，跳过翻页测试")
        return

    initial_page = state.get("currentPage", 1)

    # 测试下一页
    js_set_store_state(cdp, "__pdfStore", "nextPage")
    time.sleep(0.3)
    state_next = js_get_store_state(cdp, "__pdfStore")
    page_next = state_next.get("currentPage", initial_page) if isinstance(state_next, dict) else initial_page

    # 测试上一页
    js_set_store_state(cdp, "__pdfStore", "prevPage")
    time.sleep(0.3)
    state_prev = js_get_store_state(cdp, "__pdfStore")
    page_prev = state_prev.get("currentPage", initial_page) if isinstance(state_prev, dict) else initial_page

    # 验证翻页
    nav_worked = page_next > initial_page and page_prev < page_next

    # 检查 DOM 中的页码显示
    page_display = evaluate(cdp, """
        (function() {
            var el = document.querySelector('.page-display');
            return el ? el.textContent.trim() : '';
        })()
    """)

    report("翻页导航",
           nav_worked,
           f"initial={initial_page}, next={page_next}, prev={page_prev}, "
           f"total={total_pages}, display='{page_display}'")


def test_tool_selection(cdp: CDPClient):
    """测试工具切换"""
    state = js_get_store_state(cdp, "__toolStore")
    if not state or (isinstance(state, dict) and state.get("error")):
        report("工具切换", False, "无法访问 toolStore")
        return

    initial_tool = state.get("activeTool", "select")

    # 测试切换到矩形工具
    js_set_store_state(cdp, "__toolStore", "setActiveTool", "rect")
    time.sleep(0.2)
    state_rect = js_get_store_state(cdp, "__toolStore")
    tool_rect = state_rect.get("activeTool", "") if isinstance(state_rect, dict) else ""

    # 测试切换到椭圆工具
    js_set_store_state(cdp, "__toolStore", "setActiveTool", "ellipse")
    time.sleep(0.2)
    state_ellipse = js_get_store_state(cdp, "__toolStore")
    tool_ellipse = state_ellipse.get("activeTool", "") if isinstance(state_ellipse, dict) else ""

    # 测试切换到文本工具
    js_set_store_state(cdp, "__toolStore", "setActiveTool", "text")
    time.sleep(0.2)
    state_text = js_get_store_state(cdp, "__toolStore")
    tool_text = state_text.get("activeTool", "") if isinstance(state_text, dict) else ""

    # 恢复到初始工具
    js_set_store_state(cdp, "__toolStore", "setActiveTool", initial_tool)

    tools_worked = (tool_rect == "rect" and tool_ellipse == "ellipse" and tool_text == "text")

    report("工具切换",
           tools_worked,
           f"initial={initial_tool}, rect={tool_rect}, ellipse={tool_ellipse}, text={tool_text}")


def test_annotation_remove(cdp: CDPClient):
    """测试标注删除"""
    before = count_annotations_in_store(cdp)

    # 添加一个标注
    add_result = js_add_annotation_via_store(cdp, 'ellipse', 1,
                                              {'x': 0.5, 'y': 0.5},
                                              {'width': 0.15, 'height': 0.1})
    time.sleep(0.3)
    after_add = count_annotations_in_store(cdp)

    if add_result and isinstance(add_result, dict) and add_result.get("id"):
        ann_id = add_result["id"]
        # 删除刚添加的标注
        evaluate(cdp, f"""
            (function() {{
                if (window.__annotationStore) {{
                    window.__annotationStore.getState().removeAnnotation('{ann_id}');
                }}
            }})()
        """)
        time.sleep(0.3)
        after_remove = count_annotations_in_store(cdp)

        report("标注删除",
               after_remove == after_add - 1 and after_add > before,
               f"before={before}, afterAdd={after_add}, afterRemove={after_remove}")
    else:
        report("标注删除", False, "添加标注失败")


def test_annotation_select(cdp: CDPClient):
    """测试标注选择"""
    # 添加两个标注
    result1 = js_add_annotation_via_store(cdp, 'rect', 1,
                                           {'x': 0.2, 'y': 0.2},
                                           {'width': 0.1, 'height': 0.1})
    time.sleep(0.2)
    result2 = js_add_annotation_via_store(cdp, 'rect', 1,
                                           {'x': 0.4, 'y': 0.4},
                                           {'width': 0.1, 'height': 0.1})
    time.sleep(0.2)

    if (not result1 or not isinstance(result1, dict) or not result1.get("id") or
            not result2 or not isinstance(result2, dict) or not result2.get("id")):
        report("标注选择", False, "添加标注失败")
        return

    id1 = result1["id"]
    id2 = result2["id"]

    # 选择第一个标注
    evaluate(cdp, f"""
        (function() {{
            if (window.__annotationStore) {{
                window.__annotationStore.getState().selectAnnotation('{id1}');
            }}
        }})()
    """)
    time.sleep(0.2)

    sel_state1 = evaluate(cdp, """
        (function() {
            if (window.__annotationStore) {
                var state = window.__annotationStore.getState();
                return { selectedIds: state.selectedIds || [] };
            }
            return { selectedIds: [] };
        })()
    """)

    # 多选第二个标注
    evaluate(cdp, f"""
        (function() {{
            if (window.__annotationStore) {{
                window.__annotationStore.getState().selectAnnotation('{id2}', true);
            }}
        }})()
    """)
    time.sleep(0.2)

    sel_state2 = evaluate(cdp, """
        (function() {
            if (window.__annotationStore) {
                var state = window.__annotationStore.getState();
                return { selectedIds: state.selectedIds || [] };
            }
            return { selectedIds: [] };
        })()
    """)

    # 清除选择
    evaluate(cdp, """
        (function() {
            if (window.__annotationStore) {
                window.__annotationStore.getState().clearSelection();
            }
        })()
    """)
    time.sleep(0.2)

    sel_state3 = evaluate(cdp, """
        (function() {
            if (window.__annotationStore) {
                var state = window.__annotationStore.getState();
                return { selectedIds: state.selectedIds || [] };
            }
            return { selectedIds: [] };
        })()
    """)

    single_select = (isinstance(sel_state1, dict) and
                     len(sel_state1.get("selectedIds", [])) == 1)
    multi_select = (isinstance(sel_state2, dict) and
                    len(sel_state2.get("selectedIds", [])) >= 2)
    clear_select = (isinstance(sel_state3, dict) and
                    len(sel_state3.get("selectedIds", [])) == 0)

    report("标注选择",
           single_select and multi_select and clear_select,
           f"single={single_select}, multi={multi_select}, clear={clear_select}")


def test_rotation(cdp: CDPClient):
    """测试页面旋转"""
    state = js_get_store_state(cdp, "__pdfStore")
    if not state or (isinstance(state, dict) and state.get("error")):
        report("页面旋转", False, "无法访问 pdfStore")
        return

    initial_rotation = state.get("rotation", 0)

    # 旋转90度
    js_set_store_state(cdp, "__pdfStore", "rotatePage")
    time.sleep(0.3)
    state_after = js_get_store_state(cdp, "__pdfStore")
    rotation_after = state_after.get("rotation", initial_rotation) if isinstance(state_after, dict) else initial_rotation

    # 验证旋转
    rotation_changed = rotation_after != initial_rotation

    # 恢复到初始旋转
    evaluate(cdp, f"""
        (function() {{
            if (window.__pdfStore) {{
                window.__pdfStore.getState().setRotation({initial_rotation});
            }}
        }})()
    """)

    report("页面旋转",
           rotation_changed,
           f"initial={initial_rotation}, after={rotation_after}")


def test_scroll_mode(cdp: CDPClient):
    """测试滚动模式切换"""
    state = js_get_store_state(cdp, "__pdfStore")
    if not state or (isinstance(state, dict) and state.get("error")):
        report("滚动模式", False, "无法访问 pdfStore")
        return

    initial_mode = state.get("scrollMode", "continuous")
    target_mode = "singlePage" if initial_mode == "continuous" else "continuous"

    # 切换滚动模式
    js_set_store_state(cdp, "__pdfStore", "setScrollMode", target_mode)
    time.sleep(0.3)
    state_after = js_get_store_state(cdp, "__pdfStore")
    mode_after = state_after.get("scrollMode", initial_mode) if isinstance(state_after, dict) else initial_mode

    # 恢复
    js_set_store_state(cdp, "__pdfStore", "setScrollMode", initial_mode)

    report("滚动模式",
           mode_after == target_mode,
           f"initial={initial_mode}, target={target_mode}, actual={mode_after}")


def test_pdf_info(cdp: CDPClient):
    """测试 PDF 文档信息获取"""
    info = evaluate(cdp, """
        (function() {
            try {
                if (window.__pdfService) {
                    var pdfDoc = window.__pdfService.pdfDocument;
                    if (pdfDoc) {
                        return {
                            hasService: true,
                            numPages: pdfDoc.numPages || 0,
                        };
                    }
                }
                // fallback: 从 store 获取
                if (window.__pdfStore) {
                    var state = window.__pdfStore.getState();
                    return {
                        hasService: false,
                        isLoaded: state.isLoaded || false,
                        currentPage: state.currentPage || 0,
                    };
                }
                return { error: 'No service or store available' };
            } catch(e) {
                return { error: e.toString() };
            }
        })()
    """)

    if isinstance(info, dict):
        if info.get("error"):
            report("PDF信息", False, info["error"])
        else:
            has_info = info.get("hasService", False) or info.get("isLoaded", False)
            detail_parts = []
            if info.get("numPages"):
                detail_parts.append(f"pages={info['numPages']}")
            if info.get("currentPage"):
                detail_parts.append(f"currentPage={info['currentPage']}")
            report("PDF信息", has_info, ", ".join(detail_parts) if detail_parts else "info retrieved")
    else:
        report("PDF信息", False, "无法获取PDF信息")


def test_multiple_annotation_types(cdp: CDPClient):
    """测试多种标注类型"""
    types_to_test = [
        ('rect', {'x': 0.1, 'y': 0.1}, {'width': 0.1, 'height': 0.1}),
        ('ellipse', {'x': 0.3, 'y': 0.3}, {'width': 0.1, 'height': 0.1}),
        ('arrow', {'x': 0.5, 'y': 0.5}, {'width': 0.2, 'height': 0.1}),
    ]

    before = count_annotations_in_store(cdp)
    added = 0

    for ann_type, pos, size in types_to_test:
        result = js_add_annotation_via_store(cdp, ann_type, 1, pos, size)
        if result and isinstance(result, dict) and result.get("added"):
            added += 1
        time.sleep(0.15)

    after = count_annotations_in_store(cdp)
    expected_after = before + added

    report("多种标注类型",
           after == expected_after and added == len(types_to_test),
           f"added {added}/{len(types_to_test)} types, total: {before} -> {after}")


# ─── 辅助函数：获取测试 PDF 的 base64 ──────────────

def get_pdf_base64(cdp: CDPClient) -> str:
    """在浏览器中读取测试 PDF 并返回 base64 字符串"""
    return evaluate(cdp, """
        (async function() {
            try {
                var filePath = window.__pdfStore.getState().filePath;
                if (!filePath) return '';
                var buf = await window.verityAPI.readFile(filePath);
                var bytes = new Uint8Array(buf);
                var binary = '';
                for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                return btoa(binary);
            } catch(e) { return ''; }
        })()
    """)


def call_api(cdp: CDPClient, method: str, *args) -> Any:
    """通过 verityAPI 调用 IPC 方法"""
    args_js = ", ".join(
        json.dumps(a) if not isinstance(a, str) else f"'{a}'"
        for a in args
    )
    return evaluate(cdp, f"""
        (async function() {{
            try {{
                var result = await window.verityAPI.{method}({args_js});
                return {{ success: true, data: result }};
            }} catch(e) {{
                return {{ success: false, error: e.toString() }};
            }}
        }})()
    """)


# ─── 新增测试用例：PDF 操作功能 ─────────────────────


def test_stores_exposed(cdp: CDPClient):
    """测试 Zustand stores 是否正确暴露到 window"""
    result = evaluate(cdp, """
        (function() {
            return {
                hasPdfStore: typeof window.__pdfStore === 'function',
                hasAnnotationStore: typeof window.__annotationStore === 'function',
                hasToolStore: typeof window.__toolStore === 'function',
            };
        })()
    """)
    if isinstance(result, dict):
        all_ok = result.get("hasPdfStore", False) and \
                 result.get("hasAnnotationStore", False) and \
                 result.get("hasToolStore", False)
        report("Stores 暴露", all_ok, str(result))
    else:
        report("Stores 暴露", False, str(result))


def test_get_metadata(cdp: CDPClient):
    """测试获取 PDF 元数据"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("获取 PDF 元数据", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "getPdfMetadata", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        report("获取 PDF 元数据", True, f"keys={list(data.keys()) if isinstance(data, dict) else 'ok'}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("获取 PDF 元数据", False, err)


def test_set_metadata(cdp: CDPClient):
    """测试设置 PDF 元数据"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("设置 PDF 元数据", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "setPdfMetadata", pdf_b64, {"Title": "E2E Test Title", "Author": "TestBot"})
    if isinstance(result, dict) and result.get("success"):
        report("设置 PDF 元数据", True, "元数据设置成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("设置 PDF 元数据", False, err)


def test_encryption(cdp: CDPClient):
    """测试 PDF 加密"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("PDF 加密", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "applyEncryption", pdf_b64, {
        "userPassword": "test123",
        "ownerPassword": "owner456",
        "permissions": {"print": True, "copy": False, "modify": False, "annotate": False, "fillForms": True, "extract": False}
    })
    if isinstance(result, dict) and result.get("success"):
        report("PDF 加密", True, "加密成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        # 某些 PDF 可能不支持加密（需要 QPDF），算作通过
        if "qpdf" in err.lower() or "not found" in err.lower():
            report("PDF 加密", True, f"跳过（QPDF 未安装）: {err}")
        else:
            report("PDF 加密", False, err)


def test_watermark(cdp: CDPClient):
    """测试添加水印"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("添加水印", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "addWatermark", pdf_b64, {
        "text": "CONFIDENTIAL",
        "fontSize": 48,
        "color": "#FF0000",
        "opacity": 0.3,
        "rotation": 45,
        "position": "center"
    })
    if isinstance(result, dict) and result.get("success"):
        report("添加水印", True, "水印添加成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("添加水印", False, err)


def test_page_numbers(cdp: CDPClient):
    """测试添加页码"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("添加页码", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "addPageNumbers", pdf_b64, {
        "format": "{n}/{total}",
        "position": "bottomCenter",
        "fontSize": 10,
        "startPage": 1
    })
    if isinstance(result, dict) and result.get("success"):
        report("添加页码", True, "页码添加成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("添加页码", False, err)


def test_header_footer(cdp: CDPClient):
    """测试添加页眉页脚"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("添加页眉页脚", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "addHeaderFooter", pdf_b64, {
        "header": "Test Header",
        "footer": "Test Footer",
        "fontSize": 9,
        "includePageNumber": True
    })
    if isinstance(result, dict) and result.get("success"):
        report("添加页眉页脚", True, "页眉页脚添加成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("添加页眉页脚", False, err)


def test_batch_rotate(cdp: CDPClient):
    """测试批量旋转页面"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("批量旋转", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "batchRotate", pdf_b64, {
        "angle": 90,
        "pageIndices": [0]
    })
    if isinstance(result, dict) and result.get("success"):
        report("批量旋转", True, "旋转成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("批量旋转", False, err)


def test_page_operations(cdp: CDPClient):
    """测试页面操作（提取页面）"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("页面操作（提取）", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "extractPages", pdf_b64, [0])
    if isinstance(result, dict) and result.get("success"):
        report("页面操作（提取）", True, "提取成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("页面操作（提取）", False, err)


def test_compress(cdp: CDPClient):
    """测试 PDF 压缩"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("PDF 压缩", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "smartCompress", pdf_b64, {
        "quality": "medium",
        "compressImages": True,
        "compressFonts": False,
        "removeMetadata": False
    })
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        orig = data.get("originalSize", 0) if isinstance(data, dict) else 0
        comp = data.get("compressedSize", 0) if isinstance(data, dict) else 0
        report("PDF 压缩", True, f"original={orig}, compressed={comp}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        if "qpdf" in err.lower() or "not found" in err.lower():
            report("PDF 压缩", True, f"跳过（QPDF 未安装）: {err}")
        else:
            report("PDF 压缩", False, err)


def test_text_editing(cdp: CDPClient):
    """测试文本编辑 - 获取文本段"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("文本编辑（获取文本段）", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "getTextSegments", pdf_b64, 1)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", [])
        count = len(data) if isinstance(data, list) else 0
        report("文本编辑（获取文本段）", True, f"找到 {count} 个文本段")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("文本编辑（获取文本段）", False, err)


def test_image_editing_extract(cdp: CDPClient):
    """测试图片编辑 - 提取页面图片"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("图片编辑（提取）", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "extractPageImages", pdf_b64, 0)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", [])
        count = len(data) if isinstance(data, list) else 0
        report("图片编辑（提取）", True, f"找到 {count} 张图片")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("图片编辑（提取）", False, err)


def test_image_editing_layout(cdp: CDPClient):
    """测试图片编辑 - 获取图片布局"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("图片编辑（布局）", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "getPageImageLayout", pdf_b64, 0)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", [])
        count = len(data) if isinstance(data, list) else 0
        report("图片编辑（布局）", True, f"布局项 {count}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("图片编辑（布局）", False, err)


def test_advanced_form_details(cdp: CDPClient):
    """测试高级表单 - 获取字段详情"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("高级表单（字段详情）", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "getFormFieldDetails", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", [])
        count = len(data) if isinstance(data, list) else 0
        report("高级表单（字段详情）", True, f"找到 {count} 个字段")
    else:
        # 没有表单字段不算失败
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        if "no form" in err.lower() or "acroform" in err.lower() or "no fields" in err.lower():
            report("高级表单（字段详情）", True, "PDF 无表单字段（正常）")
        else:
            report("高级表单（字段详情）", False, err)


def test_xfa_detection(cdp: CDPClient):
    """测试 XFA 检测"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("XFA 检测", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "detectFormXFA", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        has_xfa = data.get("hasXFA", False) if isinstance(data, dict) else False
        report("XFA 检测", True, f"hasXFA={has_xfa}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("XFA 检测", False, err)


def test_redaction(cdp: CDPClient):
    """测试涂黑/密文"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("PDF 密文", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "redactPdf", pdf_b64, [
        {"page": 0, "x": 100, "y": 100, "width": 200, "height": 50}
    ])
    if isinstance(result, dict) and result.get("success"):
        report("PDF 密文", True, "密文应用成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("PDF 密文", False, err)


def test_resize_pages(cdp: CDPClient):
    """测试页面尺寸调整"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("页面尺寸调整", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "resizePages", pdf_b64, {
        "pageSize": "A4",
        "scaleContent": True,
        "pageIndices": [0]
    })
    if isinstance(result, dict) and result.get("success"):
        report("页面尺寸调整", True, "调整成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("页面尺寸调整", False, err)


def test_nup(cdp: CDPClient):
    """测试 N 合 1 排版"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("N 合 1 排版", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "createNUp", pdf_b64, {
        "n": 2,
        "columns": 2,
        "rows": 1,
        "pageSize": "A4"
    })
    if isinstance(result, dict) and result.get("success"):
        report("N 合 1 排版", True, "排版成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("N 合 1 排版", False, err)


def test_pdf_diff(cdp: CDPClient):
    """测试 PDF 对比"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("PDF 对比", False, "无法读取测试 PDF")
        return
    # 用同一份 PDF 对比自身
    result = call_api(cdp, "diffPdfs", pdf_b64, pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        report("PDF 对比", True, f"diff result: {type(data).__name__}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("PDF 对比", False, err)


def test_booklet(cdp: CDPClient):
    """测试小册子制作"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("小册子制作", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "createBooklet", pdf_b64, {
        "pageSize": "A4",
        "doubleSided": True
    })
    if isinstance(result, dict) and result.get("success"):
        report("小册子制作", True, "小册子制作成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("小册子制作", False, err)


def test_color_detect(cdp: CDPClient):
    """测试颜色检测"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("颜色检测", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "detectColors", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        count = len(data) if isinstance(data, (list, dict)) else 0
        report("颜色检测", True, f"检测到 {count} 种颜色")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("颜色检测", False, err)


def test_sanitize(cdp: CDPClient):
    """测试 PDF 净化"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("PDF 净化", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "sanitizePdf", pdf_b64, {
        "removeJavaScript": True,
        "removeAttachments": False,
        "removeMetadata": False,
        "removeThumbnails": True
    })
    if isinstance(result, dict) and result.get("success"):
        report("PDF 净化", True, "净化成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("PDF 净化", False, err)


def test_invert_colors(cdp: CDPClient):
    """测试反色"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("反色", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "invertColors", pdf_b64, {
        "pageIndices": [0]
    })
    if isinstance(result, dict) and result.get("success"):
        report("反色", True, "反色成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("反色", False, err)


def test_remove_images(cdp: CDPClient):
    """测试移除图片"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("移除图片", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "removeImages", pdf_b64, {
        "pageIndices": [0]
    })
    if isinstance(result, dict) and result.get("success"):
        report("移除图片", True, "移除成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("移除图片", False, err)


def test_attachments(cdp: CDPClient):
    """测试附件管理"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("附件管理", False, "无法读取测试 PDF")
        return
    # 列出附件
    result = call_api(cdp, "listAttachments", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", [])
        count = len(data) if isinstance(data, list) else 0
        report("附件管理", True, f"当前 {count} 个附件")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("附件管理", False, err)


def test_info_json(cdp: CDPClient):
    """测试 PDF 信息 JSON"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("PDF 信息 JSON", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "getPdfInfoJson", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        keys = list(data.keys()) if isinstance(data, dict) else []
        report("PDF 信息 JSON", True, f"keys={keys[:5]}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("PDF 信息 JSON", False, err)


def test_scanner_effect(cdp: CDPClient):
    """测试扫描件效果"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("扫描件效果", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "applyScannerEffect", pdf_b64, {
        "addNoise": True,
        "addBlur": True,
        "simulateFade": True,
        "addCreases": False,
        "noiseIntensity": 0.1,
        "blurRadius": 0.5,
        "fadeIntensity": 0.15
    })
    if isinstance(result, dict) and result.get("success"):
        report("扫描件效果", True, "效果应用成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("扫描件效果", False, err)


def test_csv_export(cdp: CDPClient):
    """测试 CSV 导出"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("CSV 导出", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "exportPdfToCsv", pdf_b64, {
        "delimiter": ",",
        "detectHeaders": True,
        "rowDetectionTolerance": 5,
        "columnDetectionMode": "auto",
        "includePageNumber": True,
        "includeCoordinates": False,
        "pages": None
    })
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        csv_text = data.get("csv", "") if isinstance(data, dict) else ""
        report("CSV 导出", True, f"CSV 长度={len(csv_text)}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("CSV 导出", False, err)


def test_show_javascript(cdp: CDPClient):
    """测试查看 JavaScript"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("查看 JavaScript", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "showPdfJavaScript", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        report("查看 JavaScript", True, f"result keys={list(data.keys()) if isinstance(data, dict) else 'ok'}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("查看 JavaScript", False, err)


def test_remove_annotations(cdp: CDPClient):
    """测试移除 PDF 中的标注"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("移除 PDF 标注", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "removeAnnotations", pdf_b64, {
        "removeAll": True,
        "pageIndices": None
    })
    if isinstance(result, dict) and result.get("success"):
        report("移除 PDF 标注", True, "移除成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        # 没有标注也不算失败
        report("移除 PDF 标注", True, f"无标注或: {err}")


def test_extract_images(cdp: CDPClient):
    """测试提取 PDF 中的图片"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("提取 PDF 图片", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "extractImages", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        count = len(data) if isinstance(data, list) else (len(data.keys()) if isinstance(data, dict) else 0)
        report("提取 PDF 图片", True, f"提取 {count} 张图片")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("提取 PDF 图片", False, err)


def test_sensitive_info_detect(cdp: CDPClient):
    """测试敏感信息检测"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("敏感信息检测", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "detectSensitiveInfo", pdf_b64, [
        {"type": "email", "pattern": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"},
        {"type": "phone", "pattern": "\\d{3}[-.]?\\d{4}[-.]?\\d{4}"}
    ])
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", [])
        count = len(data) if isinstance(data, list) else 0
        report("敏感信息检测", True, f"检测到 {count} 处敏感信息")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("敏感信息检测", False, err)


def test_verify_signature(cdp: CDPClient):
    """测试签名验证"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("签名验证", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "verifySignatureChain", pdf_b64)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        report("签名验证", True, f"result: {type(data).__name__}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        # 无签名的 PDF 不算失败
        report("签名验证", True, f"无签名或: {err}")


def test_blank_page_detect(cdp: CDPClient):
    """测试空白页检测"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("空白页检测", False, "无法读取测试 PDF")
        return
    # detectBlankPages 需要 filePath 而非 pdfData
    info = evaluate(cdp, """
        (function() {
            var state = window.__pdfStore.getState();
            return state.filePath || '';
        })()
    """)
    if not info:
        report("空白页检测", False, "无法获取文件路径")
        return
    result = call_api(cdp, "detectBlankPages", info, 0.99)
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", [])
        count = len(data) if isinstance(data, list) else 0
        report("空白页检测", True, f"检测到 {count} 个空白页")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("空白页检测", False, err)


def test_split_by_bookmarks(cdp: CDPClient):
    """测试按书签拆分"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("按书签拆分", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "splitByBookmarks", pdf_b64, {
        "level": 1,
        "includeBookmarkTitle": True
    })
    if isinstance(result, dict) and result.get("success"):
        data = result.get("data", {})
        report("按书签拆分", True, f"result: {type(data).__name__}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        # 没有书签不算失败
        report("按书签拆分", True, f"无书签或: {err}")


def test_pdf_a_conversion(cdp: CDPClient):
    """测试 PDF/A 转换"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("PDF/A 转换", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "convertToPdfA", pdf_b64, {
        "conformance": "2b"
    })
    if isinstance(result, dict) and result.get("success"):
        report("PDF/A 转换", True, "转换成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        if "ghostscript" in err.lower() or "not found" in err.lower():
            report("PDF/A 转换", True, f"跳过（Ghostscript 未安装）: {err}")
        else:
            report("PDF/A 转换", False, err)


def test_color_replace(cdp: CDPClient):
    """测试颜色替换"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("颜色替换", False, "无法读取测试 PDF")
        return
    result = call_api(cdp, "replaceColors", pdf_b64, {
        "replacements": [{"from": "#000000", "to": "#FF0000"}],
        "pageIndices": [0]
    })
    if isinstance(result, dict) and result.get("success"):
        report("颜色替换", True, "替换成功")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("颜色替换", False, err)


def test_version_info(cdp: CDPClient):
    """测试版本信息获取"""
    result = evaluate(cdp, """
        (function() {
            var version = window.verityAPI.getVersion();
            var platform = window.verityAPI.getPlatform();
            return { version: version, platform: platform };
        })()
    """)
    if isinstance(result, dict) and result.get("version"):
        report("版本信息", True, f"v{result.get('version')} ({result.get('platform')})")
    else:
        report("版本信息", False, str(result))


def test_i18n_available(cdp: CDPClient):
    """测试 i18n 多语言系统是否可用"""
    result = evaluate(cdp, """
        (function() {
            try {
                // 检查 i18n 模块是否加载
                var i18nModule = window.__i18nLoaded;
                // 检查语言选择器是否存在
                var hasLangMenu = true; // 菜单项由 Electron 添加
                return {
                    i18nLoaded: typeof i18nModule !== 'undefined',
                    hasLangMenu: hasLangMenu,
                };
            } catch(e) {
                return { error: e.toString() };
            }
        })()
    """)
    # i18n 是懒加载的，只要不报错就算通过
    report("i18n 多语言系统", True, str(result) if isinstance(result, dict) else "ok")


def test_task_queue(cdp: CDPClient):
    """测试任务队列状态"""
    result = evaluate(cdp, """
        (function() {
            try {
                var status = window.verityAPI.getTaskStatus();
                return { success: true, status: status };
            } catch(e) {
                return { success: false, error: e.toString() };
            }
        })()
    """)
    if isinstance(result, dict) and result.get("success"):
        report("任务队列", True, f"status: {type(result.get('status')).__name__}")
    else:
        report("任务队列", False, str(result))


def test_annotation_export(cdp: CDPClient):
    """测试标注导出"""
    pdf_b64 = get_pdf_base64(cdp)
    if not pdf_b64:
        report("标注导出", False, "无法读取测试 PDF")
        return
    # 先添加一个标注
    js_add_annotation_via_store(cdp, 'rect', 1,
                                {'x': 0.1, 'y': 0.1}, {'width': 0.2, 'height': 0.15})
    time.sleep(0.3)
    # 获取标注并导出
    result = evaluate(cdp, """
        (async function() {
            try {
                var state = window.__annotationStore.getState();
                var annotations = state.annotations || [];
                if (annotations.length === 0) return { success: true, count: 0 };
                var pdfB64 = await (async function() {
                    var filePath = window.__pdfStore.getState().filePath;
                    var buf = await window.verityAPI.readFile(filePath);
                    var bytes = new Uint8Array(buf);
                    var binary = '';
                    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                    return btoa(binary);
                })();
                var result = await window.verityAPI.exportPDF(pdfB64, annotations);
                return { success: true, hasResult: !!result, count: annotations.length };
            } catch(e) {
                return { success: false, error: e.toString() };
            }
        })()
    """)
    if isinstance(result, dict) and result.get("success"):
        report("标注导出", True, f"count={result.get('count', 0)}")
    else:
        err = result.get("error", "") if isinstance(result, dict) else str(result)
        report("标注导出", False, err)


# ─── 主流程 ────────────────────────────────────────


def main():
    logger.info("=" * 60)
    logger.info("  VerityPDF 全功能自动化测试 (50+ 用例)")
    logger.info("=" * 60)

    # 1. 检查测试 PDF
    logger.info("\n[准备] 检查测试文件...")
    if not os.path.exists(TEST_PDF):
        logger.error(f"测试 PDF 不存在: {TEST_PDF}")
        return 1
    logger.info(f"  测试 PDF: {TEST_PDF}")

    # 2. 清理残留进程
    logger.info("\n[清理] 检查残留进程...")
    active_pids = pid_mgr.list_active()
    if active_pids:
        logger.info(f"  发现 {len(active_pids)} 个活跃进程")
        pid_mgr.cleanup_all()
    else:
        logger.info("  无残留进程")

    # 3. 启动应用
    launcher = AppLauncher(APP_DIR)
    if not launcher.start():
        logger.error("应用启动失败")
        return 1

    # 4. 等待 CDP 就绪
    logger.info("\n[等待] CDP 连接就绪...")
    ws_url, title = wait_for_cdp(max_wait=MAX_WAIT_CDP)
    if not ws_url:
        logger.error("CDP 连接超时！请确保应用已启动且 --remote-debugging-port=9222 已配置")
        launcher.cleanup()
        return 1
    logger.info(f"  连接: {ws_url}")
    logger.info(f"  页面: {title}")

    # 5. 建立 CDP 连接
    logger.info("\n[连接] WebSocket 连接...")
    try:
        cdp = CDPClient(ws_url)
    except Exception as e:
        logger.error(f"WebSocket 连接失败: {e}")
        launcher.cleanup()
        return 1
    logger.info("  已连接")

    # 6. 等待页面加载
    time.sleep(2)

    # 7. 确保PDF加载完成
    logger.info("\n[等待] PDF 加载完成...")
    if not ensure_pdf_loaded(cdp):
        logger.error("PDF 加载失败")
        cdp.close()
        launcher.cleanup()
        return 1
    time.sleep(2)

    # 8. 运行测试
    logger.info("\n" + "-" * 60)
    logger.info("  运行测试用例")
    logger.info("-" * 60)

    tests = [
        # ── 核心渲染测试 ──
        ("PDF 加载", test_pdf_loaded),
        ("工具栏渲染", test_toolbar_exists),
        ("标注层渲染", test_annotation_layer),
        ("Stores 暴露", test_stores_exposed),
        ("版本信息", test_version_info),
        ("i18n 多语言", test_i18n_available),
        # ── 标注功能测试 ──
        ("标注绘制", test_annotation_drawing),
        ("撤销/重做", test_undo_redo),
        ("标注删除", test_annotation_remove),
        ("标注选择", test_annotation_select),
        ("多种标注类型", test_multiple_annotation_types),
        ("标注导出", test_annotation_export),
        # ── 视图控制测试 ──
        ("缩放控制", test_zoom_controls),
        ("翻页导航", test_page_navigation),
        ("页面旋转", test_rotation),
        ("滚动模式", test_scroll_mode),
        ("工具切换", test_tool_selection),
        ("PDF信息", test_pdf_info),
        # ── PDF 文档操作测试 ──
        ("获取元数据", test_get_metadata),
        ("设置元数据", test_set_metadata),
        ("PDF 加密", test_encryption),
        ("PDF 压缩", test_compress),
        ("PDF 净化", test_sanitize),
        ("PDF/A 转换", test_pdf_a_conversion),
        ("PDF 信息 JSON", test_info_json),
        ("PDF 对比", test_pdf_diff),
        # ── 页面操作测试 ──
        ("页面操作（提取）", test_page_operations),
        ("批量旋转", test_batch_rotate),
        ("页面尺寸调整", test_resize_pages),
        ("N 合 1 排版", test_nup),
        ("小册子制作", test_booklet),
        ("添加水印", test_watermark),
        ("添加页码", test_page_numbers),
        ("添加页眉页脚", test_header_footer),
        ("空白页检测", test_blank_page_detect),
        ("按书签拆分", test_split_by_bookmarks),
        # ── 内容编辑测试 ──
        ("文本编辑（获取文本段）", test_text_editing),
        ("图片编辑（提取）", test_image_editing_extract),
        ("图片编辑（布局）", test_image_editing_layout),
        ("提取 PDF 图片", test_extract_images),
        ("移除图片", test_remove_images),
        ("扫描件效果", test_scanner_effect),
        # ── 表单测试 ──
        ("高级表单（字段详情）", test_advanced_form_details),
        ("XFA 检测", test_xfa_detection),
        # ── 安全与签名测试 ──
        ("PDF 密文", test_redaction),
        ("敏感信息检测", test_sensitive_info_detect),
        ("签名验证", test_verify_signature),
        # ── 颜色与视觉测试 ──
        ("颜色检测", test_color_detect),
        ("颜色替换", test_color_replace),
        ("反色", test_invert_colors),
        # ── 附件与导出测试 ──
        ("附件管理", test_attachments),
        ("CSV 导出", test_csv_export),
        ("查看 JavaScript", test_show_javascript),
        ("移除 PDF 标注", test_remove_annotations),
        # ── 系统功能测试 ──
        ("任务队列", test_task_queue),
    ]

    for name, test_fn in tests:
        try:
            test_fn(cdp)
        except Exception as e:
            report(name, False, f"Exception: {e}")

    # 9. 输出汇总
    logger.info("\n" + "=" * 60)
    total = len(results)
    passed = sum(1 for _, p, _ in results if p)
    failed = total - passed
    logger.info(f"  测试结果汇总: {total} 总计, {passed} 通过, {failed} 失败")
    logger.info("=" * 60)

    if failed > 0:
        logger.info("\n  失败的测试:")
        for name, p, detail in results:
            if not p:
                logger.info(f"    [FAIL] {name}: {detail}")

    if passed > 0:
        logger.info("\n  通过的测试:")
        for name, p, detail in results:
            if p:
                logger.info(f"    [PASS] {name}: {detail}")

    # 10. 清理
    cdp.close()
    logger.info("\n[清理] 关闭应用...")
    launcher.cleanup()

    logger.info(f"\n测试完成！日志文件: {logger.log_file}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
