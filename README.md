# Chrome DevTools Debug MCP Server

An MCP server for Chrome DevTools Protocol debugging capabilities. Provides full access to browser debugging features including breakpoints, network interception, DOM inspection, and more.

## Installation

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "chrome-devtools-debug": {
      "command": "npx",
      "args": ["chrome-devtools-debug-mcp@latest"]
    }
  }
}
```

## Tools Reference

### Browser / Page Management

| Tool | Description |
|------|-------------|
| `start_chrome` | Launch Chrome with debugging enabled |
| `stop_chrome` | Stop the Chrome process started with `start_chrome` |
| `connect` | Connect to an existing Chrome instance |
| `disconnect` | Disconnect from Chrome without stopping the browser |
| `list_targets` | List available debug targets (pages, workers, etc.) |
| `get_version` | Get Chrome version and protocol version |
| `navigate` | Navigate the page to a URL |
| `reload` | Reload the current page |

### Debugger Domain

Control JavaScript debugging with breakpoints and stepping.

| Tool | Description |
|------|-------------|
| `debugger_enable` | Enable the debugger (required before setting breakpoints) |
| `debugger_disable` | Disable the debugger and remove all breakpoints |
| `set_breakpoint` | Set a breakpoint by URL pattern and line number |
| `set_breakpoint_by_id` | Set a breakpoint at a specific location in a loaded script |
| `remove_breakpoint` | Remove a breakpoint by its ID |
| `list_breakpoints` | List all active breakpoints |
| `pause` | Pause JavaScript execution |
| `resume` | Resume JavaScript execution |
| `step_over` | Step to the next line, stepping over function calls |
| `step_into` | Step into a function call |
| `step_out` | Step out of the current function |
| `get_call_frames` | Get the current call stack when paused |
| `get_scope_variables` | Get variables in a scope of a call frame |
| `evaluate_on_frame` | Evaluate an expression in the context of a call frame |
| `set_pause_on_exceptions` | Configure when to pause on exceptions (none/uncaught/all) |
| `set_async_stack_depth` | Set maximum depth of async call stacks |
| `list_scripts` | List all parsed scripts |
| `get_script_source` | Get the source code of a script |
| `get_pause_state` | Get current pause state of the debugger |

### Runtime Domain

Evaluate JavaScript and inspect objects.

| Tool | Description |
|------|-------------|
| `evaluate` | Evaluate JavaScript expression in the page context |
| `get_properties` | Get properties of an object by its objectId |
| `release_object` | Release an object reference to free memory |
| `get_console_messages` | Get collected console messages (console.log, console.error, etc.) |
| `get_exceptions` | Get collected runtime exceptions |
| `clear_console` | Clear collected console messages and exceptions |

### Network Domain

Monitor network requests and responses.

| Tool | Description |
|------|-------------|
| `network_enable` | Enable network request collection |
| `network_disable` | Disable network request collection |
| `list_requests` | List collected network requests |
| `get_request_details` | Get detailed information about a network request |
| `get_response_body` | Get the response body of a completed request |
| `clear_requests` | Clear collected network requests |
| `get_network_summary` | Get summary of collected network requests |

### Fetch Domain

Intercept and modify network requests.

| Tool | Description |
|------|-------------|
| `fetch_enable` | Enable request interception |
| `fetch_disable` | Disable request interception |
| `add_intercept_rule` | Add a rule for handling intercepted requests |
| `remove_intercept_rule` | Remove an intercept rule |
| `list_intercept_rules` | List all intercept rules |
| `list_paused_requests` | List requests paused waiting for a decision |
| `continue_request` | Continue a paused request, optionally modifying it |
| `fulfill_request` | Respond to a paused request with a mock response |
| `fulfill_request_with_file` | Respond to a paused request with file contents |
| `fail_request` | Fail a paused request with an error |

### DOM Domain

Inspect and query the DOM tree.

| Tool | Description |
|------|-------------|
| `dom_enable` | Enable DOM domain for DOM tree access |
| `dom_disable` | Disable DOM domain |
| `get_document` | Get the root DOM node |
| `query_selector` | Find an element by CSS selector |
| `query_selector_all` | Find all elements matching a CSS selector |
| `get_outer_html` | Get the outer HTML of an element |
| `get_attributes` | Get attributes of an element |
| `get_box_model` | Get the box model (dimensions and position) of an element |
| `resolve_node` | Get a JavaScript object reference for a DOM node |

### DOMDebugger Domain

Set breakpoints on DOM mutations and events.

| Tool | Description |
|------|-------------|
| `set_dom_breakpoint` | Set a breakpoint on DOM mutations (subtree/attribute/removal) |
| `remove_dom_breakpoint` | Remove a DOM breakpoint |
| `set_event_breakpoint` | Break when a specific event is fired (click, submit, etc.) |
| `remove_event_breakpoint` | Remove an event breakpoint |
| `set_xhr_breakpoint` | Break when an XHR/fetch request matches a URL pattern |
| `remove_xhr_breakpoint` | Remove an XHR breakpoint |
| `get_event_listeners` | Get all event listeners attached to an element |

### Input Domain

Simulate user input (mouse, keyboard).

| Tool | Description |
|------|-------------|
| `click` | Click at coordinates |
| `click_element` | Click on an element by node ID (clicks at center) |
| `type_text` | Type text into the focused element |
| `press_key` | Press a key or key combination |
| `scroll` | Scroll the page or an element |
| `move_mouse` | Move the mouse to a position |

### Log Domain

Collect browser-level logs.

| Tool | Description |
|------|-------------|
| `log_enable` | Enable browser log collection |
| `log_disable` | Disable browser log collection |
| `get_log_entries` | Get collected browser log entries |
| `clear_log` | Clear collected log entries |

### ServiceWorker Domain

Manage service workers.

| Tool | Description |
|------|-------------|
| `service_worker_enable` | Enable ServiceWorker domain to track service workers |
| `service_worker_disable` | Disable ServiceWorker tracking |
| `list_service_workers` | List all registered service workers |
| `start_worker` | Start a service worker |
| `stop_worker` | Stop a running service worker |
| `update_registration` | Force update a service worker registration |
| `skip_waiting` | Skip waiting state for a service worker |

## License

MIT
