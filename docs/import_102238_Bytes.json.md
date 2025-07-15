# Documentation for `import_102238_Bytes.json`

## File Overview

This file is a **highly specific test data file** designed to test the extension's handling of the `chrome.storage.sync` size quota. The filename, `import_102238_Bytes.json`, directly refers to its size, which is significant because it is just over the `QUOTA_BYTES` limit of 102,400 bytes for the entire `chrome.storage.sync` area.

The file contains padded strings to achieve this precise size. The content of the strings is less important than the total size of the serialized file.

## Purpose and Use Cases

This file is a critical tool for testing the robustness of the extension's storage logic, particularly its ability to fail gracefully and adapt when encountering storage limitations.

1.  **Sync Storage Quota Test**:
    -   **Objective**: To verify that the logic in `putBlacklistedItems` (in `directory.js`) correctly detects when a blacklist is too large for `chrome.storage.sync` and automatically switches to using `chrome.storage.local` instead.
    -   **Process**:
        1.  A developer ensures the extension is currently set to use "Cloud (Sync)" storage.
        2.  They import this file using the blacklist management page.
        3.  They click "Save".
        4.  The `measureStoredSize` function (from `storage.js`) should calculate the size to be > 102,400 bytes.
        5.  The `putBlacklistedItems` function should then trigger the fallback mechanism: it should set the `useLocalStorage` flag to `true` and perform the save operation on `chrome.storage.local`.
        6.  The developer can then inspect the browser's storage to confirm that the data was written to `local` and *not* to `sync`, and that the `useLocalStorage` flag was updated correctly.

2.  **`measureStoredSize` Function Validation**:
    -   **Objective**: To ensure that the `measureStoredSize` utility in `storage.js` is accurately calculating the byte size of the JSON object.
    -   **Process**: The known size of this file can be compared against the output of the function during a debugging session to confirm its accuracy.

## File Structure

```json
{
  "categories": [
    "...............................1",
    "...............................2",
    ...
  ],
  "channels": [
    "...............................1",
    "...............................2",
    ...
  ],
  "tags": [
    "...............................1",
    "...............................2",
    ...
  ],
  "titles": [
    "...............................1",
    "...............................2",
    ...
  ]
}
```

-   The file consists of a single top-level object with four keys: `"categories"`, `"channels"`, `"tags"`, and `"titles"`.
-   Each key maps to an array of strings.
-   Each string is deliberately padded with `.` characters to reach the target file size of 102,238 bytes.

**Note**: This file is for a very specific, critical test case. It ensures the extension does not fail or lose user data when the user's blacklist grows beyond the limits of synchronized storage.
