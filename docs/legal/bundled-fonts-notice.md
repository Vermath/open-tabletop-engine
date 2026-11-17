# Bundled fonts notice

The web client bundles two typefaces so that it looks the same on every operating system and works offline. Both are distributed under the SIL Open Font License, Version 1.1, and are installed from the `@fontsource-variable` npm packages, which carry the full licence text.

| Typeface | Used for | Copyright | Licence |
| --- | --- | --- | --- |
| Alegreya | Headings, names and the brand | Copyright 2011 The Alegreya Project Authors (https://github.com/huertatipografica/Alegreya) | SIL OFL 1.1 |
| Figtree | Interface text | Copyright 2022 The Figtree Project Authors (https://github.com/erikdkennedy/figtree) | SIL OFL 1.1 |

The licence text for each is in `node_modules/@fontsource-variable/<name>/LICENSE` after installation, and at https://openfontlicense.org.

The fonts are loaded in `apps/web/src/main.tsx` and named in the `--font-display` and `--font-sans` variables in `apps/web/src/styles.css`. To change a typeface, replace the import and the variable; nothing else refers to the font names.

This notice records what is bundled. It is not legal advice.
