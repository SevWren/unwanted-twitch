(function() {
    const testSuiteName = "blacklist.js (Logic & Data)";
    let testCount = 0;
    let assertionsMade = 0;
    let mockDocument;
    let mockWindow;
    let mockChrome; // Will use globalThis.chrome, reset in test()

    // Assertion Helpers
    function assertEquals(expected, actual, message) { assertionsMade++; if (expected !== actual) throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`); }
    function assertDeepEquals(expected, actual, message) { assertionsMade++; if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Assertion Failed: ${message}. Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}.`); }
    function assertTrue(actual, message) { assertionsMade++; if (actual !== true) throw new Error(`Assertion Failed: ${message}. Expected "true", but got "${actual}".`); }
    function assertFalse(actual, message) { assertionsMade++; if (actual !== false) throw new Error(`Assertion Failed: ${message}. Expected "false", but got "${actual}".`); }
    function assertNotNull(actual, message) { assertionsMade++; if (actual === null) throw new Error(`Assertion Failed: ${message}. Expected not "null", but got "${actual}".`); }
    function assertCondition(condition, message) { assertionsMade++; if (!condition) throw new Error(`Assertion Failed: ${message}. Condition was not met.`); }


    // Mock DOM Setup (similar to blacklist_dom_test.js)
    function setupMockDOMForBlacklist() {
        mockDocument = {
            _elements: {},
            getElementById: function(id) {
                if (!this._elements[id]) {
                    let tagName = 'div';
                    if (id.includes('Table') || id.endsWith('sList')) tagName = 'table';
                    if (id.endsWith('Input')) tagName = 'input';
                    if (id.includes('Button') || id.startsWith('clear') || id.startsWith('save') || id.startsWith('cancel')) tagName = 'button';
                    if (id.startsWith('toggle') && !id.includes('Button')) tagName = 'input';

                    this._elements[id] = {
                        id: id, tagName: tagName.toUpperCase(), textContent: '', value: '', checked: false, style: { display: '' },
                        classList: { _classes: new Set(), add: function(c){this._classes.add(c);}, remove: function(c){this._classes.delete(c);}, contains: function(c){return this._classes.has(c);}, toggle: function(c){if(this.contains(c))this.remove(c);else this.add(c);}},
                        rows: [], tBodies: [{ rows: [], insertRow: function() { const r = { id:`row_${Date.now()}`, cells:[], querySelectorAll:()=>[], setAttribute:(n,v)=>{r[`data-${n}`]=v;}, getAttribute:(n)=>r[`data-${n}`]}; this.rows.push(r); return r;}, appendChild: function(r){this.rows.push(r); r.parentNode = this;} }],
                        appendChild: function(child) { if (this.tagName === 'TABLE') this.tBodies[0].appendChild(child); },
                        insertBefore: function(){}, removeChild: function(child){ if(this.tagName === 'TABLE' || this.tagName === 'TBODY'){ const idx = this.tBodies[0].rows.findIndex(r => r.id === child.id); if(idx > -1) this.tBodies[0].rows.splice(idx,1);}},
                        querySelector: function(s){ if (s === 'tbody') return this.tBodies[0]; return null; },
                        querySelectorAll: function(s){ if (s === 'tr.item') return this.tBodies[0].rows.filter(r => r.classList.contains('item')); return []; },
                        addEventListener: function(type, listener){ this.listeners = this.listeners || {}; this.listeners[type] = listener; },
                        dispatchEvent: function(event){ if(this.listeners && this.listeners[event.type]) this.listeners[event.type].call(this, event); },
                        focus: () => {}, setAttribute: (n,v)=>{this[`data-${n}`]=v;}, getAttribute: (n)=>this[`data-${n}`],
                        cells: [], insertCell: function(){ const c = {textContent:'',appendChild:function(){}}; this.cells.push(c); return c; },
                        parentNode: null, type: (tagName === 'input' && id.startsWith('toggle')) ? 'checkbox' : 'text'
                    };
                }
                return this._elements[id];
            },
            createElement: function(tagName) {
                const el = {
                    tagName: tagName.toUpperCase(), textContent: '', value: '', checked: false, style: {display: ''}, type: 'text',
                    classList: { _classes: new Set(), add: function(c){this._classes.add(c);}, remove: function(c){this._classes.delete(c);}, contains: function(c){return this._classes.has(c);}},
                    rows: [], tBodies: [{rows:[], insertRow: function(){ const r = {cells:[]}; this.rows.push(r); return r;}}],
                    appendChild: function(child){ if(el.tagName === 'A' && child.tagName === 'INPUT') { /* special case for file input hack */ } else if (el.tagName === 'TABLE') el.tBodies[0].rows.push(child);},
                    insertBefore: function(){}, removeChild: function(){}, querySelector: function(){return null;}, querySelectorAll: function(){return [];},
                    addEventListener: function(type, listener){ el.listeners = el.listeners || {}; el.listeners[type] = listener;},
                    dispatchEvent: function(event){ if(el.listeners && el.listeners[event.type]) el.listeners[event.type].call(el, event);},
                    click: function() { if(el.listeners && el.listeners['click']) el.listeners['click'].call(el, new Event('click')); }, // Mock click for <a> and <input type="file">
                    focus: () => {}, setAttribute: (n,v)=>{el[n]=v;}, getAttribute: (n)=>el[n],
                    cells: [], insertCell: function(){ const c = {textContent:'',appendChild:function(){}}; this.cells.push(c); return c; },
                    parentNode: null, download: null, href: null, files: [],
                };
                if (tagName === 'input') el.type = 'text'; // default for input
                return el;
            }
        };
        globalThis.document = mockDocument;

        mockWindow = { // From previous test file, ensure it's reset/available
            alert: (message) => { mockWindow._lastAlert = message; mockConsole.log("window.alert:", message); },
            _lastAlert: null,
            setInterval: (func, delay) => { mockWindow._intervalId = Date.now(); return mockWindow._intervalId; },
            clearInterval: (id) => { mockWindow._intervalId = null; }, _intervalId: null,
            confirm: (message) => { mockWindow._lastConfirm = message; return mockWindow._confirmResponse; }, // Added confirm
            _lastConfirm: null, _confirmResponse: true, // Default confirm to true
        };
        globalThis.window = { ...globalThis.window, ...mockWindow };

        const elementIds = ["categoriesTable", "channelsTable", "tagsTable", "titlesTable", "categoryInput", "channelInput", "tagInput", "titleInput", "addCategoryButton", "addChannelButton", "addTagButton", "addTitleButton", "clearCategoriesButton", "clearChannelsButton", "clearTagsButton", "clearTitlesButton", "toggleSort", "toggleNormalize", "toggleComments", "toggleDebug", "toggleExperimental", "useSyncStorage", "hideFollowing", "hideReruns", "saveButton", "cancelButton", "importButton", "exportButton", "processingScreen", "patternExplained", "versionNumber"];
        elementIds.forEach(id => mockDocument.getElementById(id)); // Pre-populate common elements
    }

    function test(testName, testFunction) {
        testCount++;
        setupMockDOMForBlacklist();
        mockChrome = globalThis.chrome; // Use the global mock, enhance as needed in tests

        // Reset chrome API mocks state
        mockChrome.runtime.lastError = null;
        if(mockChrome.runtime.sendMessage) mockChrome.runtime.sendMessage._lastMessage = null;
        if(mockChrome.tabs.getCurrent) mockChrome.tabs.getCurrent._currentTab = { id: 123, url: "test_tab_url" }; // Default mock
        if(mockChrome.tabs.remove) mockChrome.tabs.remove._lastRemovedTabId = null;
        mockChrome.storage.local._store = {};
        mockChrome.storage.sync._store = {};
        if(mockChrome.i18n && mockChrome.i18n.getMessage) mockChrome.i18n.getMessage._callLog = [];

        // Reset window spies
        mockWindow._lastAlert = null;
        mockWindow._lastConfirm = null;
        mockWindow._confirmResponse = true; // Default confirm to true

        isModified = false; // Reset global from blacklist.js
        if(globalThis.loadingOperation) globalThis.loadingOperation = Promise.resolve(); // Reset loadingOperation

        try {
            // Execute the test function. It might be async.
            const result = testFunction();
            if (result && typeof result.then === 'function') { // If it's a promise
                result.then(() => {
                    reportTestResult(`${testSuiteName}: ${testName}`, true);
                }).catch(error => {
                    reportTestResult(`${testSuiteName}: ${testName}`, false, error);
                });
            } else { // Synchronous test
                reportTestResult(`${testSuiteName}: ${testName}`, true);
            }
        } catch (error) { // Catch sync errors
            reportTestResult(`${testSuiteName}: ${testName}`, false, error);
        }
    }

    // Helper to add a mock item row directly to a table mock
    function addMockRowToTable(tableMock, key) {
        const tr = tableMock.tBodies[0].insertRow();
        tr.classList.add('item');
        tr.setAttribute('key', key);
        const td1 = tr.insertCell();
        td1.textContent = key;
        const td2 = tr.insertCell();
        const btn = mockDocument.createElement('button');
        btn.textContent = "Remove";
        btn.setAttribute('key', key);
        td2.appendChild(btn);
        return tr;
    }

    // --- Tests ---
    test("gatherKeysMap should create a map of keys from table rows", () => {
        const table = mockDocument.getElementById('categoriesTable');
        addMockRowToTable(table, "cat1");
        addMockRowToTable(table, "cat2");
        const map = gatherKeysMap(table);
        assertDeepEquals({ "cat1": 1, "cat2": 1 }, map, "Key map generation");
    });

    test("gatherKeysArray should create an array of keys from table rows", () => {
        const table = mockDocument.getElementById('channelsTable');
        addMockRowToTable(table, "chan1");
        addMockRowToTable(table, "chan2");
        const arr = gatherKeysArray(table);
        assertDeepEquals(["chan1", "chan2"], arr.sort(), "Key array generation"); // Sort for consistent comparison
    });

    test("onSave should gather settings and items, and send message", async () => {
        // Setup initial state
        mockDocument.getElementById('toggleSort').checked = true;
        mockDocument.getElementById('toggleNormalize').checked = false;
        mockDocument.getElementById('categoryInput').value = "newCat"; // Pending input
        addMockRowToTable(mockDocument.getElementById('channelsTable'), "existingChan");

        let onAddItemCalledForKey = null;
        const origOnAddItem = globalThis.onAddItem;
        globalThis.onAddItem = (inputElement, byUser) => { // Mock onAddItem to capture its call
            onAddItemCalledForKey = inputElement.value;
            // Simulate it adding the item so gatherKeysMap finds it
            if (inputElement.id === "categoryInput" && inputElement.value) addItem(mockDocument.getElementById('categoriesTable'), normalizeCase(inputElement.value));
            inputElement.value = ""; // Clear input as original does
        };

        let sendMessagePayload = null;
        mockChrome.runtime.sendMessage = async (message) => { sendMessagePayload = message; return { success: true }; };

        let onCancelCalled = false;
        const origOnCancel = globalThis.onCancel;
        globalThis.onCancel = () => { onCancelCalled = true; /* Don't actually close tab */ };

        await onSave();

        assertEquals("newcat", onAddItemCalledForKey, "onAddItem should be called for pending input 'newCat'");

        assertNotNull(sendMessagePayload, "chrome.runtime.sendMessage should be called");
        assertEquals(true, sendMessagePayload.settings.options.sort, "Sort setting");
        assertEquals(false, sendMessagePayload.settings.options.normalize, "Normalize setting");

        assertNotNull(sendMessagePayload.items.categories, "Categories should be in payload");
        assertEquals(1, sendMessagePayload.items.categories['newcat'], "'newcat' should be in categories");

        assertNotNull(sendMessagePayload.items.channels, "Channels should be in payload");
        assertEquals(1, sendMessagePayload.items.channels['existingChan'], "'existingChan' should be in channels");

        assertFalse(isModified, "isModified should be reset after successful save");
        assertTrue(onCancelCalled, "onCancel should be called after successful save");

        globalThis.onAddItem = origOnAddItem;
        globalThis.onCancel = origOnCancel;
    });

    test("onSave handles sendMessage failure (e.g. quota error with switchToLocal)", async () => {
        mockChrome.runtime.sendMessage = async (message) => { return { success: false, error: "QUOTA_BYTES", switchedToLocal: true }; };
        mockWindow._lastAlert = null; // Reset alert spy
        let onCancelCalled = false;
        const origOnCancel = globalThis.onCancel; globalThis.onCancel = () => { onCancelCalled = false; }; // Ensure it's not called on failure

        await onSave();

        assertFalse(onCancelCalled, "onCancel should not be called on save failure");
        assertTrue(mockDocument.getElementById('useSyncStorage').checked === false, "useSyncStorage checkbox should be unchecked");
        assertNotNull(mockWindow._lastAlert, "Alert should be shown for quota error and switch to local");
        assertEquals(chrome.i18n.getMessage('blacklist_SaveQuotaErrorSwitchToLocal'), mockWindow._lastAlert, "Quota error alert message");
        assertTrue(isModified, "isModified should remain true on failure to allow retry"); // isModified is reset by onCancel which shouldn't be called

        globalThis.onCancel = origOnCancel;
    });


    test("onCancel should close the current tab", async () => {
        mockChrome.tabs.getCurrent = async () => ({ id: 777 });
        let removedTabId = null;
        mockChrome.tabs.remove = async (tabId) => { removedTabId = tabId; };

        await onCancel();
        assertEquals(777, removedTabId, "chrome.tabs.remove should be called with current tab ID");
    });

    test("onImport should process valid JSON and call addItems", async () => {
        const mockFile = { name: "test.json", type: "application/json" };
        const mockReader = {
            result: JSON.stringify({ categories: ["importedCat"], titles: ["importedTitle"] }),
            onload: null, // FileReader's onload will be set by onImport
            readAsText: function() { if(this.onload) this.onload({ target: this }); } // Simulate read & trigger onload
        };
        // Mock FileReader constructor
        const OrigFileReader = globalThis.FileReader;
        globalThis.FileReader = function() { return mockReader; };
        // Mock input element creation and click
        let inputClicked = false;
        const mockInputElement = {
            type: 'file', accept: '.json', files: [mockFile],
            addEventListener: (type, listener) => { if(type==='change') mockInputElement.onChange = listener; },
            click: () => { inputClicked = true; if(mockInputElement.onChange) mockInputElement.onChange(); } // Simulate click and then change event
        };
        mockDocument.createElement = (tagName) => { if(tagName==='input') return mockInputElement; return OrigFileReader.createElement(tagName);}; // Use original for other elements

        let addItemsCalls = [];
        const origAddItems = globalThis.addItems;
        globalThis.addItems = (table, items) => { addItemsCalls.push({ tableId: table.id, items }); origAddItems(table, items); };
        mockWindow._lastAlert = null;

        await onImport(); // Triggers the mocked file input flow

        assertTrue(inputClicked, "File input click should be simulated");
        assertEquals(2, addItemsCalls.length, "addItems should be called for categories and titles");
        assertTrue(addItemsCalls.some(call => call.tableId === 'categoriesTable' && call.items.importedCat === 1), "addItems for categories");
        assertTrue(addItemsCalls.some(call => call.tableId === 'titlesTable' && call.items[0] === "importedTitle"), "addItems for titles");
        assertEquals(chrome.i18n.getMessage('blacklist_ImportSuccessful'), mockWindow._lastAlert, "Success alert after import");

        globalThis.FileReader = OrigFileReader;
        globalThis.addItems = origAddItems;
        mockDocument.createElement = setupMockDOMForBlacklist.createElement; // Restore generic mock
    });

    test("onExport should generate and trigger download of blacklist JSON", () => {
        addMockRowToTable(mockDocument.getElementById('tagsTable'), "exportTag");
        mockDocument.getElementById('toggleSort').checked = true; // A setting

        let linkClicked = false;
        let createdLink = null;
        mockDocument.createElement = (tagName) => {
            if (tagName === 'a') {
                createdLink = {
                    href: '', download: '', style: {},
                    click: () => { linkClicked = true; },
                    setAttribute: function(name, value) { this[name] = value; },
                    parentNode: { removeChild: () => {} } // Mock removeChild if called
                };
                return createdLink;
            }
            // Fallback for other elements if needed by underlying functions
            return setupMockDOMForBlacklist.createElement(tagName);
        };
        // Mock getRootNode for document.body.appendChild (not strictly needed if not asserting append)
        mockDocument.body = { appendChild: () => {}, removeChild: () => {} };


        onExport();

        assertTrue(linkClicked, "Download link should be clicked");
        assertNotNull(createdLink.href, "Download link href should be set");
        assertTrue(createdLink.href.startsWith('data:text/json;charset=utf-8,'), "Blob URL prefix");
        const jsonData = JSON.parse(decodeURIComponent(createdLink.href.substring('data:text/json;charset=utf-8,'.length)));

        assertEquals(true, jsonData.settings.options.sort, "Exported settings should include sort");
        assertNotNull(jsonData.items.tags, "Exported items should include tags");
        assertEquals("exportTag", jsonData.items.tags[0], "Exported tag value"); // gatherKeysArray returns array

        const dateStr = new Date().toISOString().slice(0,10);
        assertEquals(`unwanted_twitch_blacklist_${dateStr}.json`, createdLink.download, "Download filename");

        mockDocument.createElement = setupMockDOMForBlacklist.createElement; // Restore
        mockDocument.body = undefined; // Clean up body mock
    });

    test("loadBlacklistedItems should call addItems for each item type from storage", async () => {
        const storedData = {
            categories: { "catA": 1 },
            channels: { "chanB": 1 },
            tags: { "tagC": 1 },
            titles: ["titleD"]
        };
        mockChrome.storage.local.get = async (keys) => {
            if (keys === null || keys.includes('blItems')) return { blItems: storedData };
            return {};
        };

        let addItemsLog = [];
        const origAddItems = globalThis.addItems;
        globalThis.addItems = (table, items) => { addItemsLog.push({tableId: table.id, items}); /* Don't call original to avoid DOM interaction */ };

        await loadBlacklistedItems();

        assertEquals(4, addItemsLog.length, "addItems calls for each type");
        assertTrue(addItemsLog.some(c => c.tableId === 'categoriesTable' && c.items.catA === 1), "Categories loaded");
        assertTrue(addItemsLog.some(c => c.tableId === 'channelsTable' && c.items.chanB === 1), "Channels loaded");
        assertTrue(addItemsLog.some(c => c.tableId === 'tagsTable' && c.items.tagC === 1), "Tags loaded");
        assertTrue(addItemsLog.some(c => c.tableId === 'titlesTable' && c.items[0] === "titleD"), "Titles loaded");

        globalThis.addItems = origAddItems;
    });

    test("loadHideFollowing, loadHideReruns correctly set checkbox states", async () => {
        mockChrome.storage.local.get = async (keys) => {
            if (keys.includes('hideFollowing')) return { hideFollowing: true };
            if (keys.includes('hideReruns')) return { hideReruns: false };
            return {};
        };
        await loadHideFollowing();
        assertTrue(mockDocument.getElementById('hideFollowing').checked, "hideFollowingCheckbox true");
        await loadHideReruns();
        assertFalse(mockDocument.getElementById('hideReruns').checked, "hideRerunsCheckbox false");

        mockChrome.storage.local.get = async (keys) => ({}); // Simulate not set
        await loadHideFollowing(); // Should default to false as per blacklist.js init
        assertFalse(mockDocument.getElementById('hideFollowing').checked, "hideFollowingCheckbox default false");
    });

    test("loadStorageMode correctly sets useSyncStorage checkbox", async () => {
        // Mock getStorageMode which is part of common.js, already tested.
        // Here, we directly mock its output for testing loadStorageMode's effect.
        const origGetStorageMode = globalThis.getStorageMode;

        globalThis.getStorageMode = async () => 'sync';
        await loadStorageMode();
        assertTrue(mockDocument.getElementById('useSyncStorage').checked, "useSyncStorage checkbox true for sync mode");

        globalThis.getStorageMode = async () => 'local';
        await loadStorageMode();
        assertFalse(mockDocument.getElementById('useSyncStorage').checked, "useSyncStorage checkbox false for local mode");

        globalThis.getStorageMode = origGetStorageMode;
    });


    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
