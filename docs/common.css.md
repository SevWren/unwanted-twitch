# Documentation for `styles/common.css`

## File Overview

This stylesheet is the foundational CSS file for the entire extension's user interface. It provides a consistent look and feel for all UI pages, including the popup (`popup.html`) and the main settings page (`blacklist.html`). Its primary role is to define a global color palette, establish base styles for common HTML elements like buttons and tables, and implement a dark theme.

The most important architectural feature of this file is its extensive use of CSS variables (Custom Properties). This allows for easy and centralized theme management.

## Key Sections and Styles

### 1. Global Reset

-   **Selector**: `*`
-   **Purpose**: To create a consistent baseline by removing default browser margins, paddings, and borders from all elements.
-   **Key Styles**:
    -   `box-sizing: border-box;`: This is a critical rule that makes layout math more intuitive. It ensures that the `padding` and `border` of an element are included in its total `width` and `height`, rather than being added on top.
    -   `margin: 0px;`, `padding: 0px;`, `border-width: 0;`: Resets these properties for all elements.

### 2. CSS Variables and Theming

-   **Selector**: `:root`
-   **Purpose**: This is where the entire color palette and theme for the extension is defined. By defining these as CSS variables, the colors can be easily reused throughout the stylesheets and can be redefined for the dark theme.
-   **Key Variables**:
    -   `--UT-MainColor1`: The primary brand color, Twitch's purple (`#9147ff`).
    -   `--UT-MainColor2`: A darker purple used for hover states.
    -   `--UT-color1` & `--UT-color2`: The primary text and background colors (black and white in the light theme).
    -   `--UT-Table-background-color1` & `--UT-Table-background-color2`: Colors used for styling tables, including alternating row colors.
    -   `--UT-checkbox-filterColor`: A `hue-rotate` filter used to give the default browser checkboxes a purple tint.

### 3. Dark Theme

-   **Selector**: `@media (prefers-color-scheme: dark)`
-   **Purpose**: To provide a better user experience for users who have dark mode enabled in their operating system.
-   **Mechanism**:
    -   This media query detects the user's OS-level color scheme preference.
    -   Inside the query, it redefines the CSS variables declared in the `:root`. For example, `--UT-color1` (text color) is changed from `black` to a light gray (`hsl(0, 0%, 80%)`), and `--UT-Main-background-color1` is changed from `white` to a dark gray (`hsl(264, 2%, 10%)`).
    -   Because all other styles in the extension use these variables, the entire UI automatically switches to a dark theme without needing to override every single style rule.
    -   It also includes a clever trick to style checkboxes for dark mode: `filter: var(--UT-checkbox-filterColor) invert(.8);`. It reuses the hue-rotate filter and then inverts the color to make it look good on a dark background.

### 4. Base Element Styles

-   **Selectors**: `body`, `button`, `table`, `input`, etc.
-   **Purpose**: To provide consistent, default styling for the most common HTML elements.
-   **Key Styles**:
    -   **`body`**: Sets the default background color, text color, and font for all pages.
    -   **`button`**: Defines the standard appearance of all buttons. It uses the CSS variables for its background color (`--UT-MainColor1`) and has defined `:hover`, `:focus`, and `:active` states for interactivity. It also includes styles for a `.disabled` state and a `.flashed` state (used on the blacklist page's "Save" button).
    -   **`table`**: Defines the base styles for tables, including `border-collapse`. It uses `tr:nth-child(odd)` to create striped rows for better readability, using the `--UT-Table-background-color1` variable.
    -   **`th` (Table Header)**: Has its own distinct style with a purple background (`--UT-MainColor1`) and white text.
    -   **`input[type="text"]`**: Defines the standard appearance for text boxes.

### 5. Utility Classes

-   **Selector**: `.checkable`
-   **Purpose**: A simple utility class used on the blacklist page for the divs that contain a checkbox and a label.
-   **Key Styles**:
    -   `user-select: none;`: Prevents the user from accidentally selecting the text of the label when clicking the checkbox.
    -   `vertical-align: middle;`: Ensures the checkbox and its label are nicely aligned on the same line.

This file is a strong example of modern CSS practices. The use of a global reset, CSS variables for theming, and the `prefers-color-scheme` media query make the extension's UI both consistent and adaptable. Any change to the core color scheme can be made by editing only a few lines in this single file.
