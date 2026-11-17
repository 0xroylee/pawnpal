import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { t } from "./i18n/t.js";
import "./styles/app.css";

document.title = t("app.title");
const root = document.getElementById("root");
if (!root) throw new Error("Pawnpal root element was not found");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
