# How to Check if the Code is Working (Testing)

Hi there! This guide helps you check if the main JavaScript code for this browser extension is doing what it's supposed to do. We have a special set of files (called "tests") that help us with this.

Think of it like a quiz for our code. If the code passes the quiz, we know it's in good shape!

## Why We Test This Way

Normally, programmers use fancy tools (like "Jest") to run these tests automatically. However, the place where this code is being worked on has some limits that stop us from using those tools. So, we have a more hands-on way to run the tests using your web browser.

## How to Run the Tests (The "Quiz")

It's pretty easy! Just follow these steps:

1.  **Make Sure You Have All the Code:** You'll need all the project files downloaded on your computer.
2.  **Find the Test Runner File:**
    *   Look inside the project folders. You'll find a folder named `tests`.
    *   Inside that `tests` folder, there's a file called `test_runner.html`.
3.  **Open `test_runner.html` in Your Web Browser:**
    *   You can usually just double-click this file, and it will open in Chrome, Firefox, Edge, or whatever browser you use.
    *   Or, you can open your browser, and then use "File" > "Open File..." to find and open `test_runner.html`.
4.  **Look at the Results on the Page:**
    *   The `test_runner.html` page will show you a list of all the tests.
    *   Next to each test, it will say **PASSED** (yay!) or **FAILED** (oops!).
    *   If something FAILED, it means a part of our code might not be working right.
