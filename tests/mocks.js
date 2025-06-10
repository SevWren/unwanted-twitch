// Basic console override for capturing logs if needed
const mockConsole = {
    log: (...args) => console.log('[TEST LOG]', ...args),
    warn: (...args) => console.warn('[TEST WARN]', ...args),
    error: (...args) => console.error('[TEST ERROR]', ...args),
    info: (...args) => console.info('[TEST INFO]', ...args),
    trace: (...args) => console.trace('[TEST TRACE]', ...args),
    verbose: (...args) => console.log('[TEST VERBOSE]', ...args), // map verbose to log
};

// Mock chrome APIs
globalThis.chrome = {
    i18n: {
        getMessage: function(messageName, substitutions) {
            if (substitutions) {
                return messageName + JSON.stringify(substitutions);
            }
            return messageName;
        }
    },
    runtime: {
        id: "mockid", // Added for getURL
        lastError: null,
        getURL: function(path) { // Added for chrome.runtime.getURL calls
            return `chrome-extension://${this.id}${path.startsWith('/') ? '' : '/'}${path}`;
        },
        sendMessage: function(message, callback) {
            mockConsole.log('chrome.runtime.sendMessage called with:', message);
            this._lastMessage = message; // Store last message
            if (callback) {
                setTimeout(() => callback({ success: true, message: "Mock response" }), 0);
            }
            return Promise.resolve({ success: true, message: "Mock response" });
        },
        _lastMessage: null, // Initialize spy property
        onMessage: {
            addListener: function(callback) {
                mockConsole.log('chrome.runtime.onMessage.addListener called');
                this._listener = callback;
            },
            _listener: null,
            trigger: function(...args) {
                if (this._listener) {
                   return this._listener(...args);
                }
            }
        }
    },
    storage: { /* ... existing storage mock ... */
        local: {
            get: function(keys, callback) {
                mockConsole.log('chrome.storage.local.get called with:', keys);
                const result = {};
                if (keys === null) { Object.assign(result, this._store); }
                else if (typeof keys === 'string') { if (this._store.hasOwnProperty(keys)) result[keys] = this._store[keys]; }
                else if (Array.isArray(keys)) { keys.forEach(key => { if (this._store.hasOwnProperty(key)) result[key] = this._store[key]; }); }
                else if (typeof keys === 'object') { Object.keys(keys).forEach(key => { result[key] = this._store.hasOwnProperty(key) ? this._store[key] : keys[key]; }); }
                if (callback) setTimeout(() => callback(result), 0);
                return Promise.resolve(result);
            },
            set: function(items, callback) { mockConsole.log('chrome.storage.local.set called with:', items); Object.assign(this._store, items); if (callback) setTimeout(() => callback(), 0); return Promise.resolve(); },
            remove: function(keys, callback) { mockConsole.log('chrome.storage.local.remove called with:', keys); if (typeof keys === 'string') delete this._store[keys]; else if (Array.isArray(keys)) keys.forEach(key => delete this._store[key]); if (callback) setTimeout(() => callback(), 0); return Promise.resolve(); },
            clear: function(callback) { mockConsole.log('chrome.storage.local.clear called'); this._store = {}; if (callback) setTimeout(() => callback(), 0); return Promise.resolve(); },
            getBytesInUse: function(keys, callback) { const size = JSON.stringify(this._store).length; if (callback) setTimeout(() => callback(size),0); return Promise.resolve(size); },
            _store: {}
        },
        sync: {
            get: function(keys, callback) { mockConsole.log('chrome.storage.sync.get called with:', keys); const result = {}; if (keys === null) { Object.assign(result, this._store); } else if (typeof keys === 'string') { if (this._store.hasOwnProperty(keys)) result[keys] = this._store[keys]; } else if (Array.isArray(keys)) { keys.forEach(key => { if (this._store.hasOwnProperty(key)) result[key] = this._store[key]; }); } else if (typeof keys === 'object') { Object.keys(keys).forEach(key => { result[key] = this._store.hasOwnProperty(key) ? this._store[key] : keys[key]; }); } if (callback) setTimeout(() => callback(result), 0); return Promise.resolve(result); },
            set: function(items, callback) { mockConsole.log('chrome.storage.sync.set called with:', items); Object.assign(this._store, items); if (callback) setTimeout(() => callback(), 0); return Promise.resolve(); },
            remove: function(keys, callback) { mockConsole.log('chrome.storage.sync.remove called with:', keys); if (typeof keys === 'string') delete this._store[keys]; else if (Array.isArray(keys)) keys.forEach(key => delete this._store[key]); if (callback) setTimeout(() => callback(), 0); return Promise.resolve(); },
            clear: function(callback) { mockConsole.log('chrome.storage.sync.clear called'); this._store = {}; if (callback) setTimeout(() => callback(), 0); return Promise.resolve(); },
            getBytesInUse: function(keys, callback) { const size = JSON.stringify(this._store).length; if (callback) setTimeout(() => callback(size),0); return Promise.resolve(size); },
            _store: {}
        },
        onChanged: {
            addListener: function(callback) { mockConsole.log('chrome.storage.onChanged.addListener called'); this._listener = callback; },
            _listener: null,
            trigger: function(changes, areaName) { if (this._listener) { this._listener(changes, areaName); } }
        }
    },
    tabs: {
        create: function(createProperties, callback) {
            mockConsole.log('chrome.tabs.create called with:', createProperties);
            this._lastUrl = createProperties.url; // Store URL
            const newTab = { id: Date.now(), ...createProperties };
            if (callback) setTimeout(() => callback(newTab), 0);
            return Promise.resolve(newTab);
        },
        _lastUrl: null, // Initialize spy property for create
        update: function(tabId, updateProperties, callback) {
            mockConsole.log('chrome.tabs.update called for tab', tabId, 'with:', updateProperties);
            this._lastUrl = updateProperties.url; // Store URL
            this._updateLog.push({ tabId, updateProperties }); // Log call
            if (callback) setTimeout(() => callback({ id: tabId, ...updateProperties }), 0);
            return Promise.resolve({ id: tabId, ...updateProperties });
        },
        // _lastUrl is now shared for create/update, specific tests should reset it
        _updateLog: [], // Initialize log
        query: function(queryInfo, callback) {
            mockConsole.log('chrome.tabs.query called with:', queryInfo);
            this._lastQueryInfo = queryInfo; // Store queryInfo
            // Return predefined results or an empty list
            const results = this._queryResults && this._queryResults.length > 0 ? this._queryResults : [];
            if (callback) setTimeout(() => callback(results), 0);
            return Promise.resolve(results);
        },
        _lastQueryInfo: null, // Initialize spy property
        _queryResults: [], // Test can set this to control query results
        getCurrent: function(callback) {
            mockConsole.log('chrome.tabs.getCurrent called');
            const currentTab = { id: 1, url: `chrome-extension://${chrome.runtime.id}/views/blacklist.html` };
             if (callback) setTimeout(() => callback(currentTab), 0);
            return Promise.resolve(currentTab);
        },
        remove: function(tabIds, callback){
            mockConsole.log('chrome.tabs.remove called with:', tabIds);
            if(callback) setTimeout(() => callback(), 0);
            return Promise.resolve();
        },
        sendMessage: function(tabId, message, options, callback) {
            mockConsole.log('chrome.tabs.sendMessage to tab', tabId, 'with message:', message);
            this._sendMessageLog.push({ tabId, message, options }); // Log call
            if (typeof options === 'function') callback = options;
            if (callback) setTimeout(() => callback({ success: true, response: "Mock response from tab " + tabId }), 0);
            return Promise.resolve({ success: true, response: "Mock response from tab " + tabId });
        },
        _sendMessageLog: [], // Initialize log
        onUpdated: {
            addListener: function(callback) {
                mockConsole.log('chrome.tabs.onUpdated.addListener called');
                if (!this._listeners) this._listeners = [];
                this._listeners.push(callback);
            },
            _listeners: [], // Store listeners
            trigger: async function(tabId, changeInfo, tab) { // Helper to manually trigger
                if (this._listeners) {
                    for (const listener of this._listeners) {
                        await listener(tabId, changeInfo, tab);
                    }
                }
            }
        }
    },
    action: {
        enable: function(tabId, callback) {
            mockConsole.log('chrome.action.enable called for tab:', tabId);
            this._lastTabId = tabId; // Store last tabId
            this._enableLog.push(tabId); // Log call
            if (callback) setTimeout(() => callback(), 0);
            return Promise.resolve();
        },
        _lastTabId: null, // Shared for enable/disable, specific tests should reset
        _enableLog: [], // Initialize log
        disable: function(tabId, callback) {
            mockConsole.log('chrome.action.disable called for tab:', tabId);
            this._lastTabId = tabId; // Store last tabId
            this._disableLog.push(tabId); // Log call
            if (callback) setTimeout(() => callback(), 0);
            return Promise.resolve();
        },
        _disableLog: [], // Initialize log
    }
};

