(function() {
    const testSuiteName = "background.js";
    let testCount = 0;
    let assertionsMade = 0;
    // let mockChrome; // To hold a fresh mock for each test - Decided against deep cloning chrome mock for simplicity

    // Assertion Helpers
    function assertEquals(expected, actual, message) {
        assertionsMade++;
        if (expected !== actual) {
            throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`);
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
     function assertCondition(condition, message) {
        assertionsMade++;
        if (!condition) {
            throw new Error(`Assertion Failed: ${message}. Condition was not met.`);
        }
    }


    function test(testName, testFunction) {
        testCount++;

        // Reset critical parts of the global mock before each test
        if (globalThis.chrome) {
            if (globalThis.chrome.runtime) {
                globalThis.chrome.runtime.lastError = null;
                if (globalThis.chrome.runtime.sendMessage) {
                     // Custom property to track calls, if your mock uses it
                    globalThis.chrome.runtime.sendMessage._lastMessage = null;
                }
                if (globalThis.chrome.runtime.onMessage && globalThis.chrome.runtime.onMessage._listener) {
                    // Don't reset the listener itself here if background.js adds it once globally.
                    // Instead, ensure background.js is re-evaluated or its listeners re-added if necessary,
                    // or that tests account for a shared listener. For this setup, we assume background.js
                    // has already run and added its listeners to the global mock.
                }
            }
            if (globalThis.chrome.tabs) {
                // Reset spies or logs on tab functions
                if(globalThis.chrome.tabs.update) globalThis.chrome.tabs.update._lastUrl = null;
                if(globalThis.chrome.tabs.create) globalThis.chrome.tabs.create._lastUrl = null;
                globalThis.chrome.tabs._queryResults = []; // Clear previous query results
                globalThis.chrome.tabs._updateLog = []; // Clear log of updates
                globalThis.chrome.tabs._sendMessageLog = []; // Clear log of messages
                 if(globalThis.chrome.tabs.query) globalThis.chrome.tabs.query._lastQueryInfo = null;

            }
            if (globalThis.chrome.action) {
                 if(globalThis.chrome.action.enable) globalThis.chrome.action.enable._lastTabId = null;
                 if(globalThis.chrome.action.disable) globalThis.chrome.action.disable._lastTabId = null;
                globalThis.chrome.action._enableLog = [];
                globalThis.chrome.action._disableLog = [];
            }
            // Reset storage mocks
            if (globalThis.chrome.storage) {
                if (globalThis.chrome.storage.local) globalThis.chrome.storage.local._store = {};
                if (globalThis.chrome.storage.sync) globalThis.chrome.storage.sync._store = {};
            }
        }


        try {
            testFunction(); // This will call the global functions from background.js
            reportTestResult(`${testSuiteName}: ${testName}`, true);
        } catch (error) {
            reportTestResult(`${testSuiteName}: ${testName}`, false, error);
        }
    }

    // --- Tests for handleUrlRedirect ---
    // Assumes background.js (SUT) is loaded by test_runner.html and its functions are global

    test("handleUrlRedirect should redirect /directory if no sort param", async () => {
        const tabId = 1;
        const url = "https://www.twitch.tv/directory";
        await handleUrlRedirect(tabId, url); // handleUrlRedirect is global
        assertCondition(chrome.tabs.update._lastUrl && chrome.tabs.update._lastUrl.includes("sort=VIEWER_COUNT"), "URL should be updated with sort=VIEWER_COUNT");
    });

    test("handleUrlRedirect should redirect /directory/all if no sort param", async () => {
        const tabId = 2;
        const url = "https://www.twitch.tv/directory/all";
        await handleUrlRedirect(tabId, url);
         assertCondition(chrome.tabs.update._lastUrl && chrome.tabs.update._lastUrl.includes("sort=VIEWER_COUNT"), "/directory/all redirection");
    });

    test("handleUrlRedirect should redirect /directory/category/some-game if sort=RELEVANCE", async () => {
        const tabId = 3;
        const url = "https://www.twitch.tv/directory/category/some-game?sort=RELEVANCE";
        await handleUrlRedirect(tabId, url);
        assertCondition(chrome.tabs.update._lastUrl && chrome.tabs.update._lastUrl.includes("sort=VIEWER_COUNT"), "Category with RELEVANCE sort");
         assertCondition(chrome.tabs.update._lastUrl && !chrome.tabs.update._lastUrl.includes("sort=RELEVANCE"), "RELEVANCE should be removed");
    });

    test("handleUrlRedirect should NOT redirect if sort is already VIEWER_COUNT", async () => {
        const tabId = 4;
        const url = "https://www.twitch.tv/directory/game/Software%20and%20Game%20Development?sort=VIEWER_COUNT";
        await handleUrlRedirect(tabId, url);
        assertNull(chrome.tabs.update._lastUrl, "Should not redirect if sort is VIEWER_COUNT");
    });

    test("handleUrlRedirect should NOT redirect /directory/following", async () => {
        const tabId = 5;
        const url = "https://www.twitch.tv/directory/following";
        await handleUrlRedirect(tabId, url);
        assertNull(chrome.tabs.update._lastUrl, "/directory/following should be excluded");
    });

    test("handleUrlRedirect should NOT redirect /directory/videos/some-video", async () => {
        const tabId = 6;
        const url = "https://www.twitch.tv/directory/videos/some-video";
        await handleUrlRedirect(tabId, url);
        assertNull(chrome.tabs.update._lastUrl, "/directory/videos should be excluded");
    });

    test("handleUrlRedirect should NOT redirect non-Twitch URLs", async () => {
        const tabId = 7;
        const url = "https://www.google.com/directory";
        await handleUrlRedirect(tabId, url);
        assertNull(chrome.tabs.update._lastUrl, "Non-Twitch URL should not be redirected");
    });

    test("handleUrlRedirect should handle trailing slashes in path", async () => {
        const tabId = 8;
        const url = "https://www.twitch.tv/directory/"; // Trailing slash
        await handleUrlRedirect(tabId, url);
        assertCondition(chrome.tabs.update._lastUrl && chrome.tabs.update._lastUrl.includes("sort=VIEWER_COUNT"), "URL with trailing slash redirection");
    });


    // --- Tests for chrome.tabs.onUpdated listener logic ---
    // The actual listener is added in background.js. We rely on the mock's _listeners array.
    // This requires mocks.js to correctly store listeners passed to addListener.
    async function getTabsOnUpdatedListener() {
        if (globalThis.chrome && globalThis.chrome.tabs && globalThis.chrome.tabs.onUpdated &&
            globalThis.chrome.tabs.onUpdated._listeners && globalThis.chrome.tabs.onUpdated._listeners.length > 0) {
            return globalThis.chrome.tabs.onUpdated._listeners[0];
        }
        // Fallback if background.js hasn't run or mock isn't capturing:
        // try to re-run background.js or its event listener setup part, if possible.
        // This is tricky in a simple HTML runner. For now, throw if not found.
        throw new Error("tabs.onUpdated listener not captured by mock or background.js not loaded correctly.");
    }

    test("onUpdated listener should enable action for Twitch URLs", async () => {
        const listener = await getTabsOnUpdatedListener();
        const tabId = 10;
        await listener(tabId, { url: "https://www.twitch.tv/somechannel" }, { id: tabId, url: "https://www.twitch.tv/somechannel" });
        assertCondition(chrome.action.enable._lastTabId === tabId, "Action should be enabled for Twitch URL");
    });

    test("onUpdated listener should disable action for non-Twitch URLs", async () => {
        const listener = await getTabsOnUpdatedListener();
        const tabId = 11;
        await listener(tabId, { url: "https://www.google.com" }, { id: tabId, url: "https://www.google.com" });
        assertCondition(chrome.action.disable._lastTabId === tabId, "Action should be disabled for non-Twitch URL");
    });

    test("onUpdated listener should call handleUrlRedirect if URL changes and status is loading", async () => {
        const listener = await getTabsOnUpdatedListener();
        const tabId = 12;
        const newUrl = "https://www.twitch.tv/directory/category/art";
        // Ensure tab object passed to listener has the new URL
        await listener(tabId, { url: newUrl, status: 'loading' }, { id: tabId, url: newUrl });
        assertCondition(chrome.tabs.update._lastUrl && chrome.tabs.update._lastUrl.includes("sort=VIEWER_COUNT"), "handleUrlRedirect should be called and attempt redirect");
    });

    test("onUpdated listener should NOT call handleUrlRedirect if status is not loading and URL changed", async () => {
        // Note: The original test said "status is not loading", the background.js code specifically checks for 'loading'.
        // So if status is 'complete' or undefined, it should not call handleUrlRedirect.
        const listener = await getTabsOnUpdatedListener();
        const tabId = 13;
        const newUrl = "https://www.twitch.tv/directory/category/music";
        await listener(tabId, { url: newUrl, status: 'complete' }, { id: tabId, url: newUrl });
        assertNull(chrome.tabs.update._lastUrl, "handleUrlRedirect should NOT be called if status is complete");

        chrome.tabs.update._lastUrl = null; // Reset for next check
        await listener(tabId, { url: newUrl }, { id: tabId, url: newUrl }); // Status undefined
        assertNull(chrome.tabs.update._lastUrl, "handleUrlRedirect should NOT be called if status is undefined");
    });

    test("onUpdated listener should NOT call handleUrlRedirect if only status changed, not URL", async () => {
        const listener = await getTabsOnUpdatedListener();
        const tabId = 14;
        const currentUrl = "https://www.twitch.tv/directory/category/irl";
        // changeInfo.url is undefined, only status changes
        await listener(tabId, { status: 'loading' }, { id: tabId, url: currentUrl });
        assertNull(chrome.tabs.update._lastUrl, "handleUrlRedirect should NOT be called if URL did not change (status loading)");

        chrome.tabs.update._lastUrl = null; // Reset
        await listener(tabId, { status: 'complete' }, { id: tabId, url: currentUrl });
        assertNull(chrome.tabs.update._lastUrl, "handleUrlRedirect should NOT be called if URL did not change (status complete)");
    });

    // --- Tests for chrome.runtime.onMessage listener ---
    async function getRuntimeOnMessageListener() {
        if (chrome.runtime.onMessage._listener) {
            return chrome.runtime.onMessage._listener;
        }
        throw new Error("runtime.onMessage._listener not set in mock or background.js not loaded.");
    }

    test("runtime.onMessage should open blacklist page for 'openBlacklist' action", async () => {
        const listener = await getRuntimeOnMessageListener();
        await listener({ action: 'openBlacklist' }, {}, () => {});
        assertCondition(chrome.tabs.create._lastUrl === "/views/blacklist.html" || chrome.tabs.create._lastUrl === "chrome-extension://mockid/views/blacklist.html", "Blacklist page should be opened");
    });

    test("runtime.onMessage should forward other messages to tabs", async () => {
        const listener = await getRuntimeOnMessageListener();
        const mockTwitchTabs = [
            { id: 100, url: 'https://www.twitch.tv/user1', status: 'complete' },
            { id: 101, url: 'https://www.twitch.tv/user2', status: 'loading' },
            { id: 102, url: 'https://www.twitch.tv/user3', status: 'complete' }
        ];
        // Configure the mock for chrome.tabs.query
        const originalQuery = chrome.tabs.query;
        chrome.tabs.query = async (queryInfo) => {
            chrome.tabs.query._lastQueryInfo = queryInfo; // Log the query
            if (queryInfo.url === 'https://www.twitch.tv/*') {
                return mockTwitchTabs;
            }
            return [];
        };

        const messageToForward = { action: "someOtherAction", data: "some data", value: 123 };
        await listener(messageToForward, {}, () => {});

        assertCondition(chrome.tabs.query._lastQueryInfo && chrome.tabs.query._lastQueryInfo.url === 'https://www.twitch.tv/*', "tabs.query should be called for twitch URLs");

        assertEquals(2, chrome.tabs._sendMessageLog.length, "sendMessage should be called for 2 complete tabs");
        assertTrue(chrome.tabs._sendMessageLog.some(call => call.tabId === 100 && call.message.action === "someOtherAction"), "Message sent to tab 100");
        assertTrue(chrome.tabs._sendMessageLog.some(call => call.tabId === 102 && call.message.action === "someOtherAction"), "Message sent to tab 102");
        assertFalse(chrome.tabs._sendMessageLog.some(call => call.tabId === 101), "Message should not be sent to loading tab 101");

        chrome.tabs.query = originalQuery; // Restore original mock function
    });

    // --- Tests for setInitialIconStates ---
    test("setInitialIconStates should enable action for existing Twitch tabs and disable for others", async () => {
        const originalQuery = chrome.tabs.query;
        let callCount = 0;
        chrome.tabs.query = async (queryInfo) => {
            callCount++;
            if (callCount === 1) { // First call for Twitch tabs
                assertEquals('https://www.twitch.tv/*', queryInfo.url, "First query for Twitch URLs");
                return [
                    { id: 200, url: 'https://www.twitch.tv/page1' },
                    { id: 201, url: 'https://www.twitch.tv/page2' }
                ];
            } else { // Second call for all tabs (non-Twitch essentially for disable logic)
                 assertNull(queryInfo.url, "Second query should be for all URLs (url property undefined or not '*://*/*')");
                 return [ // This should represent all tabs in the browser
                    { id: 200, url: 'https://www.twitch.tv/page1' },
                    { id: 201, url: 'https://www.twitch.tv/page2' },
                    { id: 300, url: 'https://www.google.com' },
                    { id: 301, url: 'https://www.youtube.com' }
                ];
            }
        };

        await setInitialIconStates();

        assertTrue(chrome.action._enableLog.includes(200), "Action enabled for Twitch tab 200");
        assertTrue(chrome.action._enableLog.includes(201), "Action enabled for Twitch tab 201");

        assertTrue(chrome.action._disableLog.includes(300), "Action disabled for non-Twitch tab 300 (google.com)");
        assertTrue(chrome.action._disableLog.includes(301), "Action disabled for non-Twitch tab 301 (youtube.com)");

        assertFalse(chrome.action._disableLog.includes(200), "Action should not be disabled for Twitch tab 200 by disable loop");
        assertFalse(chrome.action._disableLog.includes(201), "Action should not be disabled for Twitch tab 201 by disable loop");

        chrome.tabs.query = originalQuery; // Restore
    });


    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
