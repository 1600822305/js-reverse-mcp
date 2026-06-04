<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

- **[Navigation automation](#navigation-automation)** (4 tools)
  - [`list_pages`](#list_pages)
  - [`navigate_page`](#navigate_page)
  - [`new_page`](#new_page)
  - [`select_page`](#select_page)
- **[Network](#network)** (9 tools)
  - [`api_request`](#api_request)
  - [`delete_token`](#delete_token)
  - [`extract_page_token`](#extract_page_token)
  - [`firebase_login`](#firebase_login)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
  - [`list_tokens`](#list_tokens)
  - [`save_token`](#save_token)
  - [`set_active_token`](#set_active_token)
- **[Debugging](#debugging)** (5 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`get_console_message`](#get_console_message)
  - [`list_console_messages`](#list_console_messages)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)
- **[JS Reverse Engineering](#js-reverse-engineering)** (75 tools)
  - [`add_network_rule`](#add_network_rule)
  - [`analyze_encoded_string`](#analyze_encoded_string)
  - [`batch_replay`](#batch_replay)
  - [`beautify_script`](#beautify_script)
  - [`break_on_attribute_modified`](#break_on_attribute_modified)
  - [`break_on_node_removed`](#break_on_node_removed)
  - [`break_on_subtree_modified`](#break_on_subtree_modified)
  - [`break_on_xhr`](#break_on_xhr)
  - [`clear_browser_cache`](#clear_browser_cache)
  - [`clear_cookies`](#clear_cookies)
  - [`clear_network_conditions`](#clear_network_conditions)
  - [`decode_protobuf`](#decode_protobuf)
  - [`delete_cookie`](#delete_cookie)
  - [`deobfuscate`](#deobfuscate)
  - [`detect_encryption`](#detect_encryption)
  - [`diff_globals`](#diff_globals)
  - [`encode_protobuf`](#encode_protobuf)
  - [`evaluate_on_callframe`](#evaluate_on_callframe)
  - [`export_har`](#export_har)
  - [`find_in_script`](#find_in_script)
  - [`get_cookies`](#get_cookies)
  - [`get_paused_info`](#get_paused_info)
  - [`get_request_initiator`](#get_request_initiator)
  - [`get_response_body`](#get_response_body)
  - [`get_script_source`](#get_script_source)
  - [`get_storage`](#get_storage)
  - [`hook_crypto_functions`](#hook_crypto_functions)
  - [`hook_function`](#hook_function)
  - [`inspect_object`](#inspect_object)
  - [`list_breakpoints`](#list_breakpoints)
  - [`list_eventsource_messages`](#list_eventsource_messages)
  - [`list_globals`](#list_globals)
  - [`list_hooks`](#list_hooks)
  - [`list_network_rules`](#list_network_rules)
  - [`list_scripts`](#list_scripts)
  - [`list_watchers`](#list_watchers)
  - [`list_websocket_connections`](#list_websocket_connections)
  - [`list_websocket_messages`](#list_websocket_messages)
  - [`monitor_events`](#monitor_events)
  - [`monitor_eventsource`](#monitor_eventsource)
  - [`monitor_form_submit`](#monitor_form_submit)
  - [`monitor_input_changes`](#monitor_input_changes)
  - [`monitor_websocket`](#monitor_websocket)
  - [`pause`](#pause)
  - [`remove_breakpoint`](#remove_breakpoint)
  - [`remove_dom_breakpoint`](#remove_dom_breakpoint)
  - [`remove_network_rule`](#remove_network_rule)
  - [`remove_xhr_breakpoint`](#remove_xhr_breakpoint)
  - [`replay_request`](#replay_request)
  - [`resume`](#resume)
  - [`search_in_sources`](#search_in_sources)
  - [`search_network`](#search_network)
  - [`set_breakpoint`](#set_breakpoint)
  - [`set_breakpoint_on_text`](#set_breakpoint_on_text)
  - [`set_cache_disabled`](#set_cache_disabled)
  - [`set_cookie`](#set_cookie)
  - [`set_extra_headers`](#set_extra_headers)
  - [`set_network_conditions`](#set_network_conditions)
  - [`snapshot_globals`](#snapshot_globals)
  - [`start_js_coverage`](#start_js_coverage)
  - [`step_into`](#step_into)
  - [`step_out`](#step_out)
  - [`step_over`](#step_over)
  - [`stop_eventsource_monitor`](#stop_eventsource_monitor)
  - [`stop_form_monitor`](#stop_form_monitor)
  - [`stop_input_monitor`](#stop_input_monitor)
  - [`stop_js_coverage`](#stop_js_coverage)
  - [`stop_monitor`](#stop_monitor)
  - [`stop_websocket_monitor`](#stop_websocket_monitor)
  - [`trace_function`](#trace_function)
  - [`unhook_function`](#unhook_function)
  - [`unwatch_global`](#unwatch_global)
  - [`wait_for_request`](#wait_for_request)
  - [`wait_for_response`](#wait_for_response)
  - [`watch_global`](#watch_global)
- **[Web Scraping](#web-scraping)** (3 tools)
  - [`extract`](#extract)
  - [`extract_form_data`](#extract_form_data)
  - [`extract_metadata`](#extract_metadata)

## Navigation automation

### `list_pages`

**Description:** Get a list of pages open in the browser.

**Parameters:** None

---

### `navigate_page`

**Description:** Navigates the currently selected page to a URL.

**Parameters:**

- **ignoreCache** (boolean) _(optional)_: Whether to ignore cache on reload.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **type** (enum: "url", "back", "forward", "reload") _(optional)_: Navigate the page by URL, back or forward in history, or reload.
- **url** (string) _(optional)_: Target URL (only type=url)

---

### `new_page`

**Description:** Creates a new page

**Parameters:**

- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **url** (string) **(required)**: URL to load in a new page.

---

### `select_page`

**Description:** Select a page as a context for future tool calls.

**Parameters:**

- **pageIdx** (number) **(required)**: The index of the page to select. Call [`list_pages`](#list_pages) to list pages.

---

## Network

### `api_request`

**Description:** Make an HTTP request from the browser context. Supports custom method, headers, body, and automatic token injection. The request is executed inside the browser page using fetch(), so it shares cookies and origin with the page. Use tokenName or the active token for automatic auth header injection.

**Parameters:**

- **body** (string) _(optional)_: Request body. For JSON, pass a JSON string. For form data, pass URL-encoded string.
- **connectProtocol** (boolean) _(optional)_: If true, adds connect-protocol-version: 1 header (for gRPC-Connect APIs).
- **headers** (object) _(optional)_: Custom headers to include. Common ones like content-type are auto-set for JSON.
- **includeTokenInBody** (boolean) _(optional)_: If true, also includes the token as "auth_token" field in the JSON body.
- **jsonBody** (object) _(optional)_: Request body as a JSON object (alternative to body string). Will be JSON.stringify-ed automatically.
- **maxResponseLength** (integer) _(optional)_: Maximum response body length to return (default: 2000). Set to 0 for unlimited.
- **method** (enum: "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS") _(optional)_: HTTP method (default: POST).
- **tokenHeader** (string) _(optional)_: Header name for the auth token (default: "x-auth-token"). Use "Authorization" for Bearer tokens.
- **tokenName** (string) _(optional)_: Name of a saved token to use. If omitted, uses the active token.
- **url** (string) **(required)**: The URL to request. Can be relative (e.g. "/\_backend/...") or absolute.

---

### `delete_token`

**Description:** Delete a saved token by name.

**Parameters:**

- **name** (string) **(required)**: The name of the token to delete.

---

### `extract_page_token`

**Description:** [`Extract`](#extract) authentication tokens from the current page. Searches React fiber state, cookies, localStorage, and common global variables for auth tokens. Optionally saves the found token.

**Parameters:**

- **saveName** (string) _(optional)_: If provided, save the found token with this name.
- **setActive** (boolean) _(optional)_: If true and saveName is provided, set as active token.

---

### `firebase_login`

**Description:** Login with email/password using Firebase Auth and save the resulting token. Useful for quickly switching between accounts.

**Parameters:**

- **apiKey** (string) _(optional)_: Firebase API key (default: Windsurf key).
- **email** (string) **(required)**: Email address to login with.
- **password** (string) **(required)**: Password.
- **saveName** (string) **(required)**: Name to save the token as.
- **setActive** (boolean) _(optional)_: Set as active token (default: true).

---

### `get_network_request`

**Description:** Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.

**Parameters:**

- **reqid** (number) _(optional)_: The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel.

---

### `list_network_requests`

**Description:** List all requests for the currently selected page since the last navigation.

**Parameters:**

- **includePreservedRequests** (boolean) _(optional)_: Set to true to return the preserved requests over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of requests to return. When omitted, returns all requests.
- **resourceTypes** (array) _(optional)_: Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.

---

### `list_tokens`

**Description:** List all saved authentication tokens. Shows name, type, metadata, and which one is active.

**Parameters:** None

---

### `save_token`

**Description:** Save an authentication token with a name for later use. Supports multiple tokens for different accounts/services. Use [`list_tokens`](#list_tokens) to see saved tokens and [`set_active_token`](#set_active_token) to switch between them.

**Parameters:**

- **metadata** (object) _(optional)_: Optional metadata to associate with this token (e.g. {"email": "user@example.com", "plan": "free"}).
- **name** (string) **(required)**: A short name for this token (e.g. "free_account", "trial_user", "pro_user").
- **setActive** (boolean) _(optional)_: Whether to set this token as the active token (default: false).
- **token** (string) **(required)**: The token value to save.
- **type** (enum: "firebase", "jwt", "api*key", "bearer", "custom") *(optional)\_: Type of token (default: "bearer").

---

### `set_active_token`

**Description:** Set a saved token as the active token. The active token is automatically used by [`api_request`](#api_request) when no explicit token is provided.

**Parameters:**

- **name** (string) **(required)**: The name of the saved token to set as active.

---

## Debugging

### `evaluate_script`

**Description:** Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON
so returned values have to JSON-serializable.

**Parameters:**

- **args** (array) _(optional)_: An optional list of arguments to pass to the function.
- **function** (string) **(required)**: A JavaScript function declaration to be executed by the tool in the currently selected page.
  Example without arguments: `() => {
  return document.title
}` or `async () => {
  return await fetch("example.com")
}`.
  Example with arguments: `(el) => {
  return el.innerText;
}`

---

### `get_console_message`

**Description:** Gets a console message by its ID. You can get all messages by calling [`list_console_messages`](#list_console_messages).

**Parameters:**

- **msgid** (number) **(required)**: The msgid of a console message on the page from the listed console messages

---

### `list_console_messages`

**Description:** List all console messages for the currently selected page since the last navigation.

**Parameters:**

- **includePreservedMessages** (boolean) _(optional)_: Set to true to return the preserved messages over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of messages to return. When omitted, returns all requests.
- **types** (array) _(optional)_: Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.

---

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Type of format to save the screenshot as. Default is "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (number) _(optional)_: Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.
- **uid** (string) _(optional)_: The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.
- **verbose** (boolean) _(optional)_: Whether to include all possible information available in the full a11y tree. Default is false.

---

## JS Reverse Engineering

### `add_network_rule`

**Description:** Adds a network interception rule (replaces the old intercept_requests). Rules are evaluated by a single shared Fetch handler, so multiple rules coexist without clobbering each other. Supports both the Request and Response stages, so you can inspect/rewrite real response bodies — not just mock or modify outgoing requests.

**Parameters:**

- **action** (enum: "continue", "modifyRequest", "modifyResponse", "mock", "block") **(required)**: continue (just observe), modifyRequest, modifyResponse, mock (fulfill without hitting server), block.
- **delayMs** (integer) _(optional)_: Delay before fulfilling, in milliseconds (mock/modifyResponse).
- **failReason** (string) _(optional)_: CDP error reason for block action (default BlockedByClient), e.g. AccessDenied, ConnectionRefused, TimedOut.
- **isRegex** (boolean) _(optional)_: Treat urlPattern as a JavaScript regular expression.
- **methods** (array) _(optional)_: HTTP methods to match (e.g. ["GET","POST"]). Empty = any.
- **removeHeaders** (array) _(optional)_: Header names to remove (modifyRequest/modifyResponse).
- **requestBodyContains** (string) _(optional)_: Extra match: the request body must contain this substring (case-insensitive).
- **requestHeaderContains** (object) _(optional)_: Extra match: each named request header must contain the substring (case-insensitive), e.g. {"authorization":"Bearer"}.
- **resourceTypes** (array) _(optional)_: CDP resource types to match (e.g. ["XHR","Fetch"]). Empty = any.
- **responseBody** (string) _(optional)_: Response body (mock, or modifyResponse to fully replace the body).
- **responseHeaderContains** (object) _(optional)_: Extra match: each named response header must contain the substring (Response stage only).
- **responseHeaders** (object) _(optional)_: Response headers (mock/modifyResponse).
- **responseStatus** (integer) _(optional)_: Response status code (mock/modifyResponse).
- **ruleId** (string) _(optional)_: Custom rule id. Auto-generated when omitted.
- **setHeaders** (object) _(optional)_: Headers to add/override (modifyRequest/modifyResponse).
- **setMethod** (string) _(optional)_: Override the HTTP method (modifyRequest).
- **setRequestBody** (string) _(optional)_: Replacement request body (modifyRequest).
- **setUrl** (string) _(optional)_: Redirect the request to this URL (modifyRequest).
- **stage** (enum: "Request", "Response") _(optional)_: Interception stage. Defaults to Response for modifyResponse, otherwise Request.
- **urlPattern** (string) **(required)**: URL matcher. Glob with _ by default; substring match when no _ is present; JS regex when isRegex=true.

---

### `analyze_encoded_string`

**Description:** Analyzes a string to detect its encoding type (Base64, Hex, JWT, URL encoding, etc.) and attempts to decode it.

**Parameters:**

- **input** (string) **(required)**: The encoded string to analyze.
- **tryDecode** (boolean) _(optional)_: Whether to attempt decoding (default: true).

---

### `batch_replay`

**Description:** Replays multiple requests in sequence and summarises each response. Source the requests either from captured ids (requestIds, from [`search_network`](#search_network)) or from a HAR file on disk (harFile, e.g. one exported by [`export_har`](#export_har)). HAR entries can be narrowed by urlPattern/methods/limit. Useful for re-running a recorded flow or fuzzing a sequence of signed API calls. Cookies/auth are included via the page context.

**Parameters:**

- **delayMs** (integer) _(optional)_: Delay between requests in milliseconds (default 0).
- **harFile** (string) _(optional)_: Path to a HAR file; its log.entries[].request entries are replayed.
- **isRegex** (boolean) _(optional)_: Treat urlPattern as a regular expression.
- **limit** (integer) _(optional)_: Maximum number of requests to replay (default 20).
- **maxResponseLength** (integer) _(optional)_: Max response body characters to show per request (default 500).
- **methods** (array) _(optional)_: Only replay HAR entries with these HTTP methods.
- **requestIds** (array) _(optional)_: Numeric request ids from [`search_network`](#search_network) to replay in order.
- **setHeaders** (object) _(optional)_: Headers to add/override on every replayed request.
- **urlPattern** (string) _(optional)_: Only replay HAR entries whose URL matches this glob/substring.

---

### `beautify_script`

**Description:** Beautifies minified/compressed JavaScript code to make it more readable. Supports automatic indentation, line breaks, and formatting.

**Parameters:**

- **code** (string) _(optional)_: JavaScript code to beautify. Use this if you want to beautify a code snippet instead of a full script.
- **indentSize** (integer) _(optional)_: Number of spaces for indentation (default: 2).
- **maxLineLength** (integer) _(optional)_: Maximum line length before wrapping (default: 80).
- **scriptId** (string) _(optional)_: The script ID to beautify (from [`list_scripts`](#list_scripts)). If not provided, use the code parameter.

---

### `break_on_attribute_modified`

**Description:** Sets a breakpoint that triggers when any attribute of an element is modified. Useful for tracking hidden field changes, class modifications, etc.

**Parameters:**

- **selector** (string) **(required)**: CSS selector for the element to monitor (e.g., "input[name=token]", "#hidden-field").

---

### `break_on_node_removed`

**Description:** Sets a breakpoint that triggers when an element is about to be removed from the DOM.

**Parameters:**

- **selector** (string) **(required)**: CSS selector for the element to monitor.

---

### `break_on_subtree_modified`

**Description:** Sets a breakpoint that triggers when the DOM subtree of an element is modified (child added/removed). Useful for tracking dynamic content changes.

**Parameters:**

- **selector** (string) **(required)**: CSS selector for the element to monitor (e.g., "#container", ".form-wrapper", "body").

---

### `break_on_xhr`

**Description:** Sets a breakpoint that triggers when an XHR/Fetch request URL contains the specified string.

**Parameters:**

- **url** (string) **(required)**: URL pattern to break on (partial match).

---

### `clear_browser_cache`

**Description:** Clears the browser HTTP cache via CDP Network.clearBrowserCache so the next requests hit the network.

**Parameters:** None

---

### `clear_cookies`

**Description:** Clears all browser cookies via CDP Network.clearBrowserCookies. Useful for reproducing a fresh, logged-out session.

**Parameters:** None

---

### `clear_network_conditions`

**Description:** Resets network emulation (back online, no throttling) and clears any User-Agent override and extra headers.

**Parameters:** None

---

### `decode_protobuf`

**Description:** Decode protobuf binary without a .proto schema. Provide inline data (hex/base64) OR a url to fetch and decode (e.g. gRPC-Connect responses). Analyzes wire format to [`extract`](#extract) field numbers, types, and values, including nested messages.

**Parameters:**

- **body** (string) _(optional)_: Request body when fetching url (hex-encoded protobuf or JSON).
- **bodyFormat** (enum: "hex", "json", "raw") _(optional)_: Format of the request body when fetching url.
- **data** (string) _(optional)_: Protobuf data as hex string (e.g. "0a0548656c6c6f") or base64 string. Provide either data or url.
- **format** (enum: "hex", "base64", "auto") _(optional)_: Input format for data (default: auto-detect).
- **headers** (object) _(optional)_: Custom headers when fetching url.
- **maxDepth** (integer) _(optional)_: Maximum depth for nested message decoding (default: 3).
- **method** (enum: "GET", "POST") _(optional)_: HTTP method when fetching url (default: POST).
- **skipBytes** (integer) _(optional)_: Number of bytes to skip at the start of the fetched response (e.g. 5 for gRPC-Connect frame header).
- **url** (string) _(optional)_: URL to fetch and decode the response as protobuf (gRPC-Connect/application/proto). Provide either data or url.

---

### `delete_cookie`

**Description:** Deletes cookies matching the given name (optionally scoped by url, domain and path) via CDP Network.deleteCookies.

**Parameters:**

- **domain** (string) _(optional)_: Scope deletion to this domain.
- **name** (string) **(required)**: Name of the cookie(s) to delete.
- **path** (string) _(optional)_: Scope deletion to this path.
- **url** (string) _(optional)_: Scope deletion to this URL.

---

### `deobfuscate`

**Description:** AST-based JavaScript deobfuscation (powered by Babel). Parses the code into an AST and applies scope-safe transforms: variable renaming, constant folding, dead/unreachable code elimination, and string/number normalization. Far more reliable than regex-based approaches because it understands scopes and never rewrites string contents or unrelated identifiers. Provide a scriptId (from [`list_scripts`](#list_scripts)) or a raw code snippet. Use [`beautify_script`](#beautify_script) if you only want pretty-printing.

**Parameters:**

- **aggressive** (boolean) _(optional)_: Also rename \_0x-prefixed non-hex names and short 1-2 char identifiers. May reduce readability of intentional short names (default: false).
- **code** (string) _(optional)_: JavaScript code to [`deobfuscate`](#deobfuscate). Use this for a snippet instead of a full script.
- **foldConstants** (boolean) _(optional)_: Evaluate constant expressions like 2*60*60 or "a"+"b" to their literal value (default: true).
- **maxOutputLength** (number) _(optional)_: Maximum number of characters of deobfuscated code to return. Set to 0 for unlimited (default: 20000).
- **preserveShortNames** (boolean) _(optional)_: When aggressive renaming is on, keep common loop counters i/j/k unchanged (default: true).
- **removeDeadCode** (boolean) _(optional)_: Remove dead branches (if(false){}) and unreachable code after return/throw/break/continue (default: true).
- **renameVariables** (boolean) _(optional)_: Rename obfuscated identifiers (e.g. \_0x3f2a) to readable names using scope-safe renaming (default: true).
- **scriptId** (string) _(optional)_: The script ID to [`deobfuscate`](#deobfuscate) (from [`list_scripts`](#list_scripts)).
- **simplifyStrings** (boolean) _(optional)_: Normalize literals: decode \xNN/\uNNNN escapes, convert hex/octal/binary numbers to decimal, and rewrite obj["prop"] to obj.prop (default: true).

---

### `detect_encryption`

**Description:** Detects encryption algorithms, crypto libraries, and encoding methods. By default (scope="page") scans runtime page globals; set scope to "scripts" or "both" to also search loaded script sources for crypto function definitions.

**Parameters:**

- **deep** (boolean) _(optional)_: For the page scan: perform deep scan including all object properties (slower but more thorough).
- **keywords** (array) _(optional)_: For the scripts scan: custom keywords to search for. Defaults to common crypto terms.
- **maxResults** (integer) _(optional)_: For the scripts scan: maximum number of results per keyword (default: 30).
- **scope** (enum: "page", "scripts", "both") _(optional)_: What to scan: "page" = runtime global objects/patterns (fast, default), "scripts" = crypto function definitions in loaded script sources (scans every loaded script), "both" = run both.

---

### `diff_globals`

**Description:** Compares current global variables with a previous snapshot. Shows added, removed, and changed variables. Use after [`snapshot_globals`](#snapshot_globals) to find what changed.

**Parameters:**

- **showUnchanged** (boolean) _(optional)_: Whether to show unchanged variables (default: false).
- **snapshotId** (string) _(optional)_: ID of the snapshot to compare with (default: "default").

---

### `encode_protobuf`

**Description:** Encode data to protobuf binary format without a .proto schema. Specify field numbers, types, and values to build a protobuf message. Returns hex and base64 encoded output.

**Parameters:**

- **fields** (array) **(required)**: Array of fields to encode.

---

### `evaluate_on_callframe`

**Description:** Evaluates a JavaScript expression in the context of a specific call frame while paused. This allows you to inspect variables and execute code in the paused scope.

**Parameters:**

- **expression** (string) **(required)**: The JavaScript expression to evaluate.
- **frameIndex** (integer) _(optional)_: The call frame index to evaluate in (0 = top frame, default: 0).

---

### `export_har`

**Description:** Exports captured network traffic as a HAR 1.2 file (optionally filtered and including response bodies).

**Parameters:**

- **filePath** (string) _(optional)_: Filename to save the HAR as. Defaults to capture.har.
- **includeBodies** (boolean) _(optional)_: Fetch and embed response bodies (default true).
- **isRegex** (boolean) _(optional)_
- **limit** (integer) _(optional)_: Maximum number of requests to export (default 1000).
- **urlPattern** (string) _(optional)_: Only include requests matching this URL pattern.

---

### `find_in_script`

**Description:** Finds a string in a specific script and returns its exact line/column position with surrounding context. Ideal for setting breakpoints in minified files where the entire code is on one line.

**Parameters:**

- **caseSensitive** (boolean) _(optional)_: Whether the search is case-sensitive (default: true).
- **contextChars** (integer) _(optional)_: Number of characters to show before and after the match (default: 100).
- **occurrence** (integer) _(optional)_: Which occurrence to find (1 = first, 2 = second, etc.).
- **query** (string) **(required)**: The string to find in the script.
- **scriptId** (string) **(required)**: The script ID to search in (from [`list_scripts`](#list_scripts)).

---

### `get_cookies`

**Description:** Reads cookies via the CDP Network domain, including httpOnly cookies (where auth/session tokens usually live) with full attributes. By default returns cookies for the current page; pass `urls` to scope to specific URLs, or `nameContains` to filter by name.

**Parameters:**

- **nameContains** (string) _(optional)_: Only return cookies whose name contains this substring.
- **urls** (array) _(optional)_: Restrict to cookies that would be sent to these URLs.

---

### `get_paused_info`

**Description:** Gets information about the current paused state including call stack, current location, and scope variables. Use this after a breakpoint is hit to understand the execution context.

**Parameters:**

- **includeScopes** (boolean) _(optional)_: Whether to include scope variables (default: true).
- **maxScopeDepth** (integer) _(optional)_: Maximum scope depth to traverse (default: 2).

---

### `get_request_initiator`

**Description:** Gets the JavaScript call stack that initiated a network request. This helps trace which code triggered an API call.

**Parameters:**

- **requestId** (integer) **(required)**: The request ID (from [`list_network_requests`](#list_network_requests)) to get the initiator for.

---

### `get_response_body`

**Description:** Fetches the full response body of a captured request by its numeric id (from [`search_network`](#search_network)). Binary bodies are returned as base64.

**Parameters:**

- **maxLength** (integer) _(optional)_: Maximum characters to return (default 20000, 0 = unlimited).
- **requestId** (integer) **(required)**: Numeric request id from [`search_network`](#search_network).

---

### `get_script_source`

**Description:** Gets the source code of a JavaScript script by its script ID. Supports line range (for normal files) or character offset (for minified single-line files). Use [`list_scripts`](#list_scripts) first to find the script ID.

**Parameters:**

- **endLine** (integer) _(optional)_: End line number (1-based). Use for multi-line files.
- **length** (integer) _(optional)_: Number of characters to return when using offset (default: 1000).
- **offset** (integer) _(optional)_: Character offset to start from (0-based). Use for minified single-line files.
- **scriptId** (string) **(required)**: The script ID (from [`list_scripts`](#list_scripts)) to get the source code for.
- **startLine** (integer) _(optional)_: Start line number (1-based). Use for multi-line files.

---

### `get_storage`

**Description:** Gets browser storage data including cookies, localStorage, and sessionStorage. Cookies are read via the Chrome DevTools Protocol (Network.getCookies), so httpOnly cookies (where auth/session tokens usually live) are included, along with rich attributes (domain, path, httpOnly, secure, sameSite, expires, etc.). localStorage and sessionStorage are read from the page context.

**Parameters:**

- **filter** (string) _(optional)_: Optional filter string to match against keys/names.
- **type** (enum: "all", "cookies", "localStorage", "sessionStorage") _(optional)_: Which storage to retrieve (default: all).

---

### `hook_crypto_functions`

**Description:** Automatically hooks common crypto library functions to log encryption/decryption calls. Supports CryptoJS, JSEncrypt, Web Crypto API, and more.

**Parameters:**

- **libraries** (array) _(optional)_: Which libraries to hook. Options: CryptoJS, JSEncrypt, WebCrypto, all

---

### `hook_function`

**Description:** Hooks a JavaScript function to log its calls, arguments, and return values. Useful for understanding how functions are used without setting breakpoints.

**Parameters:**

- **hookId** (string) _(optional)_: Custom identifier for this hook. Used to unhook later. Defaults to target name.
- **logArgs** (boolean) _(optional)_: Whether to log function arguments (default: true).
- **logResult** (boolean) _(optional)_: Whether to log return value (default: true).
- **logStack** (boolean) _(optional)_: Whether to log call stack (default: false).
- **target** (string) **(required)**: The function to hook. Can be: global function name ("fetch"), object method ("XMLHttpRequest.prototype.open"), or path ("window.app.api.request").

---

### `inspect_object`

**Description:** Deeply inspects a JavaScript object, showing its properties, prototype chain, and methods. Useful for understanding object structure.

**Parameters:**

- **depth** (integer) _(optional)_: How deep to inspect nested objects (default: 2).
- **expression** (string) **(required)**: JavaScript expression to evaluate and inspect (e.g., "window.app", "document.body", "myObject").
- **showMethods** (boolean) _(optional)_: Whether to show methods (default: true).
- **showPrototype** (boolean) _(optional)_: Whether to show prototype chain (default: true).

---

### `list_breakpoints`

**Description:** Lists all active breakpoints in the current debugging session.

**Parameters:** None

---

### `list_eventsource_messages`

**Description:** Lists captured Server-Sent Events, filterable by URL/content.

**Parameters:**

- **contains** (string) _(optional)_: Only messages whose data contains this text.
- **isRegex** (boolean) _(optional)_
- **limit** (integer) _(optional)_: Maximum number of messages (default 100).
- **maxDataLength** (integer) _(optional)_: Maximum data characters to display (default 2000).
- **urlPattern** (string) _(optional)_: Filter by source URL (glob/substring/regex).

---

### `list_globals`

**Description:** Lists all global variables on the window object, excluding built-in browser APIs. Useful for finding custom variables, configs, tokens, and encryption functions.

**Parameters:**

- **filter** (string) _(optional)_: Filter variables by name (case-insensitive partial match). E.g., "token", "encrypt", "config".
- **includeBuiltins** (boolean) _(optional)_: Whether to include built-in browser objects like document, navigator, etc. (default: false).
- **maxDepth** (integer) _(optional)_: Maximum depth to inspect object values (default: 1).
- **showFunctions** (boolean) _(optional)_: Whether to show function type variables (default: true).

---

### `list_hooks`

**Description:** Lists all active function hooks.

**Parameters:** None

---

### `list_network_rules`

**Description:** Lists active network interception rules and their hit stats.

**Parameters:** None

---

### `list_scripts`

**Description:** Lists all JavaScript scripts loaded in the current page. Returns script ID, URL, and source map information. Use this to find scripts before setting breakpoints or searching.

**Parameters:**

- **filter** (string) _(optional)_: Optional filter string to match against script URLs (case-insensitive partial match).

---

### `list_watchers`

**Description:** Lists all active global variable watchers.

**Parameters:** None

---

### `list_websocket_connections`

**Description:** Lists tracked WebSocket connections and their frame counts.

**Parameters:** None

---

### `list_websocket_messages`

**Description:** Lists captured WebSocket frames, filterable by connection, direction, URL pattern and payload content. Binary frames are shown as base64.

**Parameters:**

- **connectionId** (integer) _(optional)_: Filter by connection id (from [`list_websocket_connections`](#list_websocket_connections)).
- **contains** (string) _(optional)_: Only frames whose payload contains this text.
- **direction** (enum: "sent", "received") _(optional)_: Filter by frame direction.
- **isRegex** (boolean) _(optional)_
- **limit** (integer) _(optional)_: Maximum number of frames (default 100).
- **maxPayloadLength** (integer) _(optional)_: Maximum payload characters to display (default 2000).
- **urlPattern** (string) _(optional)_: Filter by connection URL (glob/substring/regex).

---

### `monitor_events`

**Description:** Monitors DOM events on a specified element or window. Events will be logged to console.

**Parameters:**

- **events** (array) _(optional)_: Specific events to monitor (e.g., ["click", "keydown"]). If not specified, monitors common events.
- **monitorId** (string) _(optional)_: Custom ID for this monitor. Used to stop monitoring later.
- **selector** (string) _(optional)_: CSS selector for element to monitor, or "window"/"document" (default: window).

---

### `monitor_eventsource`

**Description:** Starts capturing Server-Sent Events (EventSource) messages via CDP. Useful for streaming APIs (e.g. LLM token streams, live feeds).

**Parameters:**

- **clear** (boolean) _(optional)_: Clear previously captured messages first.

---

### `monitor_form_submit`

**Description:** Monitors form submissions to capture form data before it is sent. Useful for analyzing login forms and finding encryption of passwords.

**Parameters:**

- **monitorId** (string) _(optional)_: Custom ID for this monitor.
- **preventDefault** (boolean) _(optional)_: Whether to prevent form submission (for analysis only). Default: false.
- **selector** (string) _(optional)_: CSS selector for the form(s) to monitor (default: all forms).

---

### `monitor_input_changes`

**Description:** Monitors changes to input fields in real-time. Captures every keystroke and value change. Useful for tracking password field modifications before encryption.

**Parameters:**

- **logKeystrokes** (boolean) _(optional)_: Whether to log individual keystrokes (verbose). Default: false.
- **monitorId** (string) _(optional)_: Custom ID for this monitor.
- **selector** (string) _(optional)_: CSS selector for inputs to monitor (default: all inputs and textareas).

---

### `monitor_websocket`

**Description:** Starts capturing WebSocket frames via the CDP Network domain. Unlike a JS monkey-patch, this captures connections opened before the call and after navigation, records binary frames (as base64), and is not detectable from page scripts.

**Parameters:**

- **clear** (boolean) _(optional)_: Clear previously captured frames/connections first.

---

### `pause`

**Description:** Pauses JavaScript execution at the current point. Use this to interrupt running code.

**Parameters:** None

---

### `remove_breakpoint`

**Description:** Removes a breakpoint by its ID. Use [`list_breakpoints`](#list_breakpoints) to see active breakpoints.

**Parameters:**

- **breakpointId** (string) **(required)**: The breakpoint ID to remove (from [`list_breakpoints`](#list_breakpoints) or [`set_breakpoint`](#set_breakpoint)).

---

### `remove_dom_breakpoint`

**Description:** Removes a DOM breakpoint from an element.

**Parameters:**

- **selector** (string) **(required)**: CSS selector for the element.
- **type** (enum: "subtree-modified", "attribute-modified", "node-removed") **(required)**: Type of DOM breakpoint to remove.

---

### `remove_network_rule`

**Description:** Removes a network interception rule by id. Fetch interception is disabled automatically once the last rule is removed.

**Parameters:**

- **all** (boolean) _(optional)_: Remove all rules.
- **ruleId** (string) _(optional)_: Rule id to remove. Omit with all=true to remove every rule.

---

### `remove_xhr_breakpoint`

**Description:** Removes an XHR/Fetch breakpoint.

**Parameters:**

- **url** (string) **(required)**: The URL pattern to remove breakpoint for.

---

### `replay_request`

**Description:** Re-sends a captured request (by numeric id from [`search_network`](#search_network)) from the page context using fetch(), so cookies and auth are included. Supports overriding the URL, method, headers and body — useful for probing how a signed/parameterised API responds to tampered input.

**Parameters:**

- **maxResponseLength** (integer) _(optional)_: Maximum response body characters to return (default 5000).
- **overrideBody** (string) _(optional)_: Override the request body.
- **overrideMethod** (string) _(optional)_: Override the HTTP method.
- **overrideUrl** (string) _(optional)_: Override the request URL.
- **requestId** (integer) **(required)**: Numeric request id from [`search_network`](#search_network).
- **setHeaders** (object) _(optional)_: Headers to add/override on the replayed request.

---

### `resume`

**Description:** Resumes JavaScript execution after being paused at a breakpoint. Execution continues until the next breakpoint or completion.

**Parameters:** None

---

### `search_in_sources`

**Description:** Searches for a string or regex pattern in all loaded JavaScript sources. Returns matching lines with script ID, URL, and line number. Use [`get_script_source`](#get_script_source) with startLine/endLine to view full context around matches.

**Parameters:**

- **caseSensitive** (boolean) _(optional)_: Whether the search should be case-sensitive.
- **excludeMinified** (boolean) _(optional)_: Skip minified files (files with very long lines). Default: true.
- **isRegex** (boolean) _(optional)_: Whether to treat the query as a regular expression.
- **maxLineLength** (integer) _(optional)_: Maximum characters per line preview (default: 150). Set to 0 for full lines.
- **maxResults** (integer) _(optional)_: Maximum number of results to return (default: 30).
- **query** (string) **(required)**: The search query (string or regex pattern).
- **urlFilter** (string) _(optional)_: Only search scripts whose URL contains this string (case-insensitive).

---

### `search_network`

**Description:** Searches captured network requests (CDP-backed store that survives navigation) by URL pattern, method, status and resource type, with an optional full-text search across request/response bodies. Independent of the DevTools UI selection.

**Parameters:**

- **bodyContains** (string) _(optional)_: Only return requests whose request or response body contains this text. Fetches response bodies for candidates.
- **includeBodies** (boolean) _(optional)_: Include a truncated response body for each result.
- **includeInitiator** (boolean) _(optional)_: Include the JS initiator call stack for each result (main-page requests only). Useful to locate the code that fired a request.
- **isRegex** (boolean) _(optional)_
- **limit** (integer) _(optional)_: Maximum number of results (default 50).
- **maxBodyLength** (integer) _(optional)_: Maximum body characters to display (default 2000).
- **maxFrames** (integer) _(optional)_: Maximum initiator call-stack frames to show (default 5).
- **method** (string) _(optional)_: HTTP method filter.
- **resourceType** (string) _(optional)_: CDP resource type filter (e.g. XHR, Fetch, Script).
- **status** (integer) _(optional)_: HTTP status filter.
- **urlPattern** (string) _(optional)_: URL matcher: glob with \*, substring, or regex (isRegex).

---

### `set_breakpoint`

**Description:** Sets a breakpoint in a JavaScript file at the specified line. The breakpoint will trigger when the code executes.

**Parameters:**

- **columnNumber** (integer) _(optional)_: Optional column number (0-based).
- **condition** (string) _(optional)_: Optional condition expression. The breakpoint only triggers when this evaluates to true.
- **isRegex** (boolean) _(optional)_: Whether to treat the URL as a regex pattern.
- **lineNumber** (integer) **(required)**: The line number to set the breakpoint (1-based).
- **url** (string) **(required)**: The URL of the JavaScript file (can be a partial match or regex pattern).

---

### `set_breakpoint_on_text`

**Description:** Sets a breakpoint on specific code (function name, statement, etc.) by searching for it and automatically determining the exact position. Works with both normal and minified files.

**Parameters:**

- **condition** (string) _(optional)_: Optional condition expression. Breakpoint only triggers when this evaluates to true.
- **occurrence** (integer) _(optional)_: Which occurrence to break on (1 = first, 2 = second, etc.).
- **text** (string) **(required)**: The code text to find and set breakpoint on (e.g., "function myFunc", "fetchData(", "apiCall").
- **urlFilter** (string) _(optional)_: Only search in scripts whose URL contains this string (case-insensitive).

---

### `set_cache_disabled`

**Description:** Toggles the browser cache for the page via CDP Network.setCacheDisabled. Disable it to force real network responses (no 304 / disk cache) while capturing or replaying traffic.

**Parameters:**

- **disabled** (boolean) **(required)**: True to bypass the cache, false to re-enable it.

---

### `set_cookie`

**Description:** Sets a cookie via the CDP Network domain. Either `url` or `domain` must be supplied so Chrome can scope the cookie. Useful for replaying with a modified session or forging an authenticated state.

**Parameters:**

- **domain** (string) _(optional)_: Cookie domain.
- **expires** (number) _(optional)_: Expiry as a UNIX timestamp in seconds (omit for session).
- **httpOnly** (boolean) _(optional)_: Mark cookie as HttpOnly.
- **name** (string) **(required)**: Cookie name.
- **path** (string) _(optional)_: Cookie path.
- **sameSite** (enum: "Strict", "Lax", "None") _(optional)_: SameSite policy.
- **secure** (boolean) _(optional)_: Mark cookie as Secure.
- **url** (string) _(optional)_: Request URL to associate the cookie with (sets domain/path).
- **value** (string) **(required)**: Cookie value.

---

### `set_extra_headers`

**Description:** Sets extra HTTP headers sent with every subsequent request (CDP Network.setExtraHTTPHeaders). Pass an empty object to clear.

**Parameters:**

- **headers** (object) **(required)**: Header name/value map. Empty object clears all extra headers.

---

### `set_network_conditions`

**Description:** Emulates network conditions (offline, throttling, latency) and optionally overrides the User-Agent, via the CDP Network domain. Use a preset or specify raw values.

**Parameters:**

- **downloadThroughput** (number) _(optional)_: Max download throughput in bytes/sec (-1 to disable).
- **latency** (number) _(optional)_: Minimum round-trip latency in milliseconds.
- **offline** (boolean) _(optional)_: Force the page offline.
- **preset** (enum: "No throttling", "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") _(optional)_: Named throttling profile.
- **uploadThroughput** (number) _(optional)_: Max upload throughput in bytes/sec (-1 to disable).
- **userAgent** (string) _(optional)_: Override the User-Agent string for subsequent requests.

---

### `snapshot_globals`

**Description:** Takes a snapshot of current global variables for later comparison with [`diff_globals`](#diff_globals). Useful for finding what changed after an action (e.g., login, button click).

**Parameters:**

- **snapshotId** (string) _(optional)_: ID for this snapshot (default: "default").

---

### `start_js_coverage`

**Description:** Starts collecting JavaScript code coverage data. This tracks which parts of JavaScript code are executed.

**Parameters:**

- **includeRawScriptCoverage** (boolean) _(optional)_: Whether to include raw V8 coverage data (default: false). Useful for detailed analysis.
- **reportAnonymousScripts** (boolean) _(optional)_: Whether to report anonymous scripts (default: true). Set to false to only track named scripts.
- **resetOnNavigation** (boolean) _(optional)_: Whether to reset coverage on navigation (default: false). Set to true to track coverage per page.

---

### `step_into`

**Description:** Steps into the next function call. Use this to enter and debug function bodies.

**Parameters:** None

---

### `step_out`

**Description:** Steps out of the current function, continuing until the function returns. Use this to quickly exit a function.

**Parameters:** None

---

### `step_over`

**Description:** Steps over to the next statement, treating function calls as a single step. Use this to move through code without entering function bodies.

**Parameters:** None

---

### `stop_eventsource_monitor`

**Description:** Stops capturing EventSource messages. Captured data is retained.

**Parameters:** None

---

### `stop_form_monitor`

**Description:** Stops monitoring form submissions.

**Parameters:**

- **monitorId** (string) _(optional)_: The monitor ID to stop.

---

### `stop_input_monitor`

**Description:** Stops monitoring input field changes.

**Parameters:**

- **monitorId** (string) _(optional)_: The monitor ID to stop.

---

### `stop_js_coverage`

**Description:** Stops collecting JavaScript code coverage and generates a detailed report showing which code was executed and which was not.

**Parameters:**

- **minCoverage** (number) _(optional)_: Only show scripts with coverage below this percentage (0-100). Useful for finding unused code.
- **sortBy** (enum: "coverage", "size", "url") _(optional)_: How to sort the results (default: coverage).

---

### `stop_monitor`

**Description:** Stops an event monitor.

**Parameters:**

- **monitorId** (string) **(required)**: The monitor ID to stop.

---

### `stop_websocket_monitor`

**Description:** Stops capturing WebSocket frames. Captured frames are retained.

**Parameters:** None

---

### `trace_function`

**Description:** Traces calls to a function by its name in the source code. Works for ANY function including module-internal functions (webpack/rollup bundled). Uses "logpoints" (conditional breakpoints) to log arguments without pausing execution.

**Parameters:**

- **functionName** (string) **(required)**: The function name to trace. Will search for "function NAME" or "NAME = function" or "NAME(" patterns.
- **logArgs** (boolean) _(optional)_: Whether to log function arguments (default: true).
- **logThis** (boolean) _(optional)_: Whether to log "this" context (default: false).
- **pause** (boolean) _(optional)_: Whether to actually [`pause`](#pause) execution (default: false, just logs).
- **traceId** (string) _(optional)_: Custom ID for this trace. Used to identify in logs.
- **urlFilter** (string) _(optional)_: Only search in scripts matching this URL pattern.

---

### `unhook_function`

**Description:** Removes a previously installed function hook.

**Parameters:**

- **hookId** (string) **(required)**: The hook ID to remove (from [`hook_function`](#hook_function)).

---

### `unwatch_global`

**Description:** Stops watching a global variable and restores original behavior.

**Parameters:**

- **watchId** (string) **(required)**: The watcher ID to remove.

---

### `wait_for_request`

**Description:** Blocks until a network request matching the filters is observed (across the page and all auto-attached targets), then returns it. Use after triggering an action to grab the request it fires. Resolves as soon as the request is seen, before its response arrives.

**Parameters:**

- **isRegex** (boolean) _(optional)_
- **method** (string) _(optional)_: HTTP method filter.
- **newOnly** (boolean) _(optional)_: When true, ignore already-captured matches and wait for a fresh one. Set this before triggering the action if a stale match could exist.
- **resourceType** (string) _(optional)_: CDP resource type filter (e.g. XHR, Fetch, Script).
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds (default 30000).
- **urlPattern** (string) _(optional)_: URL matcher: glob with \*, substring, or regex (isRegex).

---

### `wait_for_response`

**Description:** Blocks until a network request matching the filters has received a response (or failed) across the page and all auto-attached targets, then returns it. Use to grab the response of an XHR/fetch fired by an action.

**Parameters:**

- **includeBody** (boolean) _(optional)_: Include a truncated response body in the result.
- **isRegex** (boolean) _(optional)_
- **maxBodyLength** (integer) _(optional)_: Maximum body characters to display (default 2000).
- **method** (string) _(optional)_: HTTP method filter.
- **newOnly** (boolean) _(optional)_: When true, ignore already-captured matches and wait for a fresh one. Set this before triggering the action if a stale match could exist.
- **resourceType** (string) _(optional)_: CDP resource type filter (e.g. XHR, Fetch, Script).
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds (default 30000).
- **urlPattern** (string) _(optional)_: URL matcher: glob with \*, substring, or regex (isRegex).

---

### `watch_global`

**Description:** Watches a global variable for changes. When the variable is modified, logs the old and new values to console.

**Parameters:**

- **logStack** (boolean) _(optional)_: Whether to log the call stack when variable changes (default: true).
- **variableName** (string) **(required)**: The name of the global variable to watch (e.g., "token", "appConfig.apiKey").
- **watchId** (string) _(optional)_: Custom ID for this watcher. Defaults to variable name.

---

## Web Scraping

### `extract`

**Description:** Unified web content extraction. Use `type` to choose a mode: "elements" (CSS selector -> text/attribute/innerHTML of each match), "structured" (a `fields` map of name->selector, optionally repeated over a `containerSelector` to return a list; each field can also pull an attribute or innerHTML), "links" (anchor tags, optional urlPattern filter and container), "table" (headers + rows) or "textBlocks" (page sections grouped by headings). The default type "auto" picks "structured" when `fields` is given, otherwise "elements". Optionally click an element first (clickSelector) and wait (waitForSelector / waitMs) before extracting, e.g. to load more content or switch tabs.

**Parameters:**

- **attribute** (string) _(optional)_: For type "elements": attribute to [`extract`](#extract) (e.g. "href", "src"). If omitted, extracts text content.
- **clickSelector** (string) _(optional)_: Optional: click this element before extracting (e.g. a "load more" button or a tab).
- **containerSelector** (string) _(optional)_: For "structured": repeating container selector to return a list of items. For "links": container to search within (default whole page). For "textBlocks": content container (default "body").
- **fields** (object) _(optional)_: For type "structured": map of field name -> CSS selector, or -> {selector, attribute?, html?} to pull an attribute or innerHTML instead of text. Example: {"title":"h1","img":{"selector":"img","attribute":"src"}}. Providing this triggers structured mode under "auto".
- **hasHeader** (boolean) _(optional)_: For type "table": treat the first row as a header row (default: true).
- **headingLevel** (string) _(optional)_: For type "textBlocks": heading selectors that start a section (default: "h1,h2,h3,h4,h5,h6").
- **includeSubheadings** (boolean) _(optional)_: For type "textBlocks": include subheadings within each section (default: true).
- **includeText** (boolean) _(optional)_: For type "links": include link text in results (default: true).
- **limit** (integer) _(optional)_: Maximum number of items to [`extract`](#extract) (applies to "elements" and to "structured" lists).
- **returnHtml** (boolean) _(optional)_: For type "elements": return innerHTML instead of text content.
- **selector** (string) _(optional)_: CSS selector. Required for type "elements"; for type "table" it selects the table(s) (default "table").
- **tableIndex** (integer) _(optional)_: For type "table": index of the table if multiple match (default: 0).
- **type** (enum: "auto", "elements", "structured", "links", "table", "textBlocks") _(optional)_: Extraction mode. "auto" (default) infers structured when `fields` is provided, otherwise elements.
- **urlPattern** (string) _(optional)_: For type "links": regex pattern to filter URLs.
- **waitForSelector** (string) _(optional)_: Optional: after clicking, wait until this selector appears (max 10s) before extracting.
- **waitMs** (integer) _(optional)_: Optional: milliseconds to wait after clicking before extracting (default: 0).

---

### `extract_form_data`

**Description:** [`Extract`](#extract) form structure and current values, including hidden fields. By default returns all matching forms; pass formIndex to inspect a single form. Password values are masked unless maskPasswords is set to false.

**Parameters:**

- **formIndex** (integer) _(optional)_: Index of a single form to inspect when multiple forms match. When omitted, all matching forms are returned.
- **formSelector** (string) _(optional)_: CSS selector for the form(s) (default: "form").
- **maskPasswords** (boolean) _(optional)_: Mask password field values as "**\*\*\*\***" instead of returning the plaintext value (default: true).

---

### `extract_metadata`

**Description:** [`Extract`](#extract) page metadata including JSON-LD, Open Graph, Twitter cards, and standard meta tags.

**Parameters:** None

---
