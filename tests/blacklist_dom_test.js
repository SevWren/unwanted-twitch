(function() {
    const testSuiteName = "blacklist.js (DOM & Basic UI)";
    let testCount = 0;
    let assertionsMade = 0;
    let mockDocument;
    let mockWindow; // For window.alert and setInterval/clearInterval

    // Assertion Helpers
    function assertEquals(expected, actual, message) {
        assertionsMade++;
        if (expected !== actual) {
            throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`);
        }
    }
    function assertTrue(actual, message) { assertionsMade++; if (actual !== true) throw new Error(`Assertion Failed: ${message}. Expected "true", but got "${actual}".`); }
    function assertFalse(actual, message) { assertionsMade++; if (actual !== false) throw new Error(`Assertion Failed: ${message}. Expected "false", but got "${actual}".`); }
    function assertNotNull(actual, message) { assertionsMade++; if (actual === null) throw new Error(`Assertion Failed: ${message}. Expected not "null", but got "${actual}".`); }
    function assertCondition(condition, message) { assertionsMade++; if (!condition) throw new Error(`Assertion Failed: ${message}. Condition was not met.`); }

    // Mock DOM Setup
    function setupMockDOMForBlacklist() {
        mockDocument = {
            _elements: {},
            getElementById: function(id) {
                if (!this._elements[id]) {
                    // Create a mock element with basic properties needed by blacklist.js
                    let tagName = 'div'; // Default
                    if (id.includes('Table') || id.endsWith('sList')) tagName = 'table';
                    if (id.endsWith('Input')) tagName = 'input';
                    if (id.includes('Button') || id.startsWith('clear') || id.startsWith('save') || id.startsWith('cancel')) tagName = 'button';
                    if (id.startsWith('toggle') && !id.includes('Button')) tagName = 'input'; // checkboxes


                    this._elements[id] = {
                        id: id,
                        tagName: tagName.toUpperCase(),
                        textContent: '',
                        value: '',
                        checked: false,
                        style: { display: '' },
                        classList: { _classes: new Set(), add: function(c){this._classes.add(c);}, remove: function(c){this._classes.delete(c);}, contains: function(c){return this._classes.has(c);}, toggle: function(c){if(this.contains(c))this.remove(c);else this.add(c);}},
                        rows: [], // For tables
                        tBodies: [{ rows: [] , insertRow: function() { const r = { cells:[], querySelectorAll:()=>[] }; this.rows.push(r); return r;}, appendChild: function(r){this.rows.push(r);} }], // For tables
                        appendChild: function(child) {
                            if (this.tagName === 'TABLE' && child.tagName === 'TBODY') { /* no-op for tbody itself */ }
                            else if (this.tagName === 'TABLE' || (this.tagName === 'TBODY')) { this.tBodies[0].rows.push(child); child.parentNode = this; }
                            else { mockConsole.log(`appendChild on ${this.id} with ${child.id || child.tagName}`); }
                        },
                        insertBefore: function(newNode, referenceNode) { mockConsole.log('insertBefore on', this.id);},
                        removeChild: function(child) {
                            if (this.tagName === 'TABLE' || (this.tagName === 'TBODY')) {
                                const index = this.tBodies[0].rows.indexOf(child);
                                if (index > -1) this.tBodies[0].rows.splice(index, 1);
                            } else { mockConsole.log(`removeChild on ${this.id}`);}
                        },
                        querySelector: function(selector) {
                            if (selector === 'tbody') return this.tBodies[0];
                            if (selector === '.empty') return this.tBodies[0].rows.find(r => r.classList.contains('empty'));
                            return null;
                        },
                        querySelectorAll: function(selector) {
                            if (selector === 'tr.item') return this.tBodies[0].rows.filter(r => r.classList.contains('item'));
                            return [];
                        },
                        addEventListener: function(type, listener) { this.listeners = this.listeners || {}; this.listeners[type] = listener; mockConsole.log(`addEventListener ${type} on ${id}`);},
                        dispatchEvent: function(event) { if(this.listeners && this.listeners[event.type]) this.listeners[event.type].call(this, event); },
                        focus: () => mockConsole.log(`focus on ${id}`),
                        setAttribute: (name, value) => { this[`data-${name}`] = value; }, // Basic data-* attribute mock
                        getAttribute: (name) => this[`data-${name}`],
                        cells: [], // For TR elements
                        insertCell: function() {
                            const cell = createMockElement('td'); // Use createMockElement for cells too
                            this.cells.push(cell);
                            return cell;
                        },
                        parentNode: null // Set by appendChild if needed
                    };
                    if (tagName === 'input' && id.startsWith('toggle')) this._elements[id].type = 'checkbox';
                }
                return this._elements[id];
            },
            createElement: function(tagName) {
                const el = {
                    tagName: tagName.toUpperCase(), textContent: '', value: '', checked: false, style: {display: ''},
                    classList: { _classes: new Set(), add: function(c){this._classes.add(c);}, remove: function(c){this._classes.delete(c);}, contains: function(c){return this._classes.has(c);}},
                    rows: [], tBodies: [{rows:[], insertRow: function() { const r = {cells:[]}; this.rows.push(r); return r;}}],
                    appendChild: function(child) { if (this.tagName === 'TABLE') this.tBodies[0].rows.push(child); },
                    insertBefore: function() {}, removeChild: function() {}, querySelector: function(){return null;}, querySelectorAll: function(){return [];},
                    addEventListener: function(){}, dispatchEvent: function(){}, focus: () => {},
                    setAttribute: (name, value) => { el[`data-${name}`] = value; }, getAttribute: (name) => el[`data-${name}`],
                    cells: [],
                    insertCell: function() { // For TR elements in createElement if used for rows
                        const cell = createMockElement('td');
                        el.cells.push(cell);
                        return cell;
                    },
                    parentNode: null
                };
                return el;
            }
        };
        globalThis.document = mockDocument;

        // Mock window for alert, setInterval, clearInterval
        mockWindow = {
            alert: (message) => { mockWindow._lastAlert = message; mockConsole.log("window.alert:", message); },
            _lastAlert: null,
            setInterval: (func, delay) => { mockWindow._lastIntervalFunc = func; mockWindow._lastIntervalDelay = delay; mockConsole.log("window.setInterval called"); return Date.now(); },
            _lastIntervalFunc: null, _lastIntervalDelay: null, _intervalId: null,
            clearInterval: (id) => { mockConsole.log("window.clearInterval called with id:", id); mockWindow._lastIntervalFunc = null; mockWindow._lastIntervalDelay = null;} // Simplified
        };
        globalThis.window = { ...globalThis.window, ...mockWindow }; // Merge with existing window mock if any

        // Ensure specific elements used by blacklist.js are pre-created in the mock DOM
        const elementIds = [
            "categoriesTable", "channelsTable", "tagsTable", "titlesTable",
            "categoryInput", "channelInput", "tagInput", "titleInput",
            "addCategoryButton", "addChannelButton", "addTagButton", "addTitleButton",
            "clearCategoriesButton", "clearChannelsButton", "clearTagsButton", "clearTitlesButton",
            "toggleSort", "toggleNormalize", "toggleComments", "toggleDebug", "toggleExperimental",
            "saveButton", "cancelButton", "importButton", "exportButton", "processingScreen",
            "patternExplained", "versionNumber"
        ];
        elementIds.forEach(id => mockDocument.getElementById(id));
    }

    function test(testName, testFunction) {
        testCount++;
        setupMockDOMForBlacklist();

        // Reset chrome API mocks
        if (globalThis.chrome) {
            if (globalThis.chrome.runtime) globalThis.chrome.runtime.lastError = null;
            if (globalThis.chrome.storage) {
                globalThis.chrome.storage.local._store = {};
                globalThis.chrome.storage.sync._store = {};
            }
            // Reset i18n mock call count or history if needed
            if (globalThis.chrome.i18n && globalThis.chrome.i18n.getMessage) {
                globalThis.chrome.i18n.getMessage._callLog = [];
            }
        }
        // Reset window alert spy
        mockWindow._lastAlert = null;
        mockWindow._lastIntervalFunc = null;
        mockWindow._lastIntervalDelay = null;

        isModified = false; // Reset global from blacklist.js

        try {
            testFunction();
            reportTestResult(`${testSuiteName}: ${testName}`, true);
        } catch (error) {
            reportTestResult(`${testSuiteName}: ${testName}`, false, error);
        }
    }

    // --- Tests ---
    test("createItemRow should create a TR with key and Remove button", () => {
        const row = createItemRow("testKey");
        assertNotNull(row, "Row should not be null");
        assertEquals("TR", row.tagName, "Element should be a TR");
        assertEquals("testKey", row.cells[0].textContent, "First TD should contain the key");
        const button = row.cells[1].querySelector('button'); // Assuming button is direct child for simplicity
        assertNotNull(button, "Second TD should contain a button");
        assertEquals("BUTTON", button.tagName, "Button tag name");
        assertEquals(chrome.i18n.getMessage('blacklist_Remove'), button.textContent, "Button text");
        assertEquals("testKey", button.getAttribute('key'), "Button data-key attribute");
    });

    test("addItem should add unique item and call createItemRow and handleItemCount", () => {
        const table = mockDocument.getElementById('categoriesTable');
        let createItemRowCalled = false;
        let handleItemCountCalled = false;
        const originalCreateItemRow = globalThis.createItemRow;
        const originalHandleItemCount = globalThis.handleItemCount;
        globalThis.createItemRow = (key) => { createItemRowCalled = true; return originalCreateItemRow(key); };
        globalThis.handleItemCount = (tbl) => { handleItemCountCalled = true; originalHandleItemCount(tbl); };

        assertTrue(addItem(table, "newItem"), "addItem should return true for new item");
        assertTrue(createItemRowCalled, "createItemRow should be called");
        assertTrue(handleItemCountCalled, "handleItemCount should be called");
        assertEquals(1, table.tBodies[0].rows.length, "Table should have one item row");

        createItemRowCalled = false; handleItemCountCalled = false; // Reset spies
        assertFalse(addItem(table, "newItem"), "addItem should return false for duplicate item");
        assertFalse(createItemRowCalled, "createItemRow should not be called for duplicate");
        // handleItemCount might be called even for duplicates depending on implementation, let's check blacklist.js
        // addItem in blacklist.js calls handleItemCount regardless.
        assertTrue(handleItemCountCalled, "handleItemCount called even for duplicate attempt");
        assertEquals(1, table.tBodies[0].rows.length, "Table should still have one item row after duplicate attempt");

        globalThis.createItemRow = originalCreateItemRow;
        globalThis.handleItemCount = originalHandleItemCount;
    });

    test("addItems should process arrays and objects, sort, and call helpers", () => {
        const table = mockDocument.getElementById('channelsTable');
        let createCalls = 0; let handleCountCalls = 0;
        const origCreate = globalThis.createItemRow; const origHandle = globalThis.handleItemCount;
        globalThis.createItemRow = (k) => { createCalls++; return origCreate(k); };
        globalThis.handleItemCount = (t) => { handleCountCalls++; origHandle(t); };

        addItems(table, ["zeta", "alpha", "BETA"]); // Array
        assertEquals(3, createCalls, "createItemRow calls for array");
        assertEquals(1, handleCountCalls, "handleItemCount calls for array");
        assertEquals("alpha", table.tBodies[0].rows[0].cells[0].textContent, "Array items sorted: alpha");
        assertEquals("BETA", table.tBodies[0].rows[1].cells[0].textContent, "Array items sorted: BETA");
        assertEquals("zeta", table.tBodies[0].rows[2].cells[0].textContent, "Array items sorted: zeta");

        globalThis.document.getElementById('channelsTable').tBodies[0].rows = []; // Clear table for next part
        createCalls = 0; handleCountCalls = 0;
        addItems(table, { "gamma": 1, "delta": 1 }); // Object
        assertEquals(2, createCalls, "createItemRow calls for object");
        assertEquals(1, handleCountCalls, "handleItemCount calls for object");
        assertEquals("delta", table.tBodies[0].rows[0].cells[0].textContent, "Object items sorted: delta");
        assertEquals("gamma", table.tBodies[0].rows[1].cells[0].textContent, "Object items sorted: gamma");

        handleCountCalls = 0;
        addItems(table, "not an object"); // Non-object items
        assertEquals(1, handleCountCalls, "handleItemCount called for non-object items");

        globalThis.createItemRow = origCreate; globalThis.handleItemCount = origHandle;
    });

    test("clearItems should remove all item rows and call helpers", () => {
        const table = mockDocument.getElementById('tagsTable');
        addItems(table, ["tag1", "tag2"]); // Add some items
        let handleCountCalled = false; let flashSaveCalled = false;
        const origHandle = globalThis.handleItemCount; const origFlash = globalThis.flashSaveButton;
        globalThis.handleItemCount = (t) => { handleCountCalled = true; origHandle(t); };
        globalThis.flashSaveButton = () => { flashSaveCalled = true; origFlash(); };

        clearItems(table);
        assertEquals(0, table.querySelectorAll('tr.item').length, "All item rows should be removed");
        assertTrue(handleCountCalled, "handleItemCount should be called by clearItems");
        assertTrue(flashSaveCalled, "flashSaveButton should be called by clearItems");

        globalThis.handleItemCount = origHandle; globalThis.flashSaveButton = origFlash;
    });

    test("itemExists should correctly report existence of a key", () => {
        const table = mockDocument.getElementById('titlesTable');
        addItem(table, "Existing Title");
        assertTrue(itemExists(table, "Existing Title"), "itemExists for existing key");
        assertFalse(itemExists(table, "NonExisting Title"), "itemExists for non-existing key");
    });

    test("onAddItem should add item, handle regex, trim, convert quotes, and flash save", () => {
        const inputRow = mockDocument.getElementById('categoryInput'); // This is the input field itself
        inputRow.value = "  testCategory  ";
        let addItemCalledWith = null;
        const origAddItem = globalThis.addItem;
        globalThis.addItem = (tbl, key) => { addItemCalledWith = key; return origAddItem(tbl, key); };
        let flashCalled = false; const origFlash = globalThis.flashSaveButton;
        globalThis.flashSaveButton = () => { flashCalled = true; origFlash(); };

        onAddItem(inputRow, true); // byUser = true
        assertEquals("testcategory", addItemCalledWith, "Item added with trimmed and normalized value");
        assertEquals("", inputRow.value, "Input should be cleared after add");
        assertTrue(flashCalled, "flashSaveButton should be called if byUser is true");

        // Test quote conversion
        inputRow.value = "\"exact phrase\"";
        onAddItem(inputRow, false); // byUser = false
        assertEquals("'exact phrase'", addItemCalledWith, "Quotes converted to single quotes");

        // Test RegExp validation (valid)
        inputRow.value = "/valid-regex/i";
        onAddItem(inputRow, true);
        assertEquals("/valid-regex/i", addItemCalledWith, "Valid RegExp pattern");

        // Test RegExp validation (invalid)
        mockWindow._lastAlert = null; // Reset alert spy
        inputRow.value = "/[invalid-regex/"; // Unterminated character class
        onAddItem(inputRow, true);
        assertNotNull(mockWindow._lastAlert, "Alert should be shown for invalid RegExp");
        assertEquals(chrome.i18n.getMessage('blacklist_InvalidRegExp'), mockWindow._lastAlert, "Alert message for invalid RegExp");
        assertEquals("/[invalid-regex/", inputRow.value, "Input value should not be cleared on invalid RegExp"); // Value remains

        globalThis.addItem = origAddItem; globalThis.flashSaveButton = origFlash;
    });

    test("onRemoveItem should remove row and call helpers", () => {
        const table = mockDocument.getElementById('categoriesTable');
        addItem(table, "itemToRemove");
        const rowToRemove = table.tBodies[0].rows[0];
        const removeButton = rowToRemove.cells[1].querySelector('button');

        let handleCountCalled = false; let flashSaveCalled = false;
        const origHandle = globalThis.handleItemCount; const origFlash = globalThis.flashSaveButton;
        globalThis.handleItemCount = (t) => { handleCountCalled = true; origHandle(t); };
        globalThis.flashSaveButton = () => { flashSaveCalled = true; origFlash(); };

        // Attach listener as it's done in createItemRow
        removeButton.addEventListener('click', onRemoveItem);
        removeButton.dispatchEvent(new Event('click'));

        assertEquals(0, table.querySelectorAll('tr.item').length, "Row should be removed");
        assertTrue(handleCountCalled, "handleItemCount called by onRemoveItem");
        assertTrue(flashSaveCalled, "flashSaveButton called by onRemoveItem");

        globalThis.handleItemCount = origHandle; globalThis.flashSaveButton = origFlash;
    });

    test("handleItemCount updates count, empty row, and clear button visibility", () => {
        const table = mockDocument.getElementById('channelsTable');
        const clearButton = mockDocument.getElementById('clearChannelsButton');

        // Test empty table
        handleItemCount(table);
        assertEquals(`Channels (${chrome.i18n.getMessage('generic_Count', ['0'])})`, mockDocument.getElementById('channelsCount').textContent, "Count for empty table");
        assertNotNull(table.querySelector('.empty'), "Empty row should exist for empty table");
        assertEquals("none", clearButton.style.display, "Clear button hidden for empty table");

        // Test non-empty table
        addItem(table, "channel1");
        handleItemCount(table); // addItem calls it, but call again to verify direct behavior
        assertEquals(`Channels (${chrome.i18n.getMessage('generic_Count', ['1'])})`, mockDocument.getElementById('channelsCount').textContent, "Count for non-empty table");
        assertNull(table.querySelector('.empty'), "Empty row should be removed for non-empty table");
        assertEquals("inline-block", clearButton.style.display, "Clear button shown for non-empty table");
    });

    test("flashSaveButton sets isModified and attempts to toggle class (interval)", () => {
        isModified = false; // Reset global
        mockWindow._lastIntervalFunc = null; // Reset interval spy
        const saveBtn = mockDocument.getElementById('saveButton');

        flashSaveButton(10); // Call with a short interval
        assertTrue(isModified, "isModified should be true after flashSaveButton");
        assertNotNull(mockWindow._lastIntervalFunc, "setInterval should have been called");

        // Simulate interval function being called (simplified)
        mockWindow._lastIntervalFunc(); // Call it once
        assertTrue(saveBtn.classList.contains('modified'), "Save button has 'modified' class after first interval call");
        mockWindow._lastIntervalFunc(); // Call it again
        assertFalse(saveBtn.classList.contains('modified'), "Save button does not have 'modified' class after second interval call");

        // Test it doesn't re-trigger if already modified
        isModified = true; // Set as if already running
        mockWindow._lastIntervalFunc = null;
        flashSaveButton(10);
        assertNull(mockWindow._lastIntervalFunc, "setInterval should not be called if isModified is already true");
    });

    test("onPatternExplained shows alert with correct message", () => {
        mockWindow._lastAlert = null;
        onPatternExplained();
        assertEquals(chrome.i18n.getMessage('blacklist_PatternExplainedText'), mockWindow._lastAlert, "Alert message for pattern explanation");
    });

    test("toggleLoadingScreen shows/hides screen and disables/enables buttons", () => {
        const screen = mockDocument.getElementById('processingScreen');
        const buttonsToToggle = ["saveButton", "cancelButton", "importButton", "exportButton", "clearCategoriesButton"]; // Sample

        toggleLoadingScreen(true);
        assertEquals("flex", screen.style.display, "Processing screen visible");
        buttonsToToggle.forEach(id => assertTrue(mockDocument.getElementById(id).disabled, `${id} should be disabled`));

        toggleLoadingScreen(false);
        assertEquals("none", screen.style.display, "Processing screen hidden");
        buttonsToToggle.forEach(id => assertFalse(mockDocument.getElementById(id).disabled, `${id} should be enabled`));
    });

    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
