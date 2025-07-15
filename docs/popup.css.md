# Documentation for `styles/popup.css`

## File Overview

This stylesheet provides the specific styles for the extension's popup window, which is defined in `views/popup.html`. It works together with `styles/common.css` to control the layout and appearance of this small, focused user interface. While `common.css` provides the general look of buttons and text, `popup.css` is responsible for the specific layout and dimensions of the popup itself.

## Key Sections and Styles

### 1. `#popup` Container

-   **Selector**: `#popup`
-   **Purpose**: This is the main container for the entire popup UI.
-   **Key Styles**:
    -   `width: 256px;`: This defines a fixed width for the popup, ensuring it has a consistent size every time it's opened.
    -   `text-align: right;`: This aligns the buttons and other content to the right side of the popup, creating the specific layout seen by the user.

### 2. `#icon` Element

-   **Selector**: `#icon`
-   **Purpose**: Styles the extension's icon that appears in the top-left corner of the popup.
-   **Key Styles**:
    -   `position: absolute;`: This is important for positioning the icon. It lifts the icon out of the normal flow of the document, allowing the right-aligned buttons to sit next to it without being pushed down.
    -   `background-image: url('/images/icon48.png');`: Sets the image for the icon.
    -   `height: 48px;`, `width: 48px;`: Defines the dimensions of the icon.
    -   **`#icon.disabled`**: This is a key state-related style. When the `popup.js` script determines that the extension is disabled, it adds the `disabled` class to this element. The `filter: grayscale(100%);` rule then applies a grayscale filter, turning the icon gray and providing clear visual feedback to the user that the extension is not active.

### 3. `.action` Class

-   **Selector**: `.action`
-   **Purpose**: This is a simple wrapper class for the main action buttons ("Manage Blacklist" and "Disable/Enable Extension").
-   **Key Styles**:
    -   `margin-bottom: 8px;`: Provides consistent vertical spacing between the buttons.
    -   The `:last-child` selector is used to remove the bottom margin from the last button, preventing extra space at the bottom of the popup.

### 4. `.toggle-x` Class

-   **Selector**: `.toggle-x`
-   **Purpose**: Styles the container for the "Show X Buttons" checkbox at the bottom of the popup.
-   **Key Styles**:
    -   `margin-top: 16px;`: Adds some extra space above this final toggle to visually separate it from the main action buttons.
    -   `font-size: 11px;`, `color: #A0A0A0;`: Makes the text smaller and lighter, indicating that it's a secondary setting.

This stylesheet is simple and focused, as befits the small and simple UI of the popup. Its main responsibilities are defining the overall size of the popup, positioning the icon, and providing spacing for the interactive elements. The most significant feature is the `.disabled` class on the icon, which provides important visual feedback about the extension's state.
