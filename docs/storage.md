# Documentation for `storage.js`

## File Overview

The `storage.js` script is a specialized utility library designed to solve a very specific and critical problem: the storage limitations of the `chrome.storage.sync` API. While `common.js` provides the high-level interface for accessing storage, `storage.js` provides the low-level implementation for handling data that is too large to fit within Chrome's sync storage quotas.

Its sole purpose is to provide a mechanism for splitting a large blacklist object into smaller, manageable "fragments" before saving, and for merging those fragments back into a single, cohesive object when loading. This allows the extension to support very large blacklists while still offering the benefit of cross-device synchronization.

## Core Functionalities

### 1. Blacklist Fragmentation

This is the primary reason this file exists.

- **Purpose**: To take a single, large blacklist object and break it down into multiple smaller objects that each respect the `QUOTA_BYTES_PER_ITEM` and `MAX_ITEMS` limits of `chrome.storage.sync`.
- **Mechanism**:
    - The `splitBlacklistItems(items)` function takes the entire blacklist object as input.
    - It iterates through each category of the blacklist (channels, categories, tags, titles).
    - It then slices the array of items in each category into chunks, ensuring that no single fragment object becomes too large.
    - Each chunk is stored in a new object under a sequentially numbered key, like `blItemsFragment0`, `blItemsFragment1`, `blItemsFragment2`, and so on.
    - The function returns a single object containing all these fragment objects, which can then be saved to `chrome.storage.sync`. For example:
      ```json
      {
        "blItemsFragment0": {
          "channels": ["streamer1", "streamer2", ...],
          "categories": ["Category A", "Category B", ...]
        },
        "blItemsFragment1": {
          "categories": ["Category C", ...],
          "titles": ["bad title 1", ...]
        }
      }
      ```
- **Key Functions**: `splitBlacklistItems`

### 2. Blacklist De-fragmentation (Merging)

This is the counterpart to the splitting functionality.

- **Purpose**: To take a collection of fragment objects retrieved from storage and reconstruct the original, single blacklist object.
- **Mechanism**:
    - The `mergeBlacklistFragments(fragments)` function takes the entire result from a `storage.get(null)` call.
    - It iterates through the keys `blItemsFragment0` up to `storageSyncMaxKeys`.
    - For each fragment it finds, it iterates through the types within that fragment (channels, categories, etc.).
    - It appends the items from the fragment into a new, consolidated `result` object.
    - It correctly handles the different data structures (arrays for titles, object maps for other types).
    - The final, fully reconstructed blacklist object is returned.
- **Key Functions**: `mergeBlacklistFragments`

### 3. Data Size Measurement

- **Purpose**: To provide a way to check the size of the blacklist *before* attempting to save it. This allows the extension to proactively decide whether to use fragmentation or even switch to local storage if the data is too large.
- **Mechanism**:
    - The `measureStoredSize(o)` function takes any object as input.
    - It serializes the object into a JSON string using `JSON.stringify()`.
    - It then simply returns the `length` of the resulting string, which is a close approximation of the size in bytes that the object will occupy in storage.
- **Key Functions**: `measureStoredSize`

## Global Constants

- `storageSyncMaxKeys`: Defines the maximum number of keys the extension will use in sync storage, leaving a small safety margin from the hard limit. This prevents the extension from completely filling the user's sync storage.
- `storageSyncMaxSize`: Defines the maximum size of a single data fragment, again with a safety margin.
- `storageMaxFragments`: A soft limit to prevent the fragmentation logic from creating an excessive number of fragments.

## How It Works with Other Files

- **`directory.js` (Content Script)**: This is the primary consumer of `storage.js`.
    - When `directory.js`'s `getBlacklistedItems` function retrieves data from storage, it checks if the result contains a single `blacklistedItems` key or multiple `blItemsFragment` keys. If it finds fragments, it immediately calls `mergeBlacklistFragments` to reconstruct the full blacklist.
    - When `directory.js`'s `putBlacklistedItems` function needs to save the blacklist, it first checks the storage mode. If the mode is `sync`, it uses `measureStoredSize` to check if the data will fit. If it's too large, it can make the decision to switch to local storage. If it proceeds with sync, it relies on the fragmentation logic (though the call to `splitBlacklistItems` is abstracted away in the current implementation, the principle is the same).
- **`common.js`**: `storage.js` does not depend on `common.js`, but `common.js` provides the high-level API (`storageGet`, `storageSet`) that the content script uses to interact with the storage system that `storage.js` is designed to manage. They are two sides of the same coin: `common.js` is the simple public-facing API, and `storage.js` contains the complex internal logic for handling data that doesn't fit the simple model.

In essence, `storage.js` is a crucial but highly specialized library. Its functions are the engine that enables the extension to handle very large user blacklists, overcoming the inherent limitations of the browser's synchronized storage API and providing a more powerful and flexible user experience.
