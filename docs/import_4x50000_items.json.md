# Documentation for `import_4x50000_items.json`

## File Overview

This file is a **test data file** specifically designed for stress testing the extension's handling of a very large *number* of individual blacklist entries. As the name implies, it contains four distinct lists (categories, channels, tags, and titles), each containing 50,000 items, for a total of 200,000 rules.

Unlike `import_5+_Megabytes.json`, which tests raw data size, this file's purpose is to test the logic and performance related to processing, storing, and matching a high volume of short, distinct strings.

## Purpose and Use Cases

This file is crucial for testing the upper limits of the extension's core data handling and filtering logic.

1.  **Storage Fragmentation Stress Test**:
    -   **Objective**: This is the primary test case for the storage fragmentation system (`storage.js`). The `chrome.storage.sync` API has a hard limit of 512 total items that can be stored. A 200,000-item blacklist must be broken into hundreds of fragments. This test verifies that the `splitBlacklistItems` function correctly chunks the data and that the `mergeBlacklistFragments` function can correctly reassemble it upon loading.
    -   **Process**: A developer imports this file and saves the blacklist. They then inspect the browser's storage (`chrome.storage.sync`) to ensure that many `blItemsFragment` keys have been created. They then reload the extension to ensure the data is merged and loaded back into the UI correctly.

2.  **UI Rendering Performance Test**:
    -   **Objective**: To measure how the `blacklist.html` page performs when it needs to render 50,000 table rows (`<tr>`) in each of its four tables.
    -   **Process**: A developer imports this file and observes the blacklist page's responsiveness. This tests the efficiency of the DOM manipulation logic in `blacklist.js`, specifically the `addItems` function.

3.  **In-Memory Filtering Performance**:
    -   **Objective**: To assess the performance of the core matching algorithm in the content script (`directory.js`) when its in-memory blacklist contains 200,000 rules.
    -   **Process**: After loading this blacklist, a developer navigates Twitch and observes for any stuttering or lag. This specifically tests the `matchTerms` function and the effectiveness of the pre-computed performance caches (`cacheExactTerms`, `cacheLooseTerms`, `cacheRegExpTerms`).

## File Structure

The file has a simple, predictable structure:

```json
{
  "categories": [
    "1",
    "2",
    "3",
    ... // up to "50000"
  ],
  "channels": [
    "1",
    "2",
    "3",
    ... // up to "50000"
  ],
  "tags": [
    "1",
    "2",
    "3",
    ... // up to "50000"
  ],
  "titles": [
    "1",
    "2",
    "3",
    ... // up to "50000"
  ]
}
```

-   The file consists of a single top-level object.
-   It has four keys: `"categories"`, `"channels"`, `"tags"`, and `"titles"`.
-   Each key maps to an array of 50,000 strings. The strings are simple sequential numbers, as their content is not relevant for this test.

**Note**: This file is for testing purposes only and is not used in the production version of the extension. It is a critical tool for ensuring the stability and performance of the extension's data management systems.
