import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/print.css"; // Importar estilos de impresión
import "./styles/globals.css"; // Overrides y ajustes de Sileo
import { Toaster } from "sileo";

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    {/* Opción 6: Gris carbón profesional, centrado arriba, con bordes suaves */}
    <Toaster
      position="top-center"
      offset={{ top: 12 }}
      options={{ fill: "#374151", roundness: 16 }}
    />
  </>
);