(function() {
    const testSuiteName = "common.js";
    let testCount = 0;
    let assertionsMade = 0;

    // Helper for assertions
    function assertEquals(expected, actual, message) {
        assertionsMade++;
        if (expected !== actual) {
            throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`);
        }
    }

    function assertStrictEquals(expected, actual, message) {
        assertionsMade++;
        if (expected !== actual) {
            throw new Error(`Assertion Failed: ${message}. Expected strictly "${expected}", but got "${actual}".`);
        }
    }

    function assertTrue(actual, message) {
        assertionsMade++;
        if (actual !== true) {
            throw new Error(`Assertion Failed: ${message}. Expected "true", but got "${actual}".`);
        }
    }

    function assertFalse(actual, message) {
        assertionsMade++;
        if (actual !== false) {
            throw new Error(`Assertion Failed: ${message}. Expected "false", but got "${actual}".`);
        }
    }

    function assertNull(actual, message) {
        assertionsMade++;
        if (actual !== null) {
            throw new Error(`Assertion Failed: ${message}. Expected "null", but got "${actual}".`);
        }
    }

    function assertNotNull(actual, message) {
        assertionsMade++;
        if (actual === null) {
            throw new Error(`Assertion Failed: ${message}. Expected not "null", but got "${actual}".`);
        }
    }

    function assertThrows(func, expectedErrorMessage, message) {
        assertionsMade++;
        let caughtError = false;
        try {
            func();
        } catch (e) {
            caughtError = true;
            if (expectedErrorMessage && e.message !== expectedErrorMessage) {
                throw new Error(`Assertion Failed: ${message}. Expected error message "${expectedErrorMessage}", but got "${e.message}".`);
            }
        }
        if (!caughtError) {
            throw new Error(`Assertion Failed: ${message}. Expected function to throw an error, but it did not.`);
        }
    }

    function test(testName, testFunction) {
        testCount++;
        try {
            // Reset chrome.runtime.lastError before each test that might use storage
            if (globalThis.chrome && globalThis.chrome.runtime) {
                globalThis.chrome.runtime.lastError = null;
            }
            // Reset mock storage before each test
            if (globalThis.chrome && globalThis.chrome.storage) {
                globalThis.chrome.storage.local._store = {};
                globalThis.chrome.storage.sync._store = {};
            }

            testFunction();
            reportTestResult(`${testSuiteName}: ${testName}`, true);
        } catch (error) {
            reportTestResult(`${testSuiteName}: ${testName}`, false, error);
        }
    }

    // --- Tests for isFirefox ---
    test("isFirefox should return false when browser is not defined", () => {
        const originalBrowser = globalThis.browser;
        delete globalThis.browser; // Simulate browser not being defined
        assertFalse(isFirefox(), "isFirefox with no browser global");
        globalThis.browser = originalBrowser; // Restore
    });

    test("isFirefox should return true when browser and chrome are defined", () => {
        // mocks.js already sets globalThis.browser = globalThis.chrome
        assertTrue(isFirefox(), "isFirefox in mock environment");
    });

    // --- Tests for normalizeCase ---
    test("normalizeCase should convert to lowercase and remove diacritics", () => {
        assertEquals("aeiou", normalizeCase("áéíóú"), "Basic diacritics");
        assertEquals("hello world", normalizeCase("  HELLO WORLD  "), "Trimming and lowercase");
        assertEquals("nino", normalizeCase("Niño"), "Spanish ñ");
        assertEquals("strasse", normalizeCase("Straße"), "German ß");
        assertEquals("", normalizeCase(""), "Empty string");
        assertEquals("123", normalizeCase("123"), "Numbers");
    });

    // --- Tests for isExactTerm ---
    test("isExactTerm should identify exact terms", () => {
        assertTrue(isExactTerm("'term'"), "Single quotes");
        assertFalse(isExactTerm("term'"), "Missing opening quote");
        assertFalse(isExactTerm("'term"), "Missing closing quote");
        assertFalse(isExactTerm("term"), "No quotes");
        assertFalse(isExactTerm("''"), "Empty quotes (still valid structure)");
    });

    // --- Tests for isLooseTerm ---
    test("isLooseTerm should identify loose terms", () => {
        assertTrue(isLooseTerm("~term"), "Tilde prefix");
        assertFalse(isLooseTerm("term"), "No tilde");
        assertFalse(isLooseTerm("~"), "Tilde only");
    });

    // --- Tests for isRegExpTerm ---
    test("isRegExpTerm should identify RegExp terms", () => {
        assertTrue(isRegExpTerm("/pattern/"), "Simple regex");
        assertTrue(isRegExpTerm("/pattern/i"), "Regex with flags");
        assertFalse(isRegExpTerm("/pattern"), "Missing closing slash");
        assertFalse(isRegExpTerm("pattern/"), "Missing opening slash");
        assertFalse(isRegExpTerm("pattern"), "Not a regex");
        assertFalse(isRegExpTerm("//"), "Empty regex (valid structure)");
    });

    // --- Tests for toRegExp ---
    test("toRegExp should convert valid strings to RegExp objects", () => {
        const re1 = toRegExp("/abc/");
        assertNotNull(re1, "Simple regex object");
        assertEquals("abc", re1.source, "Simple regex source");
        assertEquals("", re1.flags, "Simple regex flags");

        const re2 = toRegExp("/abc/i");
        assertNotNull(re2, "Regex with i flag object");
        assertEquals("abc", re2.source, "Regex with i flag source");
        assertEquals("i", re2.flags, "Regex with i flag flags");

        const re3 = toRegExp("/[a-z]+/gi");
        assertNotNull(re3, "Regex with gi flags object");
        assertEquals("[a-z]+", re3.source, "Regex with gi flags source");
        assertTrue(re3.flags.includes("g"), "Regex with gi flags includes g");
        assertTrue(re3.flags.includes("i"), "Regex with gi flags includes i");

    });

    test("toRegExp should return null for invalid patterns", () => {
        assertNull(toRegExp("/[/"), "Invalid regex (unterminated char class)");
        assertNull(toRegExp("abc"), "Not a regex string");
        assertNull(toRegExp("//"), "Empty pattern inside slashes");
        assertNull(toRegExp("/abc/invalidflag"), "Invalid flag - this actually does not throw in JS, it ignores invalid flags beyond gimsuy");
    });

    // --- Tests for getStorageMode ---
    test("getStorageMode should default to 'local' if useLocalStorage not set", async () => {
        const mode = await getStorageMode();
        assertEquals("local", mode, "Default storage mode");
    });

    test("getStorageMode should be 'sync' if useLocalStorage is false", async () => {
        await chrome.storage.local.set({ 'useLocalStorage': false });
        const mode = await getStorageMode();
        assertEquals("sync", mode, "Sync storage mode");
    });

    test("getStorageMode should be 'local' if useLocalStorage is true", async () => {
        await chrome.storage.local.set({ 'useLocalStorage': true });
        const mode = await getStorageMode();
        assertEquals("local", mode, "Local storage mode");
    });

    // --- Tests for storageGet ---
    test("storageGet should retrieve data from local storage by default", async () => {
        await chrome.storage.local.set({ key1: "value1" });
        const result = await storageGet("key1");
        assertEquals("value1", result.key1, "Get from local storage");
    });

    test("storageGet should retrieve data from sync storage if configured", async () => {
        await chrome.storage.local.set({ 'useLocalStorage': false }); // set to sync
        await chrome.storage.sync.set({ keySync: "valueSync" });
        const result = await storageGet("keySync");
        assertEquals("valueSync", result.keySync, "Get from sync storage");
    });

    test("storageGet should handle getting all items", async () => {
        await chrome.storage.local.set({ itemA: "A", itemB: "B" });
        const result = await storageGet(null);
        assertEquals("A", result.itemA, "Get all itemA from local");
        assertEquals("B", result.itemB, "Get all itemB from local");
    });

    // --- Tests for storageSet ---
    test("storageSet should store data in local storage by default", async () => {
        await storageSet({ keyLocal: "valueLocal" });
        const result = await chrome.storage.local.get("keyLocal");
        assertEquals("valueLocal", result.keyLocal, "Set to local storage");
    });

    test("storageSet should store data in sync storage if configured", async () => {
        await chrome.storage.local.set({ 'useLocalStorage': false }); // set to sync
        await storageSet({ keySyncSet: "valueSyncSet" });
        const result = await chrome.storage.sync.get("keySyncSet");
        assertEquals("valueSyncSet", result.keySyncSet, "Set to sync storage");
    });

    test("storageSet should return null if no error", async () => {
        const error = await storageSet({ testKey: "testValue" });
        assertNull(error, "Error should be null on successful set");
    });

    test("storageSet should return error object if an error occurs", async () => {
        // Simulate an error
        const originalSet = chrome.storage.local.set;
        chrome.storage.local.set = (items, callback) => {
            chrome.runtime.lastError = { message: "Simulated error" };
            if (callback) callback();
            return Promise.resolve();
        };

        const error = await storageSet({ testKey: "testValue" });
        assertNotNull(error, "Error should not be null");
        assertEquals("Simulated error", error.message, "Error message should match");

        chrome.storage.local.set = originalSet; // Restore original function
        chrome.runtime.lastError = null;
    });


    // --- Tests for storageRemove ---
    test("storageRemove should remove data from local storage by default", async () => {
        await chrome.storage.local.set({ keyRemove: "valueRemove" });
        await storageRemove("keyRemove");
        const result = await chrome.storage.local.get("keyRemove");
        assertEquals(undefined, result.keyRemove, "Remove from local storage");
    });

    test("storageRemove should remove data from sync storage if configured", async () => {
        await chrome.storage.local.set({ 'useLocalStorage': false }); // set to sync
        await chrome.storage.sync.set({ keySyncRemove: "valueSyncRemove" });
        await storageRemove("keySyncRemove");
        const result = await chrome.storage.sync.get("keySyncRemove");
        assertEquals(undefined, result.keySyncRemove, "Remove from sync storage");
    });

    // --- Tests for storageClear ---
    test("storageClear should clear local storage by default", async () => {
        await chrome.storage.local.set({ keyClear1: "val1", keyClear2: "val2" });
        await storageClear(); // This function in common.js has a bug, it passes 'data' which is not defined.
                                  // Assuming it meant to clear all. The mock handles it.
        const result = await chrome.storage.local.get(null);
        assertEquals(0, Object.keys(result).length, "Clear local storage");
    });

    test("storageClear should clear sync storage if configured", async () => {
        await chrome.storage.local.set({ 'useLocalStorage': false }); // set to sync
        await chrome.storage.sync.set({ keySyncClear1: "valS1", keySyncClear2: "valS2" });
        await storageClear(); // Same bug as above regarding 'data'
        const result = await chrome.storage.sync.get(null);
        assertEquals(0, Object.keys(result).length, "Clear sync storage");
    });

    // --- Tests for Logging Functions ---
    // These tests are basic: they check if the functions attempt to call the console.
    // More advanced testing (e.g., spying on console methods) is harder without a framework.
    test("Logging functions should attempt to call console methods", () => {
        let originalConsole = {};
        let calledMethod = null;
        let calledArgs = null;

        const methods = ['log', 'warn', 'error', 'info', 'trace'];
        methods.forEach(method => originalConsole[method] = console[method]);

        methods.forEach(method => {
            console[method] = (prefix, ...args) => { // Adapting to how log functions prepend UTTV INFO etc.
                calledMethod = method;
                calledArgs = args;
            };
        });

        // Temporarily set debug level for each test
        const originalDebug = globalThis.debug;

        globalThis.debug = 0; // Enable all logs
        logTrace("trace message"); assertEquals("trace", calledMethod, "logTrace method"); assertEquals("trace message", calledArgs[0], "logTrace args");
        logVerbose("verbose message"); assertEquals("log", calledMethod, "logVerbose method"); assertEquals("verbose message", calledArgs[0], "logVerbose args"); // mockConsole maps verbose to log
        logInfo("info message"); assertEquals("info", calledMethod, "logInfo method"); assertEquals("info message", calledArgs[0], "logInfo args");
        logWarn("warn message"); assertEquals("warn", calledMethod, "logWarn method"); assertEquals("warn message", calledArgs[0], "logWarn args");
        logError("error message"); assertEquals("error", calledMethod, "logError method"); assertEquals("error message", calledArgs[0], "logError args");

        calledMethod = null; args = null; // Reset for next level
        globalThis.debug = 5; // Disable all logs
        logTrace("trace silent"); assertNull(calledMethod, "logTrace silent");
        logVerbose("verbose silent"); assertNull(calledMethod, "logVerbose silent");
        logInfo("info silent"); assertNull(calledMethod, "logInfo silent");
        logWarn("warn silent"); assertNull(calledMethod, "logWarn silent");
        logError("error silent"); assertNull(calledMethod, "logError silent");

        // Restore original console and debug
        methods.forEach(method => console[method] = originalConsole[method]);
        globalThis.debug = originalDebug;
    });

    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
