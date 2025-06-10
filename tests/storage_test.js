(function() {
    const testSuiteName = "storage.js";
    let testCount = 0;
    let assertionsMade = 0;

    // Assertion Helpers (copied from common_test.js for standalone execution if needed)
    function assertEquals(expected, actual, message) {
        assertionsMade++;
        if (typeof expected === 'object' && typeof actual === 'object') {
            if (JSON.stringify(expected) !== JSON.stringify(actual)) {
                 throw new Error(`Assertion Failed: ${message}. Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}.`);
            }
        } else if (expected !== actual) {
            throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`);
        }
    }
    function assertDeepEquals(expected, actual, message) {
        assertionsMade++;
        try {
            // Basic deep equal for simple objects & arrays of primitives / simple objects
            const sortObject = (obj) => {
                if (typeof obj !== 'object' || obj === null) return obj;
                if (Array.isArray(obj)) return obj.map(sortObject).sort();
                return Object.keys(obj).sort().reduce((res, key) => {
                    res[key] = sortObject(obj[key]);
                    return res;
                }, {});
            };
            const strExpected = JSON.stringify(sortObject(expected));
            const strActual = JSON.stringify(sortObject(actual));

            if (strExpected !== strActual) {
                 throw new Error(`Expected ${strExpected}, but got ${strActual}.`);
            }
        } catch (e) {
             throw new Error(`Assertion Failed: ${message}. ${e.message}`);
        }
    }
    function assertTrue(actual, message) {
        assertionsMade++;
        if (actual !== true) {
            throw new Error(`Assertion Failed: ${message}. Expected "true", but got "${actual}".`);
        }
    }
    function assertNotNull(actual, message) {
        assertionsMade++;
        if (actual === null) {
            throw new Error(`Assertion Failed: ${message}. Expected not "null", but got "${actual}".`);
        }
    }
     function assertObjectContainsKey(obj, key, message) {
        assertionsMade++;
        if (!(key in obj)) {
            throw new Error(`Assertion Failed: ${message}. Expected object to contain key "${key}".`);
        }
    }
    function assertObjectDoesNotContainKey(obj, key, message) {
        assertionsMade++;
        if (key in obj) {
            throw new Error(`Assertion Failed: ${message}. Expected object not to contain key "${key}".`);
        }
    }

    function test(testName, testFunction) {
        testCount++;
        try {
            // Reset mock storage before each test
            if (globalThis.chrome && globalThis.chrome.storage) {
                globalThis.chrome.storage.local._store = {};
                globalThis.chrome.storage.sync._store = {};
                 if (globalThis.chrome.runtime) { // ensure lastError is also reset
                    globalThis.chrome.runtime.lastError = null;
                }
            }
            testFunction();
            reportTestResult(`${testSuiteName}: ${testName}`, true);
        } catch (error) {
            reportTestResult(`${testSuiteName}: ${testName}`, false, error);
        }
    }

    // --- Tests for measureStoredSize ---
    test("measureStoredSize should return correct length for various objects", () => {
        assertEquals(2, measureStoredSize({}), "Empty object");
        assertEquals(13, measureStoredSize({ "key": "value" }), "Simple object");
        assertEquals(7, measureStoredSize("string"), "String input"); // Strings are quoted, so "string" is 8. The function returns string.length.
        assertEquals(17, measureStoredSize({ "a": 1, "b": "test" }), "Mixed type object");
        const complexObj = { "arr": [1, 2], "nested": { "c": null } };
        assertEquals(JSON.stringify(complexObj).length, measureStoredSize(complexObj), "Complex object");
    });

    // --- Tests for splitBlacklistItems ---
    // Note: storageSyncMaxKeys is 500, maxValuesPerFragment is 200 as per storage.js
    test("splitBlacklistItems should not split small lists", () => {
        const items = {
            categories: { "cat1": 1, "cat2": 1 },
            channels: { "chan1": 1 }
        };
        const fragments = splitBlacklistItems(items);
        assertObjectContainsKey(fragments, "blItemsFragment0", "Should have fragment 0");
        assertObjectDoesNotContainKey(fragments, "blItemsFragment1", "Should not have fragment 1");
        // The split function stores categories/channels keys as arrays of strings.
        assertDeepEquals(["cat1", "cat2"], fragments.blItemsFragment0.categories, "Categories should match in fragment 0");
        assertDeepEquals(["chan1"], fragments.blItemsFragment0.channels, "Channels should match in fragment 0");
    });

    test("splitBlacklistItems should split items exceeding maxValuesPerFragment", () => {
        const items = { categories: {}, channels: {} };
        for (let i = 0; i < 250; i++) { // 250 category items
            items.categories[`cat${i}`] = 1;
        }
        for (let i = 0; i < 50; i++) { // 50 channel items
            items.channels[`chan${i}`] = 1;
        }

        const fragments = splitBlacklistItems(items);
        assertObjectContainsKey(fragments, "blItemsFragment0", "Fragment 0 expected");
        assertObjectContainsKey(fragments, "blItemsFragment1", "Fragment 1 expected");
        assertObjectDoesNotContainKey(fragments, "blItemsFragment2", "Fragment 2 not expected");

        // Check distribution (categories: 200 in frag0, 50 in frag1. channels: 50 in frag1)
        assertEquals(200, fragments.blItemsFragment0.categories.length, "Frag0 categories count");
        assertTrue(fragments.blItemsFragment0.categories.includes("cat0"), "Frag0 cat0 exists");
        assertTrue(fragments.blItemsFragment0.categories.includes("cat199"), "Frag0 cat199 exists");
        assertObjectDoesNotContainKey(fragments.blItemsFragment0, "channels", "Frag0 should not have channels");


        assertNotNull(fragments.blItemsFragment1.categories, "Frag1 should have categories field");
        assertEquals(50, fragments.blItemsFragment1.categories.length, "Frag1 categories count");
        assertTrue(fragments.blItemsFragment1.categories.includes("cat200"), "Frag1 cat200 exists");
        assertTrue(fragments.blItemsFragment1.categories.includes("cat249"), "Frag1 cat249 exists");

        assertNotNull(fragments.blItemsFragment1.channels, "Frag1 should have channels field");
        assertEquals(50, fragments.blItemsFragment1.channels.length, "Frag1 channels count");
        assertTrue(fragments.blItemsFragment1.channels.includes("chan0"), "Frag1 chan0 exists");
        assertTrue(fragments.blItemsFragment1.channels.includes("chan49"), "Frag1 chan49 exists");
    });

    test("splitBlacklistItems handles titles array correctly", () => {
        const items = { titles: [] };
        for (let i = 0; i < 210; i++) {
            items.titles.push(`title ${i}`);
        }
        const fragments = splitBlacklistItems(items);
        assertObjectContainsKey(fragments, "blItemsFragment0", "Titles Frag0 expected");
        assertObjectContainsKey(fragments, "blItemsFragment1", "Titles Frag1 expected");
        assertEquals(200, fragments.blItemsFragment0.titles.length, "Frag0 titles count");
        assertEquals(10, fragments.blItemsFragment1.titles.length, "Frag1 titles count");
        assertEquals("title 0", fragments.blItemsFragment0.titles[0], "Frag0 title 0");
        assertEquals("title 200", fragments.blItemsFragment1.titles[0], "Frag1 title 200");
    });

    test("splitBlacklistItems should handle empty items object", () => {
        const items = {};
        const fragments = splitBlacklistItems(items);
        // It creates blItemsFragment0 but it's empty
        assertObjectContainsKey(fragments, "blItemsFragment0", "Fragment 0 for empty items");
        assertEquals(0, Object.keys(fragments.blItemsFragment0).length, "Fragment 0 should be empty");

    });

    test("splitBlacklistItems should handle items with empty arrays/objects", () => {
        const items = { categories: {}, channels: {}, titles: [] }; // channels as object
        const fragments = splitBlacklistItems(items);
        assertObjectContainsKey(fragments, "blItemsFragment0", "Fragment 0 for empty arrays/objects");

        assertNotNull(fragments.blItemsFragment0.categories, "categories in frag0");
        assertEquals(0, fragments.blItemsFragment0.categories.length, "categories count in frag0");

        assertNotNull(fragments.blItemsFragment0.channels, "channels in frag0");
        assertEquals(0, fragments.blItemsFragment0.channels.length, "channels count in frag0");

        assertNotNull(fragments.blItemsFragment0.titles, "titles in frag0");
        assertEquals(0, fragments.blItemsFragment0.titles.length, "titles count in frag0");
    });

    // --- Tests for mergeBlacklistFragments ---
    test("mergeBlacklistFragments should correctly merge fragments", () => {
        const fragments = {
            blItemsFragment0: {
                categories: ["cat1", "cat2"],
                channels: ["chan1"],
                titles: ["title1"]
            },
            blItemsFragment1: {
                categories: ["cat3"],
                channels: ["chan2", "chan3"],
                titles: ["title2", "title3"]
            }
        };
        const expectedItems = {
            categories: { "cat1": 1, "cat2": 1, "cat3": 1 },
            channels: { "chan1": 1, "chan2": 1, "chan3": 1 },
            titles: ["title1", "title2", "title3"]
        };
        const merged = mergeBlacklistFragments(fragments);
        assertDeepEquals(expectedItems, merged, "Merged items should match expected");
    });

    test("mergeBlacklistFragments should handle single fragment", () => {
        const fragments = {
            blItemsFragment0: {
                tags: ["tagA", "tagB"] // Example with 'tags'
            }
        };
        const expectedItems = {
            tags: { "tagA": 1, "tagB": 1 }
        };
        const merged = mergeBlacklistFragments(fragments);
        assertDeepEquals(expectedItems, merged, "Merged single fragment");
    });

    test("mergeBlacklistFragments should handle empty fragments object", () => {
        const fragments = {};
        const merged = mergeBlacklistFragments(fragments);
        assertEquals(0, Object.keys(merged).length, "Merging empty fragments should result in empty object");
    });

    test("mergeBlacklistFragments should handle fragments with empty item types", () => {
        const fragments = {
            blItemsFragment0: { categories: [], titles: [] }
        };
        const expected = { categories: {}, titles: [] };
        const merged = mergeBlacklistFragments(fragments);
        assertDeepEquals(expected, merged, "Merge fragments with empty item types");
    });

    test("mergeBlacklistFragments should stop if fragment index is missing", () => {
         const fragments = {
            blItemsFragment0: { categories: ["cat1"] },
            // blItemsFragment1 is missing
            blItemsFragment2: { categories: ["cat2"] }
        };
        const expected = { categories: { "cat1": 1 } };
        const merged = mergeBlacklistFragments(fragments);
        assertDeepEquals(expected, merged, "Merge should stop at missing fragment index");
    });

    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
