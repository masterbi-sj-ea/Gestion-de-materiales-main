
$content = @"
import React, { useRef, useState } from "react";
import * as xlsx from "xlsx";
import { Button } from "./ui/button";
import { UploadCloud, Loader2 } from "lucide-react";
import { apiFetch } from "../services/apiClient";
import { sileo as toast } from "sileo";

interface Props {
  onSuccess: () => void;
  areasDisponibles: { id: number; nombre: string; codigo?: string }[];
}

export function ImportadorExcelPresupuesto({ onSuccess, areasDisponibles }: Props) {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoading(true);

      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // { raw: false } force to get "01/01/2026" as string instead of excel date number
      const data = xlsx.utils.sheet_to_json(sheet, { raw: false }) as any[];

      if (data.length === 0) {
        toast.error("El archivo Excel está vacío.");
        setLoading(false);
        return;
      }

      console.log("Mapeando datos:", data.slice(0, 3)); // Debugging header names
      
      const filasAEnviar = data.map((fila, index) => {
        // 1. CODIGO DE CUENTA (Area)
        const codigoCuenta = String(fila["CÓDIGO DE CUENTA"] || fila["CODIGO DE CUENTA"] || fila["Area"] || fila["Área"] || "").trim();

        // 2. MONTO (VALOR AJUSTADO)
        const montoRaw = String(fila["VALOR AJUSTADO"] || fila["VALOR"] || fila["Monto"] || "0").replace(/,/g, "").replace(/\$/g, "").trim();
        const monto = (montoRaw === "-" || montoRaw === "") ? 0 : parseFloat(montoRaw);

        // 3. FECHA -> Mes y Año
        const fechaRaw = String(fila["FECHA"] || fila["Fecha"] || "");
        let anio = new Date().getFullYear();
        let mes = new Date().getMonth() + 1;

        if (fechaRaw.includes("/")) {
          const parts = fechaRaw.split("/");
          if (parts.length === 3) {
            mes = parseInt(parts[1], 10);
            anio = parseInt(parts[2], 10);
            if (anio < 100) anio += 2000;
          }
        } else if (fechaRaw.includes("-")) {
          const parts = fechaRaw.split("-");
          if (parts.length === 3) {
            mes = parseInt(parts[1], 10);
            anio = parseInt(parts[0], 10); // Format YYYY-MM-DD
          }
        } else {
           anio = Number(fila["Año"] || fila["AÑO"] || anio);
           mes = Number(fila["Mes"] || fila["MES"] || mes);
        }

        // Encontrar Área asociada al Código de Cuenta (o al Nombre si no pasaron el viejo formato)
        const areaEncontrada = areasDisponibles.find(a => 
           (a.codigo && a.codigo.trim() === codigoCuenta) || 
           a.nombre.trim().toUpperCase() === codigoCuenta.toUpperCase()
        );

        return {
          Anio: isNaN(anio) ? new Date().getFullYear() : anio,
          Mes: isNaN(mes) ? 1 : mes,
          IdArea: areaEncontrada ? areaEncontrada.id : null,
          MontoTotal: isNaN(monto) ? 0 : monto,
          _rawCodigo: codigoCuenta
        };
      }).filter(f => f.IdArea !== null && f.MontoTotal > 0);

      console.log("Filas filtradas y válidas:", filasAEnviar.slice(0, 3));

      if (filasAEnviar.length === 0) {
        (console.error("No valid filtered row"), toast.error("No se detectaron filas válidas. Revisa que el código de cuenta de las áreas exista en el sistema y el valor sea mayor a 0 o que esten los encabezados FECHA, CÓDIGO DE CUENTA, VALOR AJUSTADO."));
        setLoading(false);
        return;
      }

      const res = await apiFetch("/presupuestos/importar", {
        method: "POST",
        body: JSON.stringify({ filas: filasAEnviar })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Error al importar presupuesto.");
      }

      const resData = await res.json();
      toast.success(`Importación exitosa. ${"`${resData.procesados}`"} filas procesadas.`);
      onSuccess();
    } catch (error: any) {
      console.error("Error importando Excel:", error);
      toast.error(`Error: ${"`${error.message}`"}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <input 
        type="file" 
        accept=".xlsx, .xls" 
        style={{ display: "none" }} 
        ref={fileInputRef}
        onChange={processFile}
      />
      <Button 
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
        Importar Excel
      </Button>
    </>
  );
}
"@
Set-Content .\src\components\ImportadorExcelPresupuesto.tsx -Value $content;