globalThis.browser = globalThis.chrome; // For Firefox compatibility

globalThis.document = { /* ... existing document mock ... */
    getElementById: function(id) { mockConsole.log('document.getElementById called with:', id); let el = this._elements[id]; if (!el) { el = { id: id, value: '', textContent: '', checked: false, style: {}, classList: { add: (cn) => mockConsole.log('classList.add', cn, 'on', id), remove: (cn) => mockConsole.log('classList.remove', cn, 'on', id), toggle: (cn) => mockConsole.log('classList.toggle', cn, 'on', id), contains: (cn) => { mockConsole.log('classList.contains', cn, 'on', id); return false; } }, addEventListener: function(type, listener) { mockConsole.log('addEventListener', type, 'on', id); this._listeners = this._listeners || {}; this._listeners[type] = this._listeners[type] || []; this._listeners[type].push(listener); }, _listeners: {}, dispatchEvent: function(event) { mockConsole.log('dispatchEvent', event.type, 'on', id); if (this._listeners && this._listeners[event.type]) { this._listeners[event.type].forEach(listener => listener(event)); } }, querySelector: function(selector) { mockConsole.log('querySelector', selector, 'on', id); return this.getElementById(id + '_' + selector.replace(/[.#]/g, '')); }, querySelectorAll: function(selector) { mockConsole.log('querySelectorAll', selector, 'on', id); return [this.getElementById(id + '_' + selector.replace(/[.#]/g, ''))]; }, appendChild: function(child) { mockConsole.log('appendChild on', id, 'with child', child.id || child.tagName); }, removeChild: function(child) { mockConsole.log('removeChild on', id, 'with child', child.id || child.tagName); }, insertBefore: function(newNode, referenceNode) { mockConsole.log('insertBefore on', id); }, setAttribute: (name, value) => mockConsole.log('setAttribute', name, value, 'on', id), removeAttribute: (name) => mockConsole.log('removeAttribute', name, 'on', id), hasAttribute: (name) => { mockConsole.log('hasAttribute', name, 'on', id); return false; }, }; this._elements[id] = el; } return el; },
    createElement: function(tagName) { mockConsole.log('document.createElement called with:', tagName); const el = { tagName: tagName, id: '', value: '', textContent: '', checked: false, style: {}, className: '', classList: { _classes: new Set(), add: function(cn) { mockConsole.log('classList.add', cn, 'on new', tagName); this._classes.add(cn); }, remove: function(cn) { mockConsole.log('classList.remove', cn, 'on new', tagName); this._classes.delete(cn); }, toggle: function(cn) { mockConsole.log('classList.toggle', cn, 'on new', tagName); if(this._classes.has(cn)) this._classes.delete(cn); else this._classes.add(cn); }, contains: function(cn) { mockConsole.log('classList.contains', cn, 'on new', tagName); return this._classes.has(cn); } }, addEventListener: function(type, listener) { mockConsole.log('addEventListener', type, 'on new', tagName); }, dispatchEvent: function(event) { mockConsole.log('dispatchEvent', event.type, 'on new', tagName); }, querySelector: function(selector) { mockConsole.log('querySelector', selector, 'on new', tagName); return this.getElementById(tagName + '_' + selector.replace(/[.#]/g, '')); }, querySelectorAll: function(selector) { mockConsole.log('querySelectorAll', selector, 'on new', tagName); return [this.getElementById(tagName + '_' + selector.replace(/[.#]/g, ''))]; }, appendChild: function(child) { mockConsole.log('appendChild on new', tagName, 'with child', child.id || child.tagName); }, removeChild: function(child) { mockConsole.log('removeChild on new', tagName, 'with child', child.id || child.tagName);}, setAttribute: (name, value) => mockConsole.log('setAttribute', name, value, 'on new', tagName), removeAttribute: (name) => mockConsole.log('removeAttribute', name, 'on new', tagName), hasAttribute: (name) => { mockConsole.log('hasAttribute', name, 'on new', tagName); return false; }, }; el.getElementById = this.getElementById.bind(this); return el; },
    createDocumentFragment: function() { mockConsole.log('document.createDocumentFragment called'); return { appendChild: function(child) { mockConsole.log('appendChild on fragment'); }, }; },
    querySelector: function(selector) { mockConsole.log('document.querySelector called with:', selector); return this.getElementById('doc_' + selector.replace(/[.#]/g, '')); },
    querySelectorAll: function(selector) { mockConsole.log('document.querySelectorAll called with:', selector); return [this.getElementById('docAll_' + selector.replace(/[.#]/g, ''))]; },
    body: { appendChild: function(child) { mockConsole.log('document.body.appendChild called'); }, removeChild: function(child) { mockConsole.log('document.body.removeChild called'); }, },
    _elements: {}
};

globalThis.window = { /* ... existing window mock ... */
    location: { pathname: '/', href: 'http://mockhost/', reload: () => mockConsole.log('window.location.reload called') },
    alert: (message) => mockConsole.log('window.alert called with:', message),
    confirm: (message) => { mockConsole.log('window.confirm called with:', message); return true; },
    setTimeout: (func, delay) => { mockConsole.log('window.setTimeout called'); return globalThis.setTimeout(func, delay); },
    clearTimeout: (id) => { mockConsole.log('window.clearTimeout called'); globalThis.clearTimeout(id); },
    setInterval: (func, delay) => { mockConsole.log('window.setInterval called'); return globalThis.setInterval(func, delay); },
    clearInterval: (id) => { mockConsole.log('window.clearInterval called'); globalThis.clearInterval(id); },
};

globalThis.FileReader = function() { /* ... existing FileReader mock ... */
    mockConsole.log('new FileReader()'); this.onload = null; this.onerror = null; this.readAsText = function(file) { mockConsole.log('FileReader.readAsText called with file:', file.name); if (this.onload) { setTimeout(() => this.onload({ target: { result: '{"mock": "file content"}' } }), 0); } }; this.addEventListener = (type, listener) => { mockConsole.log('FileReader.addEventListener', type); if (type === 'load') this.onload = listener; if (type === 'error') this.onerror = listener; };
};

globalThis.MutationObserver = function(callback) { /* ... existing MutationObserver mock ... */
    mockConsole.log('new MutationObserver()'); this.observe = (target, options) => mockConsole.log('MutationObserver.observe called on:', target, 'with options:', options); this.disconnect = () => mockConsole.log('MutationObserver.disconnect called'); this.takeRecords = () => { mockConsole.log('MutationObserver.takeRecords called'); return []; }; this._callback = callback; this.trigger = (mutations) => { if (this._callback) { this._callback(mutations, this); } };
};

console.log("mocks.js loaded and global mocks (chrome, document, window) initialized with improved spy capabilities.");

// Initial reset of storage for safety, though tests should also manage this.
if (globalThis.chrome && globalThis.chrome.storage) {
    globalThis.chrome.storage.local._store = {};
    globalThis.chrome.storage.sync._store = {};
}