5.  **Check the Browser's "Developer Console" for More Details (Important for FAILED tests!):**
    *   This sounds a bit technical, but it's super helpful!
    *   In most browsers (like Chrome or Firefox), you can open the Developer Console by pressing the **F12** key. (You can also usually find it in the browser's menus, often under "More Tools" or "Developer Tools").
    *   The console will show more detailed messages from the tests. If a test FAILED, the console will often have error messages that give clues about what went wrong. It will also show lots of informational messages about what the tests were doing.

### Using the Built-in Live Console Viewer

The `test_runner.html` page now includes its own mini 'console viewer' right on the page!

*   **What it does:** It shows many of the same messages that would normally only appear if you opened your browser's special 'Developer Console' (the F12 tool). This can make it quicker to see what the tests are doing or why something might have failed.
*   **How to see it:**
    1.  When you open `test_runner.html`, you'll see a button near the top that says **'Toggle Live Console View'**.
    2.  Click this button to show (expand) or hide (collapse) the live console window on the page.
    3.  Messages from the tests (like informational logs, warnings, or errors) will appear in this window as they happen.
*   **Features of the Live Console:**
    *   **Timestamps:** Each message has a timestamp (like `[10:30:15.123]`) so you know when it happened.
    *   **Levels:** Messages are marked with their type, like `[LOG]`, `[WARN]`, `[ERROR]`, and have different colors to help you spot important ones.
    *   **Auto-Scroll:** The window usually scrolls down automatically as new messages appear.
    *   **Clear Button:** There's a **'Clear Live Console'** button next to the toggle button. Click this to wipe all messages from the live console window (it doesn't clear the browser's real Developer Console).
*   **Still Use the Browser's Developer Console (F12)!**
    *   This built-in live console is helpful, but the browser's own Developer Console (usually opened by pressing F12) is much more powerful.
    *   The browser's console is better for looking at complex data, seeing detailed error information (like exactly which line of code caused a problem), and other advanced things.
    *   **Good practice:** Use the live console for a quick look, but if a test fails or you need more detail, always open and check the browser's Developer Console too!

## What Each Test File Checks

This section will break down what each test file (`something_test.js`) is trying to "quiz" our main code about.

### `common_test.js` (Testing `scripts/common.js`)

**What `common.js` is for:** This file has a bunch of helper functions and basic settings that are used by many other parts of the extension. Think of it as a toolbox with common tools everyone needs.

**What the tests in `common_test.js` check:**

*   **`isFirefox` tests:**
    *   **What it checks:** "Checks if the code can tell if it's running in the Firefox browser."
    *   **PASSED:** "Means the code can correctly identify Firefox."
    *   **FAILED:** "The extension might not work perfectly in Firefox if it needs to do Firefox-specific things."

*   **`normalizeCase` tests:**
    *   **What it checks:** "Checks if the code properly cleans up text. For example, making all letters lowercase and removing special accents (like on á or ñ) so that 'Niño' and 'nino' are treated the same for blocking."
    *   **PASSED:** "Text will be handled consistently for blocking rules."
    *   **FAILED:** "Blocking might not work if you type 'NIÑO' and the system only understands 'nino'."

*   **Term matching function tests** (`isExactTerm`, `isLooseTerm`, `isRegExpTerm`, `toRegExp`):
    *   **What it checks:** "These tests check if the code understands the different ways you can type things to block. For example, if you want to block 'cat videos' exactly, or just anything with 'cat' in it, or use fancy patterns (Regular Expressions)."
    *   **PASSED:** "The extension will correctly understand your blocking rules."
    *   **FAILED:** "The extension might get confused by your blocking rules and not block what you expect."

*   **Storage function tests** (`getStorageMode`, `storageGet`, `storageSet`, `storageRemove`, `storageClear`):
    *   **What it checks:** "These check if the extension can save and load your settings and blacklist correctly. It also checks if it can switch between saving data in your browser's 'sync' storage (which can be shared between your computers) or just 'local' storage (on one computer)."
    *   **PASSED:** "Your settings and blacklist will be saved and loaded without problems."
    *   **FAILED:** "The extension might forget your settings or your blacklist, or it might not be able to save them at all."

*   **Logging function tests:**
    *   **What it checks:** "Checks if the code's attempts to write informational messages (for developers) are working. These are like little notes the code writes to help understand what it's doing."
    *   **PASSED:** "Developer messages are being recorded, which helps fix problems."
    *   **FAILED:** "It might be harder for developers to fix bugs if these messages aren't working."

### `storage_test.js` (Testing `scripts/storage.js`)

**What `storage.js` is for:** This file is like a super-smart librarian for the extension. It helps store and organize all the information the extension needs to remember, especially your blacklist, which can sometimes be very large.

**What the tests in `storage_test.js` check:**

*   **`measureStoredSize` tests:**
    *   **What it checks:** "This checks if the 'librarian' can accurately guess how much shelf space (storage space) a piece of information (like a part of your blacklist) will take up before trying to store it."
    *   **PASSED:** "Means the extension is good at estimating data sizes, which helps it avoid errors when saving."
    *   **FAILED:** "The extension might misjudge how big your blacklist is, which could lead to problems when trying to save it, like trying to fit a giant book onto a tiny shelf."

*   **`splitBlacklistItems` tests:**
    *   **What it checks:** "Sometimes your blacklist is too big to fit on one 'shelf' (a single storage spot). This checks if the 'librarian' can cleverly split a very large blacklist into smaller, manageable chunks or 'pamphlets' that can be stored separately."
    *   **PASSED:** "Even if your blacklist is huge, the extension can handle it by breaking it into smaller pieces to save it properly."
    *   **FAILED:** "If your blacklist is very large, the extension might fail to save it because it can't break it down correctly, like the librarian trying to stuff a giant map into a small drawer without folding it."

*   **`mergeBlacklistFragments` tests:**
    *   **What it checks:** "This is the opposite of splitting. If the blacklist was split into smaller 'pamphlets' for storage, this checks if the 'librarian' can find all those pamphlets and put them back together perfectly to recreate your full blacklist when the extension needs it."
    *   **PASSED:** "The extension can correctly rebuild your full blacklist from its stored pieces whenever it needs to use it."
    *   **FAILED:** "The extension might lose parts of your blacklist or get it mixed up if it can't put the pieces back together right, like the librarian losing pages from a book or putting them in the wrong order."

### `background_test.js` (Testing `scripts/background.js`)

**What `background.js` is for:** This part of the extension is like the main control center or the 'brain'. It works silently in the background, managing important tasks even when you don't have the extension's popup window or settings page open.

**What the tests in `background_test.js` check:**

*   **`handleUrlRedirect` tests:**
    *   **What it checks:** "Twitch has different ways it sorts channels in its directory (like by 'Relevance' or by 'Viewers - High to Low'). Many users prefer to always see channels sorted by 'Viewers - High to Low'. These tests check if the 'brain' correctly notices when you visit a Twitch directory page that isn't sorted by viewers, and automatically changes the web address to re-sort it by 'Viewers - High to Low'. It also checks that it *doesn't* try to re-sort pages it's supposed to ignore, like your 'Following' page or video pages."
    *   **PASSED:** "Means the extension will helpfully sort Twitch directories by viewer count automatically for a better browsing experience."
    *   **FAILED:** "The automatic sorting might not work, or it might try to sort pages it shouldn't, which could be annoying or break those pages."

*   **`chrome.tabs.onUpdated` listener tests:**
    *   **What it checks:** "This is about how the 'brain' reacts when you navigate to new web pages or when a page finishes loading in your browser tabs."
    *   **Icon Management:** "Checks if the extension's icon (usually at the top of your browser) correctly appears (becomes clickable) when you're on a Twitch page, and grays out (becomes unclickable) when you're on a non-Twitch page."
        *   **PASSED:** "The extension icon will correctly show you when it's active and ready to use on Twitch."
        *   **FAILED:** "The icon might be grayed out on Twitch pages when it should be active, or it might look active on non-Twitch pages where it can't do anything."
    *   **Redirect Trigger:** "Also checks if this part correctly tells the `handleUrlRedirect` function (above) to check the page for sorting when a Twitch directory page is loading."
        *   **PASSED:** "The auto-sorting feature will be triggered at the right time when you visit Twitch directories."
        *   **FAILED:** "Auto-sorting might not happen because this trigger isn't working."

*   **`chrome.runtime.onMessage` listener tests:**
    *   **What it checks:** "Different parts of the extension sometimes need to send messages to each other. This checks if the 'brain' correctly listens for these messages and does the right thing."
    *   **`openBlacklist` action:** "If you click a button in the extension's popup to open your blacklist settings, this test checks if the 'brain' receives that instruction and correctly opens the blacklist page in a new tab."
        *   **PASSED:** "The 'Manage Blacklist' button in the popup will work correctly."
        *   **FAILED:** "Clicking the 'Manage Blacklist' button might do nothing."
    *   **Message Forwarding:** "Other messages (not for opening the blacklist) are sometimes meant for the part of the extension that works directly on the Twitch web page. This checks if the 'brain' correctly passes those messages along."
        *   **PASSED:** "Different parts of the extension can communicate properly, allowing features like live filtering to work."
        *   **FAILED:** "Some features might not work correctly because messages are getting lost or not delivered to the right place."

*   **`setInitialIconStates` tests:**
    *   **What it checks:** "When your browser first starts, or when the extension is first installed/enabled, this checks if the 'brain' goes through all your open tabs and correctly sets the extension icon to be active for any Twitch tabs and inactive for any non-Twitch tabs."
    *   **PASSED:** "When you start your browser, the extension icon will immediately show the correct active/inactive state for all your tabs."
    *   **FAILED:** "The extension icon might not be correctly set for your already open tabs until you visit them."

### `popup_test.js` (Testing `scripts/popup.js`)

**What `popup.js` is for:** This code is for the small window that pops up when you click the extension's icon in your browser's toolbar. It's like a mini-dashboard for the extension.

**What the tests in `popup_test.js` check:**

*   **`openBlacklist` tests:**
    *   **What it checks:** "Checks if the main button in the popup, 'Manage Blacklist', correctly tells the browser to open your blacklist settings page in a new tab."
    *   **PASSED:** "The 'Manage Blacklist' button works as expected."
    *   **FAILED:** "Clicking the 'Manage Blacklist' button might do nothing, so you can't easily get to your settings."

*   **`getState` tests:**
    *   **What it checks:** "This checks if the popup can correctly find out the extension's current settings, like whether the whole extension is turned on or off, and whether the little 'X' buttons (for quick-blocking items on Twitch) are set to be visible or hidden."
    *   **PASSED:** "The popup will accurately show you the current status of the extension."
    *   **FAILED:** "The popup might show incorrect information about whether the extension is active or if the 'X' buttons are visible."

*   **`enableExtension` / `disableExtension` tests:**
    *   **What it checks:** "These check if the main toggle button in the popup correctly sends the 'turn on' or 'turn off' command to the rest of the extension."
    *   **PASSED:** "You can reliably enable or disable the entire extension using the button in the popup."
    *   **FAILED:** "The main enable/disable button in the popup might not work, preventing you from easily turning the extension on or off."

*   **Event Listener tests** (for the buttons/checkboxes in the popup):
    *   **What it checks:** "This group of tests makes sure that when you click the buttons or check the boxes in the popup, the correct action happens."
    *   'Manage Blacklist' button click: "Specifically re-checks that clicking this button tries to open the blacklist page."
    *   Enable/Disable toggle button click: "Checks that clicking this button correctly tells the extension to turn on or off, and that the button's text changes (e.g., from 'Disable Extension' to 'Enable Extension')."
    *   'Show/Hide X buttons' checkbox: "Checks that when you check or uncheck this box, it tells the extension to show or hide those little 'X' buttons that appear on Twitch items."
    *   **PASSED:** "All the controls in the popup window will respond correctly to your clicks and changes."
    *   **FAILED:** "Some buttons or checkboxes in the popup might not do anything, or do the wrong thing."

*   **`init()` (Initialization) tests:**
    *   **What it checks:** "When you open the popup, this checks if it correctly sets itself up based on your saved settings. For example, if you had disabled the extension, the main toggle button should say 'Enable Extension', and the icon next to it might look different. If you chose to hide the 'X' buttons, that checkbox should be unchecked."
    *   **PASSED:** "The popup window will always show the correct information and button states as soon as you open it."
    *   **FAILED:** "The popup window might not accurately reflect your current settings when you first open it (e.g., it might say the extension is on when it's actually off)."

### `blacklist_test.js` (Testing `scripts/blacklist.js`)

**What `blacklist.js` is for:** This is all the code for the main settings page of the extension – the page where you tell the extension exactly what games, channels, tags, or words in titles you want to hide. Think of it as your personal control panel for blocking things.

**What the tests in `blacklist_dom_test.js` and `blacklist_logic_test.js` check:**

*   **Displaying and Managing Blacklist Items (mostly from `blacklist_dom_test.js`):**
    *   `createItemRow`, `addItem`, `addItems`: "Checks if, when you type something to block (like a game name), it correctly shows up in the list on the page. Also checks if it sorts the lists alphabetically and prevents you from adding the exact same thing twice."
        *   **PASSED:** "Your blacklist items will appear correctly in the lists on the settings page, making it easy to see what you've blocked."
        *   **FAILED:** "Items might not show up when you add them, lists might not be sorted, or you might see confusing duplicates."
    *   `clearItems`, `onRemoveItem`: "Checks if the 'Remove' button next to each item works, and if the 'Remove All' button for a whole list (like clearing all your blocked channels) works."
        *   **PASSED:** "You can easily remove individual items or clear entire sections of your blacklist."
        *   **FAILED:** "You might get stuck with items you can't remove, or the 'Remove All' button might not work."
    *   `itemExists`: "A helper check to see if an item is already in a list, mainly used by other functions."
        *   **PASSED:** "The code can correctly tell if you've already blocked something."
        *   **FAILED:** "Might affect whether duplicates are handled correctly."
    *   `onAddItem` (input processing): "When you type a new item to block, this checks if the code cleans up your input (like removing extra spaces) and understands if you're trying to use special patterns (like for exact matches or more complex RegExp). It also checks if it warns you about invalid patterns."
        *   **PASSED:** "The settings page correctly processes what you type, making your blocking rules work as intended."
        *   **FAILED:** "The page might misunderstand what you typed, or your special blocking patterns might not work. It might also not warn you if you type an invalid pattern."
    *   `handleItemCount`: "Checks if the little number in parentheses next to each list title (e.g., 'Blocked Channels (5)') updates correctly as you add or remove items. Also checks if a message like 'You haven't blocked any channels yet' appears when a list is empty, and that the 'Remove All' button hides/shows at the right times."
        *   **PASSED:** "The item counts and messages on the page will be accurate, giving you a clear overview."
        *   **FAILED:** "The item counts might be wrong, or you might not see helpful messages when lists are empty."

*   **Saving, Loading, and Data Management (mostly from `blacklist_logic_test.js`):**
    *   `gatherKeysMap`, `gatherKeysArray`: "Before saving, the code needs to collect everything you've put in the lists. These tests check if it gathers all your blocked items correctly from the page."
        *   **PASSED:** "The extension correctly reads all items from your lists when you hit 'Save'."
        *   **FAILED:** "When you save, the extension might miss some items, or save the wrong things."
    *   `onSave`: "This is a big one! It checks many things when you click the 'Save' button:
        *   Are your settings (like 'Hide Reruns' checkbox) saved?
        *   Are any items you just typed (but didn't click 'Add' for yet) included in the save?
        *   Does it correctly send your whole blacklist to be stored by the browser?
        *   Does it tell you if the save was successful or if there was an error (like if your blacklist is too big for 'sync' storage and it had to switch to 'local' storage)?
        *   Does the page close automatically after a successful save?"
        *   **PASSED:** "Your blacklist and settings will be saved reliably. You'll be notified of any issues, and the page will close if everything is okay."
        *   **FAILED:** "Your blacklist might not save, or settings could be lost. Error messages might not appear, or the page might close even if there was a problem (or not close when it should)."
    *   `onCancel`: "Checks if the 'Cancel' button correctly closes the settings page without saving changes."
        *   **PASSED:** "You can safely close the settings page without saving if you change your mind."
        *   **FAILED:** "The 'Cancel' button might not work."
    *   `onImport`, `onExport`: "Checks if you can successfully import a blacklist from a file, and export your current blacklist to a file. This includes testing if it can read the file correctly during import, and create the right file format for export."
        *   **PASSED:** "You can easily back up your blacklist to a file or load a previously saved blacklist."
        *   **FAILED:** "Import/Export might fail, potentially corrupting your list or not creating a usable backup."
    *   Loading Functions (`loadBlacklistedItems`, `loadHideFollowing`, etc.): "When you first open the settings page, these tests check if all your previously saved blacklist items and settings are loaded and displayed correctly. For example, are all your blocked channels shown in the list? Is the 'Hide Reruns' checkbox checked if you had it checked before?"
        *   **PASSED:** "The settings page will always show your most up-to-date blacklist and settings when you open it."
        *   **FAILED:** "The settings page might not show your saved items or settings, or it might show outdated information."

*   **General Page Behavior (from both files):**
    *   `flashSaveButton`: "Checks if the 'Save' button starts flashing or changes appearance when you've made changes that haven't been saved yet, to remind you."
        *   **PASSED:** "You'll get a visual reminder if you have unsaved changes."
        *   **FAILED:** "You might forget to save your changes because the button doesn't indicate it's needed."
    *   `onPatternExplained`: "Checks if clicking the little help link for 'patterns' shows you an explanation."
        *   **PASSED:** "Helpful explanations are available on the page."
        *   **FAILED:** "You might not be able to see the help text for advanced blocking patterns."
    *   `toggleLoadingScreen`: "Checks if the page correctly shows a 'Processing...' message and temporarily disables buttons when you're doing something that takes a moment, like importing a big list or saving."
        *   **PASSED:** "The page provides good feedback when it's busy and prevents you from clicking things that could cause issues."
        *   **FAILED:** "The page might seem frozen or unresponsive when it's busy, or you might be able to click buttons when you shouldn't."

### `directory_test.js` (Testing `scripts/directory.js`)

**What `directory.js` is for:** This is the most important script! It's the part of the extension that actually looks at Twitch pages, figures out what's on them, and hides the things you've told it to block. It's like the extension's 'eyes' and 'hands' that work directly on the Twitch website.

**What the tests in `directory_parsing_test.js`, `directory_filter_test.js`, and `directory_ui_state_test.js` check:**

*   **Understanding Twitch Pages (mostly from `directory_parsing_test.js`):**
    *   Page Type and URL Helpers (`getCurrentPage`, `getPageType`, `isSupportedPage`, `getCategoryFromPage`): "Checks if the extension can correctly tell what kind of Twitch page you're currently looking at (like the main directory, a specific game's page, your 'Following' page, or a video page). This is important because the extension should only try to hide things on certain types of pages."
        *   **PASSED:** "The extension knows where it is on Twitch and will only try to work on the right pages."
        *   **FAILED:** "The extension might try to hide things on pages where it shouldn't (like video pages), or it might not work on pages where it's supposed to."
    *   Finding Items on the Page (`getDirectoryItemNodes`): "Twitch pages are made of many small parts. These tests check if the extension can correctly find the specific boxes or cards that represent game categories or live channels within the page's code."
        *   **PASSED:** "The extension can successfully locate the streams and categories listed on the page."
        *   **FAILED:** "The extension might not be able to 'see' any of the channels or categories, so it can't hide anything. This could happen if Twitch changes its website layout."
    *   Reading Information from Items (`readCategoryCard`, `readChannel`, `readTags`): "Once the extension finds a 'box' for a game or a channel, these tests check if it can correctly read the information from it, like the game's name, the channel's name, the stream title, and any tags."
        *   **PASSED:** "The extension can accurately understand the details of each stream or category it finds."
        *   **FAILED:** "The extension might get the names, titles, or tags wrong. If it reads 'Call of Duty' as 'Cool Dudes,' your blocking rules for 'Call of Duty' won't work!"
    *   Getting All Items (`getDirectoryItems`): "This combines the two steps above: it checks if the extension can find all the item boxes AND read the information from all of them correctly."
        *   **PASSED:** "The extension has a complete and accurate list of what's on the page."
        *   **FAILED:** "The extension might miss some items or have incorrect details for them."
    *   Sidebar Parsing (`getSidebarItemNodes`, `getSidebarItems`): "Checks if the extension can correctly find and read the channels listed in your 'Followed Channels' sidebar on Twitch."
        *   **PASSED:** "The extension can see and understand your followed channels list in the sidebar."
        *   **FAILED:** "Features related to your followed channels in the sidebar (like hiding them if they are reruns and you've chosen that option) might not work."

*   **Deciding What to Hide (mostly from `directory_filter_test.js`):**
    *   `isBlacklistedItem`: "This is a very important check. For every channel or category the extension finds, this test sees if it correctly decides whether that item should be hidden based on YOUR blacklist and settings. It checks against blocked names, categories, titles, and tags. It also checks if reruns should be hidden if you've set that option."
        *   **PASSED:** "The extension will make the correct decision (hide or show) for every item based on your personal blacklist."
        *   **FAILED:** "The extension might hide things it shouldn't, or (more likely) it might FAIL to hide things that are actually on your blacklist. This is the core of why you use the extension, so failures here are critical!"
    *   Applying the Hiding Action (`filterItems`, `filterDirectory`, `filterSidebar`, `filterAllContent`): "If `isBlacklistedItem` decides an item should be hidden, these tests check if the extension actually makes it disappear from the page. They also check if items that *shouldn't* be hidden remain visible."
        *   **PASSED:** "Items you want blocked will be hidden from view, and other items will remain visible."
        *   **FAILED:** "Blocked items might still appear on the page, or, less likely, items that aren't on your blacklist might get hidden by mistake."

*   **Interacting with the Page and Extension (mostly from `directory_ui_state_test.js`):**
    *   Starting Up and Knowing Settings (`initExtensionState`, `initPromise` checks): "When the extension first starts up on a Twitch page, these tests check if it correctly loads your saved settings (like whether the extension is enabled, or if the 'X' buttons should show up)."
        *   **PASSED:** "The extension starts up correctly on Twitch pages and remembers your preferences."
        *   **FAILED:** "The extension might not use your saved settings when it loads on a page, or it might not start up properly at all."
    *   Quick-Hide 'X' Buttons (`attachHideButtons`, `onHideItem`): "The extension can show little 'X' buttons next to channels or tags. These tests check if those 'X' buttons appear correctly, and if clicking one successfully adds that item to your blacklist and hides it immediately."
        *   **PASSED:** "The 'X' buttons will work, letting you quickly add things to your blacklist."
        *   **FAILED:** "The 'X' buttons might not show up, or clicking them might not do anything."
    *   'Manage Blacklist' Button on Page (`addManagementButton`): "Checks if the 'Manage Blacklist' button (and the button to show/hide 'X' buttons) appears correctly on Twitch directory pages, usually at the top."
        *   **PASSED:** "You'll have easy access to manage your blacklist from Twitch pages."
        *   **FAILED:** "The 'Manage Blacklist' button might be missing."
    *   Reacting to Page Changes (`monitorPageChanges`, `onPageChange`): "As you click around on Twitch (going from one directory to another, for example), the web address changes. These tests check if the extension notices these changes and re-filters the new page content correctly."
        *   **PASSED:** "The extension will keep working and filtering content as you browse around Twitch."
        *   **FAILED:** "The extension might only filter the first page you visit and then stop working if you navigate to other Twitch directories."
    *   Finding New Items as You Scroll (`checkForNewDirectoryItems`): "Some Twitch pages load more items as you scroll down. This checks if the extension notices these newly loaded items and filters them too."
        *   **PASSED:** "Even if you scroll to load more content, the new items will also be filtered."
        *   **FAILED:** "Items that load as you scroll might not get hidden, even if they are on your blacklist."
    *   Watching the Sidebar for Changes (`observeSidebar`): "If new channels appear in your sidebar (though this is less common), this checks if the extension notices and filters them."
        *   **PASSED:** "The sidebar will also be kept up-to-date with your filtering rules."
        *   **FAILED:** "Changes in the sidebar might not be filtered."
    *   Responding to Messages from Popup/Brain (`chrome.runtime.onMessage` listener): "Checks if this part of the extension correctly responds to instructions from other parts, like:
        *   Show or hide the 'X' buttons if you changed that setting in the popup.
        *   Enable or disable all filtering if you toggled the extension in the popup.
        *   Reload your blacklist and re-filter the page if you saved changes on the blacklist settings page."
        *   **PASSED:** "The extension will react instantly to changes you make in the popup or settings page."
        *   **FAILED:** "Changes made in the popup or settings page might not take effect on the Twitch page you're viewing until you reload it manually."
    *   Saving and Loading Your Blacklist (interactions with `putBlacklistedItems`, `getBlacklistedItems`, `modifyBlacklistedItems`): "These tests verify that this main script correctly uses the 'librarian' (`storage.js`) and 'common helpers' (`common.js`) to load your blacklist when it starts, update it in its memory if you use an 'X' button, and save it if needed."
        *   **PASSED:** "Your blacklist is handled correctly by the main filtering script."
        *   **FAILED:** "The main script might use an outdated blacklist, or changes made via 'X' buttons might not be remembered correctly."

[end of TESTING.md]
