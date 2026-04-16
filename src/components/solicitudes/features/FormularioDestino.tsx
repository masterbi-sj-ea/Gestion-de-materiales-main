import { memo, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '../../ui/command';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '../../ui/utils';
import { AreaListado, CatalogoListado, MaterialDisponible } from '../../../hooks/useCatalogosSolicitud';

interface FormularioDestinoProps {
  areas: AreaListado[];
  catalogos: CatalogoListado[];
  idAreaDestino: string;
  setIdAreaDestino: (id: string) => void;
  idCatalogoSolicitud: string;
  setIdCatalogoSolicitud: (id: string) => void;
  codigoCuentaPreview: string;
  codigoCuentaPlaceholder: string;
  gruposUnicos: string[];
  selectedGrupo: string;
  setSelectedGrupo: (grupo: string) => void;
  materialesFiltrados: MaterialDisponible[];
  materialesApplied: boolean;
  isLoadingMateriales: boolean;
  selectedMaterialId: string;
  setSelectedMaterialId: (id: string) => void;
  materialSeleccionado: MaterialDisponible | null;
}

export const FormularioDestino = memo(function FormularioDestino({
  areas,
  catalogos,
  idAreaDestino,
  setIdAreaDestino,
  idCatalogoSolicitud,
  setIdCatalogoSolicitud,
  codigoCuentaPreview,
  codigoCuentaPlaceholder,
  gruposUnicos,
  selectedGrupo,
  setSelectedGrupo,
  materialesFiltrados,
  materialesApplied,
  isLoadingMateriales,
  selectedMaterialId,
  setSelectedMaterialId,
  materialSeleccionado,
}: FormularioDestinoProps) {
  const [openGrupo, setOpenGrupo] = useState(false);
  const [openMaterial, setOpenMaterial] = useState(false);
  const [searchGrupo, setSearchGrupo] = useState('');
  const [searchMaterial, setSearchMaterial] = useState('');

  const catalogoPlaceholder = !idAreaDestino
    ? 'Selecciona un área primero'
    : catalogos.length === 0
      ? 'Sin filtro de catálogo disponible'
      : 'Seleccionar catálogo';

  useEffect(() => {
    if (!openGrupo) {
      setSearchGrupo(selectedGrupo || '');
    }
  }, [openGrupo, selectedGrupo]);

  useEffect(() => {
    if (!openMaterial) {
      if (materialSeleccionado) {
        setSearchMaterial(`${materialSeleccionado.numeroArticulo} - ${materialSeleccionado.descripcionArticulo}`);
      } else {
        setSearchMaterial('');
      }
    }
  }, [openMaterial, materialSeleccionado]);

  const filteredGrupos = useMemo(() => {
    if (!searchGrupo) return gruposUnicos.slice(0, 500);
    const lowerSearch = searchGrupo.toLowerCase();
    return gruposUnicos.filter((grupo) => grupo.toLowerCase().includes(lowerSearch)).slice(0, 500);
  }, [gruposUnicos, searchGrupo]);

  const filteredMateriales = useMemo(() => {
    if (!searchMaterial) return materialesFiltrados.slice(0, 100);

    const searchLower = searchMaterial.toLowerCase();
    return materialesFiltrados.filter((material) =>
      material.numeroArticulo.toLowerCase().includes(searchLower) ||
      material.descripcionArticulo.toLowerCase().includes(searchLower)
    ).slice(0, 100);
  }, [materialesFiltrados, searchMaterial]);

  const requiereSeleccionGrupo = Boolean(idAreaDestino) && gruposUnicos.length > 0 && !selectedGrupo;
  const materialDisabled = !idAreaDestino || !selectedGrupo || isLoadingMateriales || materialesFiltrados.length === 0;

  const materialPlaceholder = !idAreaDestino
    ? 'Selecciona un área primero'
    : requiereSeleccionGrupo
      ? 'Selecciona un grupo primero'
      : isLoadingMateriales
        ? 'Cargando materiales permitidos...'
        : materialesFiltrados.length === 0
          ? materialesApplied
            ? 'Sin materiales permitidos por la cobertura'
            : 'Sin materiales disponibles en esta área'
          : 'Seleccionar material...';

  const grupoPlaceholder = !idAreaDestino
    ? 'Selecciona un área primero'
    : isLoadingMateriales
      ? 'Cargando grupos disponibles...'
      : gruposUnicos.length === 0
        ? materialesApplied
          ? 'Sin grupos permitidos por la cobertura'
          : 'Sin grupos disponibles en esta área'
        : gruposUnicos.length === 1
          ? gruposUnicos[0]
          : 'Seleccionar grupo...';

  const grupoDisabled = !idAreaDestino || isLoadingMateriales || gruposUnicos.length <= 1;

  useEffect(() => {
    if (materialDisabled && openMaterial) {
      setOpenMaterial(false);
    }
  }, [materialDisabled, openMaterial]);

  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-[0_18px_45px_-42px_rgba(15,23,42,0.45)]">
      <CardHeader className="border-b border-slate-100/90 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,0.95))] pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base sm:text-lg">Información de destino</CardTitle>
          <p className="text-sm text-slate-500">
            Define el contexto de la solicitud y filtra el material desde esta misma cabecera.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="space-y-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Contexto</span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Área destino</Label>
            <Select value={idAreaDestino} onValueChange={setIdAreaDestino} disabled={areas.length === 0}>
              <SelectTrigger className="h-10 bg-slate-50 border-slate-200 text-sm">
                <SelectValue placeholder={areas.length === 0 ? 'No tienes áreas permitidas' : 'Seleccionar área'} />
              </SelectTrigger>
              <SelectContent>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Catálogo</Label>
            <Select value={idCatalogoSolicitud} onValueChange={setIdCatalogoSolicitud} disabled={!idAreaDestino || catalogos.length === 0 || catalogos.length === 1}>
              <SelectTrigger className="h-10 bg-slate-50 border-slate-200 text-sm">
                <SelectValue placeholder={catalogoPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {catalogos.map((catalogo) => (
                  <SelectItem key={catalogo.id} value={String(catalogo.id)}>
                    {catalogo.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Código de cuenta</Label>
            <Input
              value={codigoCuentaPreview}
              readOnly
              placeholder={codigoCuentaPlaceholder}
              className="h-10 bg-slate-50 border-slate-200 text-sm"
            />
          </div>
        </div>

        </div>

        <div className="h-px bg-gradient-to-r from-slate-200 via-slate-100 to-transparent" />

        <div className="space-y-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Selección de material</span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Grupo de artículos</Label>
              <Popover open={openGrupo} onOpenChange={setOpenGrupo}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder={grupoPlaceholder}
                      value={searchGrupo}
                      disabled={grupoDisabled}
                      onChange={(e) => {
                        setSearchGrupo(e.target.value);
                        if (!openGrupo) setOpenGrupo(true);
                      }}
                      onClick={() => setOpenGrupo(true)}
                      className="h-10 border-slate-200 bg-slate-50 pl-9 pr-10 text-sm"
                    />
                    <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 opacity-50" />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[300px] overflow-y-auto"
                  align="start"
                  onOpenAutoFocus={(event: Event) => event.preventDefault()}
                >
                  <Command shouldFilter={false}>
                    <CommandList
                      className="overflow-y-scroll pr-1"
                      style={{ maxHeight: 260, scrollbarGutter: 'stable' }}
                    >
                      <CommandEmpty>No se encontraron grupos.</CommandEmpty>
                      <CommandGroup>
                        {filteredGrupos.map((grupo) => (
                          <CommandItem
                            key={grupo}
                            value={grupo}
                            onSelect={() => {
                              setSelectedGrupo(grupo === selectedGrupo ? '' : grupo);
                              setOpenGrupo(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4 flex-shrink-0',
                                selectedGrupo === grupo ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">{grupo}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Material {materialesFiltrados.length > 500 && '(Búsqueda recomendada)'}
              </Label>
              <Popover
                open={materialDisabled ? false : openMaterial}
                onOpenChange={(nextOpen) => {
                  if (!materialDisabled) {
                    setOpenMaterial(nextOpen);
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <div className={cn('relative', materialDisabled && 'cursor-not-allowed opacity-75')}>
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder={materialPlaceholder}
                      value={searchMaterial}
                      disabled={materialDisabled}
                      onChange={(e) => {
                        setSearchMaterial(e.target.value);
                        if (!openMaterial) setOpenMaterial(true);
                      }}
                      onClick={() => {
                        if (!materialDisabled) {
                          setOpenMaterial(true);
                        }
                      }}
                      className="h-10 border-slate-200 bg-slate-50 pl-9 pr-10 text-sm"
                    />
                    <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 opacity-50" />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0 max-w-[90vw]"
                  align="start"
                  onOpenAutoFocus={(event: Event) => event.preventDefault()}
                >
                  <Command shouldFilter={false}>
                    <CommandList className="overflow-y-scroll pr-1" style={{ maxHeight: 260 }}>
                      <CommandEmpty>No se encontraron materiales.</CommandEmpty>
                      <CommandGroup>
                        {filteredMateriales.map((material) => (
                          <CommandItem
                            key={material.idMaterial}
                            value={String(material.idMaterial)}
                            onSelect={() => {
                              setSelectedMaterialId(String(material.idMaterial));
                              setOpenMaterial(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4 flex-shrink-0 text-blue-600',
                                selectedMaterialId === String(material.idMaterial) ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <div className="flex flex-col truncate">
                              <span className="truncate font-medium text-slate-800">{material.descripcionArticulo}</span>
                              <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{material.numeroArticulo}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});