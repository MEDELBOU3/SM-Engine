You are acting as a Senior Frontend Architect. Your task is to refactor, optimize, and organize my CSS code. 

Please analyze the raw CSS code provided at the end of this prompt and systematically refactor it using the following professional guidelines:

### 1. Consolidate into CSS Variables (:root)
- Identify repeating color values (hex, rgb, rgba), font families, transitions, border-radii, and common spacing values (paddings/margins).
- Extract them into semantic variables inside a `:root` block at the very top of the stylesheet (e.g., `--ui-bg-main`, `--ui-accent`, `--radius-md`).
- Replace all raw matching values throughout the stylesheet with these new `var()` declarations.

### 2. Group and De-Duplicate Properties
- Scan the code for identical or near-identical sets of style declarations applied to different selectors.
- Group these selectors together where appropriate, or extract common styles into shared component/utility definitions (e.g., standardizing input behaviors, slider thumbs, or button click transitions).
- Eliminate redundant or overridden styles within the same block (e.g., having a display property declared twice, or redundant margin declarations).

### 3. Apply a Logical Ordering Structure
Reorganize the entire stylesheet from top to bottom into the following clear sections, separated by clean comment headers:
1.  **CSS Variables & Theme Setup** (`:root`)
2.  **Base Resets & Global Element Styles** (e.g., `*`, `body`, scrollbars)
3.  **Core Layout Containers** (e.g., primary wrappers, flex/grid shells)
4.  **Reusable Global Components** (e.g., buttons, input fields, dropdown menus)
5.  **Panel-Specific Rules** (Grouped logically by panel, e.g., Sidebar, Hierarchy, Inspector, Physics, Water, Sculpting)
6.  **Responsive Media Queries** (At the very bottom)

### 4. CRITICAL SAFETY CONSTRAINTS
- **DO NOT change any Class Names (.class) or ID Names (#id)**. These selectors are heavily tied to HTML structures and JavaScript event handlers. Changing them will break the application.
- Maintain layout consistency. Ensure that flex, grid, and absolute positioning relationships are not accidentally altered during cleanup.
- Keep comments clean, concise, and technical.

---
### RAW CSS CODE TO REFACTOR:
[PASTE YOUR CSS CODE HERE]