import React, { useState, useMemo, useEffect } from "react";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import Fuse from 'fuse.js';

interface MaterialOption {
  idMaterial: number;
  numeroArticulo: string;
  descripcionArticulo: string;
  enStock: number | null;
}

interface BuscarMaterialProps {
  materiales: MaterialOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export const BuscarMaterial: React.FC<BuscarMaterialProps> = ({ materiales, value, onChange, disabled }) => {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Sincroniza el texto del input con el valor externo
  useEffect(() => {
    if (!value) {
      setInputValue("");
      setShowDropdown(false);
      return;
    }
    const match = materiales.find((m) => String(m.idMaterial) === value);
    if (match) {
      const label = match.numeroArticulo
        ? `${match.numeroArticulo} - ${match.descripcionArticulo}`
        : match.descripcionArticulo;
      setInputValue(label);
    }
  }, [value, materiales]);

  // Filtrado profesional con búsqueda difusa (Fuzzy Search)
  const fuse = useMemo(() => {
    return new Fuse(materiales, {
      keys: ['numeroArticulo', 'descripcionArticulo'],
      threshold: 0.35,
      distance: 100,
      minMatchCharLength: 1
    });
  }, [materiales]);

  const resultados = useMemo(() => {
    if (!inputValue || inputValue === (materiales.find(m => String(m.idMaterial) === value)?.descripcionArticulo || "")) {
      return materiales.slice(0, 50); // Mostrar top 50 por defecto
    }
    
    // Si parece una selección exacta, no filtramos agresivamente
    const match = materiales.find(m => 
      `${m.numeroArticulo} - ${m.descripcionArticulo}` === inputValue
    );
    if (match) return materiales.slice(0, 50);

    return fuse.search(inputValue).map(result => result.item);
  }, [inputValue, materiales, fuse, value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowDropdown(true);
  };

  const handleSelect = (mat: MaterialOption) => {
    setInputValue(`${mat.numeroArticulo} - ${mat.descripcionArticulo}`);
    setShowDropdown(false);
    onChange(String(mat.idMaterial));
  };

  return (
    <div style={{ position: "relative" }}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        placeholder="Seleccionar material..."
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        className="w-full"
      />
      {showDropdown && (
        <ul
          style={{
            position: "absolute",
            zIndex: 20,
            width: "100%",
            background: "white",
            border: "1px solid #eee",
            maxHeight: 220,
            overflowY: "auto",
            margin: 0,
            padding: 0,
            listStyle: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.07)",
          }}
        >
          {resultados.length === 0 && (
            <li style={{ padding: 8, color: "#888" }}>Sin resultados</li>
          )}
          {resultados.map((mat) => (
            <li
              key={mat.idMaterial}
              style={{ padding: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseDown={() => handleSelect(mat)}
            >
              <span>
                {mat.numeroArticulo
                  ? `${mat.numeroArticulo} - ${mat.descripcionArticulo}`
                  : mat.descripcionArticulo}
              </span>
              {typeof mat.enStock === 'number' && mat.enStock !== null ? (
                <Badge variant="outline" className="ml-2">
                  Stock: {mat.enStock}
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
