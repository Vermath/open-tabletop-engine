import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// Bundled variable fonts (SIL Open Font License 1.1) so the interface looks the same on every
// operating system and works offline in the desktop app. Alegreya is the display face, Figtree the interface face.
import "@fontsource-variable/alegreya/wght.css";
import "@fontsource-variable/figtree/wght.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
