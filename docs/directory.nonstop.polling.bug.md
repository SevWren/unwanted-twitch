# Documentation for `directory.nonstop.polling.bug.js`

## File Overview

This file, `directory.nonstop.polling.bug.js`, is a **legacy debugging and development file**. As its name explicitly suggests, it was created to address a specific, critical bug related to a "nonstop polling" issue. It is a snapshot of the `directory.js` content script during a major refactoring effort.

This file is **not actively used** by the extension. Its primary value is historical, offering a clear and detailed insight into a significant architectural problem and the solutions that were developed to overcome it. The extensive comment block at the top of the file serves as a changelog and a summary of the fixes.

## Status: Legacy Debugging File

This file is a snapshot of a work-in-progress. It contains experimental code, commented-out sections, and detailed notes about the problems being solved. It should be considered **deprecated**.

**Recommendation**: This file should be deleted in a future cleanup of the repository. The valuable information in its top-level comment has been preserved in this documentation and could be moved to a more appropriate location, such as a project wiki or a separate developer documentation folder.

## Key Problems and Solutions Documented

This file is a treasure trove of information about the evolution of the content script. The comments and code demonstrate a transition from a brittle, inefficient script to a modern, robust one.

### 1. The "Nonstop Polling" Bug

- **The Problem**: The file's name and comments describe a critical performance issue. The original script used `setInterval` to repeatedly poll the DOM for new items to filter. On a modern framework-driven site like Twitch, this created an infinite loop. The script would hide an element, the React framework would detect the DOM change and re-render the element, and the next polling interval would immediately find the "new" element and process it again. This would cause 100% CPU usage and make the page unusable.
- **The Documented Solution**: The comments explicitly state the solution that was being worked on: replacing the entire `setInterval` logic (`itemPollInterval`, `checkForNewDirectoryItems`) with a `MutationObserver`. A `MutationObserver` is the correct, modern browser API for this task. It is far more efficient because it allows the script to react to *actual* changes in the DOM (like nodes being added by infinite scroll) rather than constantly checking for them. *Note: The code in this specific file still contains the `setInterval` logic, but the comments clearly state the intention to replace it, marking this file as a mid-transition snapshot.*

### 2. Context-Aware Parsing

- **The Problem**: The script needed to work on both the main category directory (`/directory`) and specific channel listing pages (e.g., `/directory/category/retro`), but the HTML for these pages is completely different. A single set of DOM selectors would not work.
- **The Solution in this File**: This file contains the implemented solution. It introduces the concept of a `currentPageType` and uses a router function (`getDirectoryItems`) to call specialized parsing functions (`readChannel` or `readCategoryCard`) depending on the context. This made the script far more adaptable.

### 3. Robust Selectors

- **The Problem**: The original script relied on `data-a-target` attributes, which Twitch removed, breaking the extension completely.
- **The Solution in this File**: This file contains the updated, more robust selectors that rely on a combination of CSS classes, HTML structure, and more stable attributes like `href` and `title`.

### 4. Experimental Code: Hiding vs. Deleting

- **The Experiment**: This file contains a commented-out version of the `filterItems` function and a new, active version.
    - The original version would hide blacklisted items by adding a CSS class (`uttv-hidden-item`).
    - The new, experimental version in this file **deletes** the blacklisted items from the DOM entirely using `item.containerNode.remove()`.
- **The Purpose**: This was likely a test to see if deleting the node would be more performant or would solve certain layout issues (like empty spaces in a CSS grid). The fact that the active `directory.js` still uses the "hide" method suggests that deleting the nodes may have caused other unforeseen issues with Twitch's React framework, making the "hide" approach the more stable option.

## How It Interacts with Other Files (Hypothetically)

If this script were active, it would function very similarly to the current `directory.js`, as it contains most of the modern logic. However, it still contains the inefficient `setInterval` polling loop, which would likely cause performance problems on some machines. Its experimental use of `.remove()` instead of `.classList.add()` might also cause unpredictable behavior with Twitch's UI framework.

In summary, `directory.nonstop.polling.bug.js` is a valuable historical document. It captures a critical moment in the extension's development, clearly outlining a major bug and the architectural solutions devised to fix it. It serves as an excellent example of the challenges of maintaining a browser extension for a constantly evolving third-party website.
