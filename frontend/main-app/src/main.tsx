import "./lib/session";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmDialog";
import "@fontsource-variable/noto-sans-bengali/wght.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
