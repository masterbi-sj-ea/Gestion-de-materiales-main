import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Search, RefreshCw, Download, ArrowUpRight, ArrowDownLeft, History, FileText, Calendar as CalendarIcon, X, Printer } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from './ui/utils';
import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';

import { Skeleton } from './ui/skeleton';
import { Badge } from './ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { API_ORIGIN } from '../services/apiConfig';

const API_BASE = API_ORIGIN;

interface MovimientoInventario {
  IdMovimiento: number;
  DescripcionArticulo: string;
  TipoMovimiento: string;
  Cantidad: number;
  StockAnterior: number;
  StockNuevo: number;
  FechaMovimiento: string;
  IdUsuario: number | null;
  NombreUsuario: string | null;
  Referencia: string | null;
  NumeroArticulo: string;
  CodigoCuenta: string | null;
  AreaDestino: string | null;
}

export function KardexPage() {
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroArticulo, setFiltroArticulo] = useState('');
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(undefined);
  const [fechaFin, setFechaFin] = useState<Date | undefined>(undefined);
  const componentRef = useRef<HTMLDivElement>(null);

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{part}</mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Reporte_Kardex_${format(new Date(), "dd-MM-yyyy")}`,
  });

  const fetchMovimientos = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('authToken');
      const params = new URLSearchParams();

      if (filtroTipo !== 'TODOS') params.append('tipoMovimiento', filtroTipo);
      if (fechaInicio) params.append('fechaInicio', format(fechaInicio, 'yyyy-MM-dd'));
      if (fechaFin) params.append('fechaFin', format(fechaFin, 'yyyy-MM-dd'));

      const res = await fetch(`${API_BASE}/api/kardex?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMovimientos(data);
      }
    } catch (error) {
      console.error('Error fetching kardex:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovimientos();
  }, [filtroTipo, fechaInicio, fechaFin]);

  const movimientosFiltrados = movimientos.filter(m =>
    m.NumeroArticulo.toLowerCase().includes(filtroArticulo.toLowerCase()) ||
    m.DescripcionArticulo.toLowerCase().includes(filtroArticulo.toLowerCase())
  );

  const stats = {
    entradas: movimientosFiltrados.filter(m => m.TipoMovimiento === 'ENTRADA').reduce((acc, m) => acc + m.Cantidad, 0),
    salidas: movimientosFiltrados.filter(m => m.TipoMovimiento === 'SALIDA').reduce((acc, m) => acc + Math.abs(m.Cantidad), 0),
    totalItems: movimientosFiltrados.length
  };

  const exportToCSV = () => {
    const headers = ["Fecha", "Artículo", "Descripción", "Área Destino", "Cuenta", "Tipo", "Cantidad", "Stock Anterior", "Stock Nuevo", "Usuario", "Referencia"];
    const rows = movimientosFiltrados.map(m => [
      format(new Date(m.FechaMovimiento), "yyyy-MM-dd HH:mm"),
      m.NumeroArticulo,
      m.DescripcionArticulo,
      m.AreaDestino || '',
      m.CodigoCuenta || '',
      m.TipoMovimiento,
      m.Cantidad,
      m.StockAnterior,
      m.StockNuevo,
      m.NombreUsuario || 'Sistema',
      m.Referencia || ''
    ]);

    const content = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `kardex_${format(new Date(), "yyyyMMdd")}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Kardex de Inventario</h1>
          <p className="text-sm md:text-base text-gray-500">Consulta y auditoría de movimientos de materiales</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button onClick={handlePrint} variant="outline" size="sm" className="flex-1 sm:flex-none items-center gap-2 border-gray-300">
            <Printer className="h-4 w-4" />
            <span className="hidden xs:inline">Imprimir</span>
          </Button>
          <Button onClick={exportToCSV} variant="outline" size="sm" className="flex-1 sm:flex-none items-center gap-2 border-green-600 text-green-700 hover:bg-green-50">
            <Download className="h-4 w-4" />
            <span className="hidden xs:inline">Exportar CSV</span>
          </Button>
          <Button onClick={fetchMovimientos} variant="default" size="sm" className="flex-1 sm:flex-none items-center gap-2 bg-blue-600 hover:bg-blue-700">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">Sincronizar</span>
          </Button>
        </div>
      </div>

      {/* Resumen de Movimientos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-white border-l-4 border-l-blue-500 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Movimientos</p>
              <h3 className="text-2xl font-bold">{stats.totalItems}</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-full">
              <History className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-l-4 border-l-green-500 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Entradas Totales</p>
              <h3 className="text-2xl font-bold text-green-600">+{stats.entradas}</h3>
            </div>
            <div className="p-3 bg-green-50 rounded-full">
              <ArrowUpRight className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-l-4 border-l-red-500 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Salidas Totales</p>
              <h3 className="text-2xl font-bold text-red-600">-{stats.salidas}</h3>
            </div>
            <div className="p-3 bg-red-50 rounded-full">
              <ArrowDownLeft className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 shadow-inner space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
          {/* Buscador Principal */}
          <div className="flex-1 min-w-0 relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors z-10 pointer-events-none" />
            <Input
              placeholder="Buscar por código, descripción o referencia..."
              value={filtroArticulo}
              onChange={(e) => setFiltroArticulo(e.target.value)}
              className="!pl-11 h-11 bg-white border-slate-200 focus:ring-4 focus:ring-blue-500/10 shadow-sm transition-all text-sm rounded-lg relative w-full"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm w-full sm:w-auto">
              {/* Selector de Fecha Inicio */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"ghost"}
                    className={cn(
                      "flex-1 sm:w-[140px] justify-start text-xs font-semibold hover:bg-slate-100",
                      !fechaInicio && "text-slate-400"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-blue-500" />
                    {fechaInicio ? format(fechaInicio, "dd MMM, yy") : <span>Desde</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaInicio}
                    onSelect={setFechaInicio}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>

              <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

              {/* Selector de Fecha Fin */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"ghost"}
                    className={cn(
                      "flex-1 sm:w-[140px] justify-start text-xs font-semibold hover:bg-slate-100",
                      !fechaFin && "text-slate-400"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-rose-500" />
                    {fechaFin ? format(fechaFin, "dd MMM, yy") : <span>Hasta</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaFin}
                    onSelect={setFechaFin}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="w-full sm:w-[200px]">
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="h-11 bg-white border-slate-200 text-xs font-bold shadow-sm rounded-lg">
                  <SelectValue placeholder="Tipo de Movimiento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS" className="text-xs">Todos los tipos</SelectItem>
                  <SelectItem value="ENTRADA" className="text-xs">⚡ Solo Entradas</SelectItem>
                  <SelectItem value="SALIDA" className="text-xs">📦 Solo Salidas</SelectItem>
                  <SelectItem value="AJUSTE" className="text-xs">🔧 Solo Ajustes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Chips de Filtros Activos */}
      {(filtroTipo !== 'TODOS' || fechaInicio || fechaFin || filtroArticulo) && (
        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
          <span className="text-xs font-semibold text-gray-500 self-center mr-1">Filtros activos:</span>
          {filtroArticulo && (
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1 flex gap-2 items-center">
              Búsqueda: {filtroArticulo}
              <X className="h-3 w-3 cursor-pointer hover:text-blue-900" onClick={() => setFiltroArticulo('')} />
            </Badge>
          )}
          {filtroTipo !== 'TODOS' && (
            <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 px-3 py-1 flex gap-2 items-center">
              Tipo: {filtroTipo}
              <X className="h-3 w-3 cursor-pointer hover:text-amber-900" onClick={() => setFiltroTipo('TODOS')} />
            </Badge>
          )}
          {fechaInicio && (
            <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-100 px-3 py-1 flex gap-2 items-center">
              Desde: {format(fechaInicio, "dd/MM/yyyy")}
              <X className="h-3 w-3 cursor-pointer hover:text-green-900" onClick={() => setFechaInicio(undefined)} />
            </Badge>
          )}
          {fechaFin && (
            <Badge variant="secondary" className="bg-rose-50 text-rose-700 border-rose-100 px-3 py-1 flex gap-2 items-center">
              Hasta: {format(fechaFin, "dd/MM/yyyy")}
              <X className="h-3 w-3 cursor-pointer hover:text-rose-900" onClick={() => setFechaFin(undefined)} />
            </Badge>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => { setFechaInicio(undefined); setFechaFin(undefined); setFiltroTipo('TODOS'); setFiltroArticulo(''); }}
            className="text-[10px] uppercase font-bold text-gray-400 hover:text-red-500 p-0 h-auto"
          >
            Limpiar todo
          </Button>
        </div>
      )}

      <Card className="shadow-md border-gray-100 overflow-hidden" ref={componentRef}>
        <style>{`
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; }
              .shadow-md { border: 1px solid #eee; }
            }
          `}</style>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="min-w-[120px]">Fecha</TableHead>
                  <TableHead className="min-w-[200px]">Producto</TableHead>
                  <TableHead className="min-w-[150px]">Área / Cuenta</TableHead>
                  <TableHead className="min-w-[100px]">Tipo</TableHead>
                  <TableHead className="text-right min-w-[100px]">Cantidad</TableHead>
                  <TableHead className="text-right min-w-[100px]">Balance</TableHead>
                  <TableHead className="min-w-[180px]">Usuario / Referencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </TableCell>
                      <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-20" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : movimientosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-24 bg-gray-50/20">
                      <div className="flex flex-col items-center gap-4 max-w-[400px] mx-auto">
                        <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                          <Search className="h-10 w-10 text-blue-200" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-lg font-bold text-gray-900">No se encontraron movimientos</p>
                          <p className="text-sm text-gray-500">
                            No hay registros que coincidan con los filtros actuales. Intenta ajustar las fechas o el término de búsqueda.
                          </p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => { setFechaInicio(undefined); setFechaFin(undefined); setFiltroTipo('TODOS'); setFiltroArticulo(''); }}
                          className="mt-2"
                        >
                          Restablecer todos los filtros
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  movimientosFiltrados.map((mov) => (
                    <TableRow 
                      key={mov.IdMovimiento} 
                      className="hover:bg-blue-50/50 transition-colors group"
                    >
                      <TableCell className="whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">
                          {format(new Date(mov.FechaMovimiento), "dd MMM, yyyy", { locale: es })}
                        </div>
                        <div className="text-[10px] text-gray-500 font-medium">
                          {format(new Date(mov.FechaMovimiento), "HH:mm 'hrs'")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-800 text-sm">{highlightText(mov.NumeroArticulo, filtroArticulo)}</span>
                          <span className="text-[11px] text-gray-500 truncate max-w-[200px]">{highlightText(mov.DescripcionArticulo, filtroArticulo)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-fit ${mov.AreaDestino ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                            {mov.AreaDestino || 'SIN ÁREA'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {mov.CodigoCuenta || '00000000'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className={cn(
                            "h-2 w-2 rounded-full",
                            mov.TipoMovimiento === 'ENTRADA' ? 'bg-emerald-500' : 
                            mov.TipoMovimiento === 'SALIDA' ? 'bg-rose-500' : 'bg-amber-500'
                          )} />
                          <span className={cn(
                            "text-[10px] font-black tracking-widest uppercase",
                            mov.TipoMovimiento === 'ENTRADA' ? 'text-emerald-700' : 
                            mov.TipoMovimiento === 'SALIDA' ? 'text-rose-700' : 'text-amber-700'
                          )}>
                            {mov.TipoMovimiento}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`text-sm font-black ${mov.Cantidad > 0 ? 'text-emerald-600' : mov.Cantidad < 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                          {mov.Cantidad > 0 ? '+' : ''}{mov.Cantidad}
                          <span className="text-[9px] text-gray-400 ml-1 font-normal uppercase italic">und</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-black text-gray-700">{mov.StockNuevo}</span>
                          <span className="text-[9px] text-gray-400 italic">Ant: {mov.StockAnterior}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-tight">{mov.NombreUsuario || 'SISTEMA'}</span>
                          <div className="flex items-center gap-1">
                            <FileText className="h-3 w-3 text-blue-500" />
                            <span className="text-xs text-blue-600 font-bold hover:underline cursor-pointer decoration-2 underline-offset-2">
                              {highlightText(mov.Referencia || '', filtroArticulo)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
