import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles.css";
import { applyAccent, applyTheme, readAccent, readTheme } from "./ui/theme";

applyTheme(readTheme());
applyAccent(readAccent());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
