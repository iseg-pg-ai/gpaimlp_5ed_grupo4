// Monta a interface React no ponto de entrada do concierge, separado do restante site
// estático.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("chat-root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
