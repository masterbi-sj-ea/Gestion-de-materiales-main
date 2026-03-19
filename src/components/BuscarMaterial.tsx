import React, { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { ImageIcon, Search, ChevronDown, Check, Package2, Layers, Loader2 } from 'lucide-react';
import { cn } from './ui/utils';

import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover';
import { Command, CommandEmpty, CommandItem, CommandList } from './ui/command';

interface MaterialOption {
  idMaterial: number | string;
  numeroArticulo: string;
  descripcionArticulo: string;
  enStock: number | null;
  tieneImagen?: boolean | number | null;
}

interface BuscarMaterialProps {
  materiales: MaterialOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  icon?: 'package' | 'layers';
}

export const BuscarMaterial = React.forwardRef<HTMLInputElement, BuscarMaterialProps>(
  ({ materiales, value, onChange, disabled, placeholder = 'Seleccionar...', icon = 'package' }, ref) => {
    const [inputValue, setInputValue] = useState('');
    const [open, setOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    // Sincroniza el texto del input con el valor externo
    useEffect(() => {
      if (!value) {
        setInputValue('');
        return;
      }
      const match = materiales.find((m) => String(m.idMaterial) === String(value));
      if (match) {
        const label = match.numeroArticulo
          ? `${match.numeroArticulo} - ${match.descripcionArticulo}`
          : match.descripcionArticulo;
        setInputValue(label);
      }
    }, [value, materiales]);

    // Simulación de carga para feedback visual pro
    useEffect(() => {
      if (inputValue && open) {
        setIsSearching(true);
        const timer = setTimeout(() => setIsSearching(false), 300);
        return () => clearTimeout(timer);
      } else {
        setIsSearching(false);
      }
    }, [inputValue, open]);

    // Filtrado profesional con búsqueda difusa (Fuzzy Search)
    const fuse = useMemo(() => {
      return new Fuse(materiales, {
        keys: ['numeroArticulo', 'descripcionArticulo'],
        threshold: 0.35,
        distance: 100,
        minMatchCharLength: 1,
      });
    }, [materiales]);

    const resultados = useMemo(() => {
      if (!inputValue || (value && inputValue === (materiales.find((m) => String(m.idMaterial) === String(value))?.descripcionArticulo || ''))) {
        return materiales.slice(0, 50);
      }
      return fuse.search(inputValue).map((result) => result.item);
    }, [inputValue, materiales, fuse, value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      if (!disabled) setOpen(true);
    };

    const handleSelect = (mat: MaterialOption) => {
      setOpen(false);
      onChange(String(mat.idMaterial));
    };

    const isDisabled = !!disabled;

    return (
      <Popover open={open && !isDisabled} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative group/search">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none transition-colors group-focus-within/search:text-primary">
              {isSearching ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : icon === 'layers' ? (
                <Layers className="h-4 w-4 text-slate-400" />
              ) : (
                <Package2 className="h-4 w-4 text-slate-400" />
              )}
            </div>
            
            <Input
              ref={ref}
              value={inputValue}
              onChange={handleInputChange}
              placeholder={placeholder}
              disabled={isDisabled}
              autoComplete="off"
              onFocus={() => {
                if (!isDisabled) setOpen(true);
              }}
              className={cn(
                "w-full pl-9 pr-10 h-11 bg-slate-50/50 border-slate-200 transition-all duration-200 hover:bg-white focus:bg-white focus:ring-4 focus:ring-primary/10",
                open && "border-primary ring-4 ring-primary/10 bg-white"
              )}
            />
            
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {inputValue && !isDisabled && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setInputValue('');
                    onChange('');
                  }}
                  className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                  <Search className="h-3.5 w-3.5 rotate-90" />
                </button>
              )}
              <ChevronDown className={cn(
                "h-4 w-4 text-slate-400 transition-transform duration-200",
                open && "rotate-180 text-primary"
              )} />
            </div>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-[var(--radix-popover-trigger-width)] p-1.5 shadow-2xl border-slate-200 rounded-xl bg-white/95 backdrop-blur-sm"
        >
          <Command shouldFilter={false} className="w-full bg-transparent">
            <CommandList className="max-h-[320px] overflow-auto scrollbar-thin scrollbar-thumb-slate-200">
              {isSearching ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="h-10 w-10 bg-slate-100 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-slate-100 rounded w-1/3" />
                        <div className="h-2 bg-slate-50 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : resultados.length === 0 ? (
                <CommandEmpty className="py-6 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 text-slate-200" />
                    <p className="text-sm text-slate-500">No encontramos resultados</p>
                  </div>
                </CommandEmpty>
              ) : (
                <div className="space-y-1">
                  {resultados.map((mat) => {
                    const isSelected = String(mat.idMaterial) === String(value);
                    return (
                      <CommandItem
                        key={String(mat.idMaterial)}
                        value={String(mat.idMaterial)}
                        onSelect={() => handleSelect(mat)}
                        className={cn(
                          "flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150",
                          isSelected 
                            ? "bg-primary/5 text-primary border border-primary/20" 
                            : "hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cn(
                            "flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center border shadow-sm transition-transform group-hover:scale-110",
                            isSelected ? "bg-white border-primary/40 ring-2 ring-primary/10" : "bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200"
                          )}>
                            {mat.tieneImagen ? (
                              <div className="relative">
                                <ImageIcon className="h-5 w-5 text-primary" />
                                <div className="absolute -top-1 -right-1 h-2 w-2 bg-emerald-500 rounded-full border border-white" />
                              </div>
                            ) : (
                              <Package2 className="h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          
                          <div className="flex flex-col min-w-0">
                            <span className={cn(
                              "text-sm font-bold truncate tracking-tight transition-colors",
                              isSelected ? "text-primary" : "text-slate-800"
                            )}>
                              {mat.numeroArticulo || mat.descripcionArticulo}
                            </span>
                            {mat.numeroArticulo && (
                              <span className="text-[11px] text-slate-500 font-medium truncate italic">
                                {mat.descripcionArticulo}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Info de Stock con barra visual rápida */}
                          {typeof mat.enStock === 'number' && mat.enStock !== null && (
                            <div className="flex flex-col items-end gap-1">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "h-5 text-[10px] font-bold px-1.5 border-none shadow-sm",
                                  mat.enStock > 10 
                                    ? "bg-emerald-500 text-white" 
                                    : mat.enStock > 0 
                                      ? "bg-amber-500 text-white" 
                                      : "bg-rose-500 text-white"
                                )}
                              >
                                {mat.enStock}
                              </Badge>
                              <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    mat.enStock > 10 ? "bg-emerald-500" : mat.enStock > 0 ? "bg-amber-500" : "bg-rose-500"
                                  )}
                                  style={{ width: `${Math.min((mat.enStock / 50) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {isSelected && (
                            <div className="bg-primary h-6 w-6 rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
                              <Check className="h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);

BuscarMaterial.displayName = 'BuscarMaterial';
