/**
 * Construct SDK source for injection into dev app iframes.
 * These are the same JS/CSS strings served by the backend for local apps,
 * duplicated here so the frontend can inject them into dev app HTML
 * fetched from localhost (where the backend can't reach).
 */

// Keep in sync with worker/src/lib/local-app-sdk.ts
export const CONSTRUCT_JS = `(function() {
  'use strict';
  try { window.sessionStorage; } catch(e) {
    Object.defineProperty(window, 'sessionStorage', { value: { getItem: function(){return null}, setItem: function(){}, removeItem: function(){}, clear: function(){}, length: 0 }, configurable: true });
  }
  try { window.localStorage; } catch(e) {
    Object.defineProperty(window, 'localStorage', { value: { getItem: function(){return null}, setItem: function(){}, removeItem: function(){}, clear: function(){}, length: 0 }, configurable: true });
  }
  var _readyCallbacks = [];
  var _ready = false;
  var _reqId = 0;
  var _pending = {};
  var _stateListeners = [];
  function sendRequest(method, params) {
    return new Promise(function(resolve, reject) {
      var id = 'req_' + (++_reqId);
      _pending[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({ type: 'construct:request', id: id, method: method, params: params || {} }, '*');
    });
  }
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data) return;
    if (data.type === 'construct:response' && data.id) {
      var handler = _pending[data.id];
      if (handler) {
        delete _pending[data.id];
        if (data.error) { handler.reject(new Error(data.error)); } else { handler.resolve(data.result); }
      }
      return;
    }
    if (data.type === 'construct:state_updated') {
      for (var i = 0; i < _stateListeners.length; i++) {
        try { _stateListeners[i](data.state); } catch(e) { console.error('[construct] state listener error:', e); }
      }
      return;
    }
  });
  var construct = {
    ready: function(cb) { if (_ready) { cb(); } else { _readyCallbacks.push(cb); } },
    state: {
      get: function() { return sendRequest('state.get'); },
      set: function(state) { return sendRequest('state.set', { state: state }); },
      onUpdate: function(cb) { _stateListeners.push(cb); }
    },
    ui: {
      setTitle: function(title) { return sendRequest('ui.setTitle', { title: title }); },
      getTheme: function() { return sendRequest('ui.getTheme'); },
      close: function() { return sendRequest('ui.close'); }
    },
    agent: { notify: function(message) { return sendRequest('agent.notify', { message: message }); } },
    tools: {
      call: function(tool, args) { return sendRequest('tools.call', { tool: tool, arguments: args || {} }); },
      callText: function(tool, args) {
        return sendRequest('tools.call', { tool: tool, arguments: args || {} }).then(function(result) {
          if (result && result.result && Array.isArray(result.result.content)) {
            return result.result.content.filter(function(c) { return c.type === 'text'; }).map(function(c) { return c.text; }).join('\\n');
          }
          return typeof result === 'string' ? result : JSON.stringify(result);
        });
      }
    }
  };
  window.construct = construct;
  function fireReady() {
    if (_ready) return;
    _ready = true;
    for (var i = 0; i < _readyCallbacks.length; i++) {
      try { _readyCallbacks[i](); } catch(e) { console.error('[construct] ready callback error:', e); }
    }
    _readyCallbacks = [];
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fireReady); } else { fireReady(); }
})();`;

export const CONSTRUCT_CSS = `:root {
  --c-bg: #0a0a0f;
  --c-bg-secondary: #111118;
  --c-text: #e0e0e8;
  --c-text-secondary: #8888a0;
  --c-accent: #60a5fa;
  --c-border: rgba(255, 255, 255, 0.06);
  --c-font: 'Space Grotesk', system-ui, -apple-system, sans-serif;
  --c-font-mono: 'IBM Plex Mono', monospace;
}
body { font-family: var(--c-font); background: var(--c-bg); color: var(--c-text); }
.btn { font-size: 12px; font-weight: 600; padding: 6px 16px; border-radius: 6px; border: 1px solid var(--c-border); background: rgba(255, 255, 255, 0.05); color: var(--c-text); cursor: pointer; transition: background 0.15s; }
.btn:hover { background: rgba(255, 255, 255, 0.1); }
.badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--c-border); }`;

/**
 * Inject the Construct SDK into an HTML string and set a <base> tag for relative URL resolution.
 */
export function injectSdk(html: string, baseUrl: string): string {
  const sdkScript = `<script>${CONSTRUCT_JS}<\/script>`;
  const sdkStyle = `<style>${CONSTRUCT_CSS}</style>`;
  const baseTag = `<base href="${baseUrl}/">`;

  // Remove any external SDK references
  let result = html
    .replace(/<script[^>]*src=["'][^"']*construct\.js["'][^>]*><\/script>/gi, '')
    .replace(/<link[^>]*href=["'][^"']*construct\.css["'][^>]*\/?>/gi, '');

  // Inject at the start of <head>
  const headMatch = result.match(/<head[^>]*>/i);
  if (headMatch) {
    const insertPos = headMatch.index! + headMatch[0].length;
    result = result.slice(0, insertPos) + '\n' + baseTag + '\n' + sdkStyle + '\n' + sdkScript + '\n' + result.slice(insertPos);
  } else {
    result = baseTag + '\n' + sdkStyle + '\n' + sdkScript + '\n' + result;
  }

  return result;
}
