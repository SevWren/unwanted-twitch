# Documentation for `import_5+_Megabytes.json`

## File Overview

This file is a **test data file** used for stress testing the extension's import and storage capabilities. It is a large JSON file (over 5 megabytes, as indicated by its name) designed to push the limits of the extension's data handling.

The file contains a simple JSON structure with a single key, `"channels"`, which holds a large array of strings. The strings themselves are placeholder "Lorem ipsum" text, as the content of the strings is not as important as their collective size.

## Purpose and Use Cases

This file is used to test several key aspects of the extension's performance and stability:

1.  **Import Feature Stress Test**:
    -   **Objective**: To verify that the "Import" functionality on the `blacklist.html` page can handle a very large file without crashing the browser tab or becoming unresponsive for an unreasonable amount of time.
    -   **Process**: A developer would manually use the import feature on the blacklist page and select this file to observe its behavior.

2.  **Local Storage Capacity Test**:
    -   **Objective**: To ensure that the extension can successfully save and load a blacklist that is far too large for `chrome.storage.sync` and must be stored in `chrome.storage.local`. `chrome.storage.local` has a much larger limit (typically 5MB or more), and this file is designed to test that limit.
    -   **Process**: After importing this file, a developer would click "Save". The extension's logic should correctly identify that the data is too large for sync storage and save it to local storage instead. The developer would then reload the extension and the blacklist page to ensure the data is loaded back correctly.

3.  **In-Memory Performance Test**:
    -   **Objective**: To assess the performance of the content script (`directory.js`) when it is operating with an extremely large number of blacklist rules in memory.
    -   **Process**: After successfully importing and saving this massive list, a developer would navigate Twitch directory pages to see if there is any noticeable lag or performance degradation during the filtering process (`isBlacklistedItem`, `matchTerms`).

## File Structure

```json
{
  "channels": [
    "Lorem ipsum dolor sit amet, ...",
    "Lorem ipsum dolor sit amet, ...",
    ...
  ]
}
```

-   The file consists of a single top-level object.
-   The key `"channels"` maps to an array of strings.
-   The strings are long blocks of placeholder text, repeated to achieve the large file size.

**Note**: This file is for testing purposes only and is not used in the production version of the extension. It should not be modified unless the testing parameters need to be changed.
