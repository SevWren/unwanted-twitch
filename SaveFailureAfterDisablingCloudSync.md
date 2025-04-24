**Issue Documentation: Persistent Save Failure After Disabling Cloud Sync**

*   **Problem Summary:**
    When attempting to save a large blacklist with "Synchronize Blacklist via Cloud" enabled, the save operation fails (correctly) due to exceeding `chrome.storage.sync` quota limits. However, if the user then *disables* cloud sync (unchecks the box) on the `blacklist.html` page and immediately attempts to save the *same* large blacklist again, the save operation hangs (showing "Loading. Please wait...") or fails with an "unexpected response" error, preventing the data from being saved even to `chrome.storage.local`. The blacklist tab remains open.

*   **Observed Behavior:**
    1.  User enables "Synchronize Blacklist via Cloud".
    2.  User imports or adds items, resulting in a blacklist size > ~100KB.
    3.  User clicks "Save".
    4.  The save attempt fails (potentially after timeout or with an error related to quota or unexpected response). An alert may be shown, and the blacklist tab remains open.
    5.  User unchecks "Synchronize Blacklist via Cloud".
    6.  User clicks "Save" again.
    7.  The "Loading. Please wait..." overlay appears and persists indefinitely, or an alert about "unexpected response" or "save failure" appears.
    8.  The blacklist tab does not close automatically.
    9.  The large blacklist is not successfully saved to `chrome.storage.local`.

*   **Likely Cause (Hypothesis):**
    The most probable cause is a **race condition between setting the storage mode preference and reading it**.
    1.  In `blacklist.js` (`onSave`), when the user clicks save after unchecking the box, the code executes `await chrome.storage.local.set({ 'useLocalStorage': true });`.
    2.  Almost immediately after, it sends the blacklist data via `chrome.runtime.sendMessage` to `directory.js`.
    3.  In `directory.js` (`onMessage` listener -> `putBlacklistedItems`), the code calls `await getStorageMode()`.
    4.  `getStorageMode()` reads `'useLocalStorage'` from `chrome.storage.local`.
    5.  **Crucially:** The `chrome.storage.local.set` operation from step 1 might *not have completed* before `getStorageMode` in step 4 reads the value. Storage operations are asynchronous.
    6.  Therefore, `getStorageMode` might still read the *old* value (`useLocalStorage: false`), causing `putBlacklistedItems` to incorrectly attempt saving to `chrome.storage.sync` *again*, even though the user intended to save locally. This second attempt then fails for the same quota reasons (or potentially times out waiting for a response that never comes because the save failed internally).

*   **Impact:**
    Prevents users from saving large blacklists locally if they ever *attempted* to save them via sync first. This forces users to potentially re-import or lose data and requires manual intervention (like clearing storage or reloading the extension) to potentially fix the state. Causes significant user frustration.

*   **Required Debugging Steps (Later):**
    1.  **Add Logging:** Insert `logVerbose` statements within `putBlacklistedItems` in `directory.js` immediately after `currentMode = await getStorageMode()` and before the `storageArea.set(dataToStore)` call to confirm the actual `currentMode` and `targetMode` being used during the *second* save attempt (after disabling sync).
    2.  **Inspect Console:** Carefully examine the console logs in both `blacklist.html` (background page/service worker might also be relevant) and a regular Twitch tab (`directory.js` context) during the second, failing save attempt. Look for specific errors from `storage.set`, timeouts, or messaging failures.
    3.  **Verify Storage State:** Use browser developer tools to inspect `chrome.storage.local` and `chrome.storage.sync` *before* and *after* the second save attempt to see if `'useLocalStorage'` was correctly set to `true` and if any data was partially written or removed incorrectly.

*   **Potential Solutions (To Investigate Later):**
    1.  **Pass Mode Explicitly:** Modify `blacklist.js` (`onSave`) to determine the *intended* save mode based on the checkbox state and pass this mode (`'sync'` or `'local'`) as part of the payload in `chrome.runtime.sendMessage`. Modify `directory.js` (`onMessage` listener and `putBlacklistedItems`) to use this explicitly passed mode instead of relying solely on `getStorageMode()`. This avoids the race condition entirely.
    2.  **Ensure Storage Write Completes:** Introduce a mechanism (e.g., a short `setTimeout` or a Promise confirmation) in `blacklist.js` *after* setting `useLocalStorage` but *before* sending the message, although this is less reliable than passing the mode explicitly.

---

**Reminder: Debug Persistent Save Failure After Disabling Sync**

*   **Issue:** Saving to local storage fails persistently if a previous save attempt to sync storage failed, even after disabling sync. UI gets stuck loading.
*   **Suspected Cause:** Race condition - `getStorageMode()` in `directory.js` reads the old storage preference before the update from `blacklist.js` completes.
*   **Debug Actions:**
    *   Log the actual storage `mode` being read/used in `putBlacklistedItems` during the second failed save.
    *   Check console logs thoroughly in `blacklist.js` and `directory.js` contexts for errors during the second attempt.
    *   Consider passing the intended storage mode directly via `sendMessage`.
*   **Goal:** Ensure saving to local works reliably after disabling sync, regardless of previous sync failures.
