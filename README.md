# JS Reverse MCP

基于 Chrome DevTools Protocol (CDP) 的 MCP 服务器，让 AI 编码助手（Claude、Cursor、Windsurf 等）能够直接控制浏览器进行 JavaScript 调试、逆向分析、网页抓取和 API 调试。

> 基于 [google-deepmind/chrome-devtools-mcp](https://github.com/google-deepmind/chrome-devtools-mcp) v0.10.2，添加了逆向工程相关工具增强。

## 功能特点

- **JS 调试**: 断点、单步执行、调用栈、作用域变量检查
- **脚本分析**: 搜索/获取所有加载的 JS 脚本源码，精确定位压缩文件中的位置
- **函数 Hook**: Hook 任意函数（包括 webpack/rollup 模块内部函数），记录调用和返回值
- **反混淆**: 变量名还原、控制流分析、字符串解密（Base64/Hex/Unicode）
- **加密检测**: 自动识别 CryptoJS、WebCrypto 等加密库，Hook 加密调用
- **网络分析**: 请求拦截/修改/Mock、XHR 断点、WebSocket 监控、请求调用栈追踪
- **网页抓取**: CSS 选择器提取、表格/链接/结构化数据/元数据提取
- **API 调试**: 在浏览器上下文中发送 HTTP 请求，管理多账号 Token，Firebase 登录
- **Protobuf**: 编解码 Protobuf 消息，解析 gRPC-Connect API 响应
- **DOM 调试**: DOM 断点、表单监控、输入框变化追踪
- **全局变量**: 监控全局变量变化，快照对比找出差异
- **代码覆盖率**: 分析 JS 代码执行覆盖率，识别未使用的代码

## 系统要求

- [Node.js](https://nodejs.org/) v20.19 或更新版本（推荐 v22）
- [Chrome](https://www.google.com/chrome/) 稳定版

## 安装

```bash
git clone https://github.com/1600822305/js-reverse-mcp.git
cd js-reverse-mcp
npm install
npm run build
```

## MCP 客户端配置

### 方式一：自动启动 Chrome（推荐新手）

```json
{
  "mcpServers": {
    "js-reverse": {
      "command": "node",
      "args": ["/你的路径/js-reverse-mcp/build/src/index.js"]
    }
  }
}
```

### 方式二：连接已运行的 Chrome（推荐逆向场景）

**第一步**：以调试模式启动 Chrome（需先关闭所有 Chrome 窗口）

**Windows**
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug"
```

**macOS**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

**第二步**：配置 MCP 连接

```json
{
  "mcpServers": {
    "js-reverse": {
      "command": "node",
      "args": [
        "/你的路径/js-reverse-mcp/build/src/index.js",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

### 方式三：WebSocket 连接（支持自定义 Header）

```json
{
  "mcpServers": {
    "js-reverse": {
      "command": "node",
      "args": [
        "/你的路径/js-reverse-mcp/build/src/index.js",
        "--ws-endpoint=ws://127.0.0.1:9222/devtools/browser/<id>",
        "--ws-headers={\"Authorization\":\"Bearer token\"}"
      ]
    }
  }
}
```

### Claude Code

```bash
claude mcp add js-reverse node /你的路径/js-reverse-mcp/build/src/index.js
```

### Cursor / Windsurf

进入 MCP 设置，添加上述 JSON 配置。

---

## 完整工具列表

### 脚本分析

| 工具                | 描述                                                   |
| ------------------- | ------------------------------------------------------ |
| `list_scripts`      | 列出页面中所有加载的 JS 脚本（含 URL、sourceMap 信息） |
| `get_script_source` | 获取脚本源码，支持行范围或字符偏移（适用于压缩文件）   |
| `find_in_script`    | 在脚本中查找文本，返回精确行号和列号及上下文           |
| `search_in_sources` | 在所有已加载脚本中搜索字符串或正则表达式               |

### 断点管理

| 工具                     | 描述                                           |
| ------------------------ | ---------------------------------------------- |
| `set_breakpoint`         | 在指定 URL 和行号设置断点，支持条件断点        |
| `set_breakpoint_on_text` | 通过搜索代码文本自动定位并设置断点（适用于压缩代码） |
| `remove_breakpoint`      | 移除断点                                       |
| `list_breakpoints`       | 列出所有活动断点                               |

### 调试控制

| 工具                    | 描述                             |
| ----------------------- | -------------------------------- |
| `get_paused_info`       | 获取暂停状态、调用栈和作用域变量 |
| `resume`                | 恢复执行                         |
| `pause`                 | 暂停执行                         |
| `step_over`             | 单步跳过（不进入函数体）         |
| `step_into`             | 单步进入函数                     |
| `step_out`              | 单步跳出当前函数                 |
| `evaluate_on_callframe` | 在暂停的调用帧上下文中求值表达式 |

### 函数 Hook 与追踪

| 工具              | 描述                                                         |
| ----------------- | ------------------------------------------------------------ |
| `hook_function`   | Hook 全局函数或对象方法（如 `fetch`、`XMLHttpRequest.prototype.open`），记录调用参数和返回值 |
| `unhook_function` | 移除函数 Hook                                                |
| `list_hooks`      | 列出所有活动的 Hook                                          |
| `trace_function`  | 追踪任意函数调用（包括 webpack/rollup 打包的模块内部函数），使用条件断点实现，不暂停执行 |

### 网络调试

| 工具                    | 描述                                     |
| ----------------------- | ---------------------------------------- |
| `list_network_requests` | 列出页面所有网络请求                     |
| `get_network_request`   | 获取请求详情和响应内容                   |
| `get_request_initiator` | 获取网络请求的 JavaScript 调用栈         |
| `break_on_xhr`          | 设置 XHR/Fetch URL 断点                  |
| `remove_xhr_breakpoint` | 移除 XHR 断点                            |
| `intercept_requests`    | 拦截网络请求：记录/修改请求或返回 Mock 响应 |
| `stop_interceptor`      | 停止请求拦截器                           |
| `list_interceptors`     | 列出所有活动的拦截器                     |
| `mock_api_response`     | 快速为指定 URL 设置 Mock 响应            |
| `monitor_websocket`     | 监控 WebSocket 连接，记录收发消息        |
| `stop_websocket_monitor`| 停止 WebSocket 监控                      |
| `list_websocket_connections` | 列出所有追踪的 WebSocket 连接       |

### API 调试与 Token 管理

| 工具                   | 描述                                              |
| ---------------------- | ------------------------------------------------- |
| `api_request`          | 在浏览器上下文中发送 HTTP 请求（共享 Cookie 和 Origin），支持自动注入 Token |
| `save_token`           | 保存认证 Token（支持 Firebase/JWT/API Key/Bearer 等类型） |
| `list_tokens`          | 列出所有已保存的 Token                            |
| `set_active_token`     | 设置当前活动 Token                                |
| `delete_token`         | 删除已保存的 Token                                |
| `extract_page_token`   | 从当前页面自动提取认证 Token（扫描 React Fiber 状态、Cookie、localStorage） |
| `firebase_login`       | 使用邮箱/密码通过 Firebase Auth 登录并保存 Token  |

### Protobuf / gRPC

| 工具                    | 描述                                              |
| ----------------------- | ------------------------------------------------- |
| `encode_protobuf`       | 将字段编码为 Protobuf 二进制（无需 .proto 文件）  |
| `decode_protobuf`       | 解码 Protobuf 二进制数据（支持 Hex/Base64 输入）  |
| `decode_network_protobuf` | 直接请求 URL 并解析 Protobuf/gRPC-Connect 响应  |

### 网页抓取

| 工具                   | 描述                                            |
| ---------------------- | ----------------------------------------------- |
| `smart_extract`        | 用 CSS 选择器提取元素的文本、属性或 innerHTML   |
| `extract_table`        | 提取页面表格数据，返回结构化的行列数据          |
| `extract_links`        | 提取页面所有链接，支持 URL 正则过滤             |
| `extract_structured`   | 按字段 Schema 批量提取结构化数据（支持列表模式）|
| `extract_text_blocks`  | 按标题层级提取页面文本块（适合文章/文档页面）   |
| `extract_metadata`     | 提取页面元数据（JSON-LD、Open Graph、Twitter Card、标准 meta）|
| `extract_form_data`    | 提取表单结构和当前值                            |

### 加密检测与分析

| 工具                     | 描述                                               |
| ------------------------ | -------------------------------------------------- |
| `detect_encryption`      | 扫描页面中使用的加密库和算法                       |
| `find_crypto_functions`  | 在所有脚本中搜索加密相关函数定义                   |
| `analyze_encoded_string` | 分析字符串的编码类型（Base64/Hex/JWT/URL 编码等）并解码 |
| `hook_crypto_functions`  | 自动 Hook CryptoJS、JSEncrypt、Web Crypto API 等常见加密库 |

### 反混淆

| 工具                     | 描述                                               |
| ------------------------ | -------------------------------------------------- |
| `beautify_script`        | 美化压缩/混淆的 JavaScript 代码                    |
| `restore_variable_names` | 基于上下文分析还原混淆的变量名                     |
| `restore_control_flow`   | 分析并还原控制流扁平化等混淆结构                   |
| `decrypt_strings`        | 解密混淆字符串，支持 Base64、Hex、Unicode、自定义解密函数 |

### 代码覆盖率

| 工具                  | 描述                                           |
| --------------------- | ---------------------------------------------- |
| `start_js_coverage`   | 开始收集 JavaScript 代码覆盖率                 |
| `stop_js_coverage`    | 停止收集并生成报告，可按覆盖率阈值过滤         |
| `get_coverage_report` | 查看当前覆盖率收集状态                         |

### 全局变量监控

| 工具               | 描述                                          |
| ------------------ | --------------------------------------------- |
| `list_globals`     | 列出页面上所有自定义全局变量（排除浏览器内置）|
| `watch_global`     | 监控全局变量变化，记录修改时的调用栈          |
| `unwatch_global`   | 停止监控全局变量                              |
| `list_watchers`    | 列出所有活动的变量监控器                      |
| `snapshot_globals` | 创建全局变量快照                              |
| `diff_globals`     | 对比快照找出新增/修改的全局变量               |

### DOM 断点与表单

| 工具                          | 描述                                 |
| ----------------------------- | ------------------------------------ |
| `break_on_subtree_modified`   | DOM 子树修改时触发断点               |
| `break_on_attribute_modified` | 元素属性修改时触发断点               |
| `break_on_node_removed`       | 元素被删除时触发断点                 |
| `remove_dom_breakpoint`       | 移除 DOM 断点                        |
| `monitor_form_submit`         | 监控表单提交，捕获所有字段值         |
| `stop_form_monitor`           | 停止表单监控                         |
| `monitor_input_changes`       | 实时监控输入框变化（包括密码框）     |
| `stop_input_monitor`          | 停止输入监控                         |
| `get_form_data`               | 获取页面所有表单数据（包括隐藏字段） |

### 检查工具

| 工具             | 描述                                         |
| ---------------- | -------------------------------------------- |
| `inspect_object` | 深度检查 JavaScript 对象结构、原型链和方法   |
| `get_storage`    | 获取 Cookie、localStorage、sessionStorage    |
| `monitor_events` | 监控元素或 window 上的 DOM 事件              |
| `stop_monitor`   | 停止事件监控                                 |

### 页面导航

| 工具            | 描述                       |
| --------------- | -------------------------- |
| `list_pages`    | 列出浏览器中所有打开的页面 |
| `select_page`   | 选择一个页面作为调试上下文 |
| `new_page`      | 创建新页面并导航到 URL     |
| `navigate_page` | 导航当前页面（支持前进/后退/刷新） |

### 页面交互

| 工具                    | 描述                              |
| ----------------------- | --------------------------------- |
| `take_screenshot`       | 截取页面截图（支持全页面/元素）   |
| `take_snapshot`         | 获取页面无障碍树快照              |
| `evaluate_script`       | 在页面中执行 JavaScript           |
| `click_and_extract`     | 点击元素后等待并提取更新内容      |
| `list_console_messages` | 获取控制台消息                    |

---

## 使用示例

### 逆向加密参数

```
1. list_pages → 选择目标页面
2. search_in_sources "encrypt" → 找到加密函数位置
3. set_breakpoint_on_text "encryptData(" → 在加密函数入口设断点
4. 触发页面操作 → 断点命中
5. get_paused_info → 查看参数和调用栈
6. evaluate_on_callframe "arguments[0]" → 查看明文数据
```

### Hook 所有网络请求

```
hook_function "fetch" → 记录所有 fetch 调用的 URL、参数和响应
hook_function "XMLHttpRequest.prototype.open" → 同时监控 XHR
```

### 分析 Protobuf API

```
1. list_network_requests → 找到 content-type: application/proto 的请求
2. decode_network_protobuf url="https://..." → 直接解码响应
```

### 自动化登录并复用 Token

```
1. firebase_login email="user@example.com" password="..." saveName="myAccount"
2. api_request url="/api/data" method="GET" → 自动携带 Token
```

### 代码覆盖率分析

```
1. start_js_coverage
2. 与页面交互，触发业务流程
3. stop_js_coverage minCoverage=30 → 只显示覆盖率低于30%的脚本（找死代码）
```

### 反混淆流程

```
1. list_scripts → 找到混淆脚本的 scriptId
2. beautify_script scriptId="..." → 格式化
3. restore_variable_names scriptId="..." aggressive=true → 还原变量名
4. decrypt_strings scriptId="..." autoDetect=true → 解密字符串
5. restore_control_flow scriptId="..." → 还原控制流
```

---

## CLI 配置选项

| 选项                     | 描述                                          | 默认值   |
| ------------------------ | --------------------------------------------- | -------- |
| `--browser-url, -u`      | 连接到已运行的 Chrome（HTTP URL）             | —        |
| `--ws-endpoint, -w`      | 连接到已运行的 Chrome（WebSocket URL）        | —        |
| `--ws-headers`           | WebSocket 连接的自定义 Header（JSON 格式）    | —        |
| `--headless`             | 无头模式运行                                  | `false`  |
| `--executable-path, -e`  | 自定义 Chrome 可执行文件路径                  | —        |
| `--isolated`             | 使用临时用户数据目录，关闭后自动清理          | `false`  |
| `--channel`              | Chrome 通道：`stable` / `canary` / `beta` / `dev` | `stable` |
| `--viewport`             | 初始视口大小，如 `1280x720`                   | —        |
| `--proxy-server`         | Chrome 代理服务器配置                         | —        |
| `--accept-insecure-certs`| 忽略 SSL 证书错误（自签名/过期证书）          | `false`  |
| `--log-file`             | 调试日志输出路径                              | —        |
| `--no-category-network`  | 禁用所有网络相关工具                          | —        |
| `--chrome-arg`           | 传递额外参数给 Chrome（可多次指定）           | —        |

---

## 安全提示

此工具将浏览器内容完整暴露给 MCP 客户端，允许检查、调试和修改浏览器中的任何数据（包括 Cookie、Token、请求内容）。请勿在含有敏感信息的页面上使用，并确保 MCP 客户端来源可信。

## 许可证

Apache-2.0 — Copyright 2025 Google LLC
