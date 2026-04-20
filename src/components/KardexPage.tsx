import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './ui/pagination';
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
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  TipoMovimiento: string;
  OrigenMovimiento: string;
  Cantidad: number;
  StockAnterior: number;
  StockNuevo: number;
  FechaMovimiento: string;
  IdUsuario: number | null;
  NombreUsuario: string | null;
  Referencia: string | null;
  CodigoCuenta: string | null;
  AreaDestino: string | null;
  TotalRows?: number;
}

const normalizeUpper = (value: string | null | undefined) => String(value ?? '').trim().toUpperCase();

const getTipoClasses = (tipo: string) => {
  switch (normalizeUpper(tipo)) {
    case 'ENTRADA':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'SALIDA':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

const getOrigenClasses = (origen: string) => {
  switch (normalizeUpper(origen)) {
    case 'DESPACHO':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'DEVOLUCION':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ANULACION_DEVOLUCION':
      return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
    case 'AJUSTE_CORTE':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

function getPaginationItems(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 3) {
    return [1, 2, 3, 4, 'ellipsis', totalPages];
  }

  if (page >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages];
}

export function KardexPage() {
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroOrigen, setFiltroOrigen] = useState<string>('TODOS');
  const [filtroArticulo, setFiltroArticulo] = useState('');
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(undefined);
  const [fechaFin, setFechaFin] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRows, setTotalRows] = useState(0);
  const componentRef = useRef<HTMLDivElement>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const safe = escapeRegExp(highlight);
    const parts = text.split(new RegExp(`(${safe})`, 'gi'));
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
      if (filtroOrigen !== 'TODOS') params.append('origenMovimiento', filtroOrigen);
      if (fechaInicio) params.append('fechaInicio', format(fechaInicio, 'yyyy-MM-dd'));
      if (fechaFin) params.append('fechaFin', format(fechaFin, 'yyyy-MM-dd'));
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
      params.append('page', String(page));
      params.append('limit', String(pageSize));

      const res = await fetch(`${API_BASE}/api/kardex?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        setMovimientos(rows);
        setTotalRows((current) => {
          const reportedTotal = Number(rows[0]?.TotalRows);
          if (Number.isFinite(reportedTotal) && reportedTotal >= 0) {
            return reportedTotal;
          }

          return page === 1 ? rows.length : current;
        });
      }
    } catch (error) {
      console.error('Error fetching kardex:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovimientos();
  }, [page, pageSize, filtroTipo, filtroOrigen, fechaInicio, fechaFin, debouncedSearch]);

  // Debounce del buscador para no golpear el backend en cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(filtroArticulo);
    }, 300);
    return () => window.clearTimeout(t);
  }, [filtroArticulo]);

  // Con Search en backend, normalmente ya llega filtrado; este filtro queda como “refuerzo”.
  const movimientosFiltrados = movimientos.filter(m => {
    const q = filtroArticulo.trim().toLowerCase();
    if (!q) return true;
    return (
      m.NumeroArticulo.toLowerCase().includes(q) ||
      m.DescripcionArticulo.toLowerCase().includes(q) ||
      (m.Referencia || '').toLowerCase().includes(q) ||
      (m.AreaDestino || '').toLowerCase().includes(q)
    );
  });

  const stats = {
    entradas: movimientosFiltrados
      .filter((m) => normalizeUpper(m.TipoMovimiento) === 'ENTRADA')
      .reduce((acc, m) => acc + Number(m.Cantidad || 0), 0),
    salidas: movimientosFiltrados
      .filter((m) => normalizeUpper(m.TipoMovimiento) === 'SALIDA')
      .reduce((acc, m) => acc + Math.abs(Number(m.Cantidad || 0)), 0),
    ajustesCorte: movimientosFiltrados
      .filter((m) => normalizeUpper(m.OrigenMovimiento) === 'AJUSTE_CORTE').length,
    devoluciones: movimientosFiltrados
      .filter((m) => normalizeUpper(m.OrigenMovimiento) === 'DEVOLUCION').length,
    despachos: movimientosFiltrados
      .filter((m) => normalizeUpper(m.OrigenMovimiento) === 'DESPACHO').length,
    totalItems: totalRows,
  };

  const exportToCSV = () => {
    const csvEscape = (value: unknown) => {
      const str = String(value ?? '');
      const needsQuotes = /[\n\r",]/.test(str);
      const escaped = str.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const headers = ["Fecha", "Artículo", "Descripción", "Área Destino", "Cuenta", "Tipo", "Origen", "Cantidad", "Stock Anterior", "Stock Nuevo", "Usuario", "Referencia"];
    const rows = movimientosFiltrados.map(m => [
      format(new Date(m.FechaMovimiento), "yyyy-MM-dd HH:mm"),
      m.NumeroArticulo,
      m.DescripcionArticulo,
      m.AreaDestino || '',
      m.CodigoCuenta || '',
      m.TipoMovimiento,
      m.OrigenMovimiento || '',
      m.Cantidad,
      m.StockAnterior,
      m.StockNuevo,
      m.NombreUsuario || 'Sistema',
      m.Referencia || ''
    ]);

    const content = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join("\n");
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

  const applyQuickFilter = (value: string) => {
    const next = String(value || '').trim();
    if (!next) return;
    setPage(1);
    setFiltroArticulo(next);
  };

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const startItem = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = totalRows === 0 ? 0 : startItem + movimientos.length - 1;

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

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</span>
                <History className="h-4 w-4 text-slate-500" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.totalItems}</div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Entradas</span>
                <ArrowUpRight className="h-4 w-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-700">+{stats.entradas}</div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Salidas</span>
                <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700">-{stats.salidas}</div>
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Ajustes</span>
                <FileText className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-indigo-700">{stats.ajustesCorte}</div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Devoluciones</span>
                <RefreshCw className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-amber-700">{stats.devoluciones}</div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Despachos</span>
                <Download className="h-4 w-4 text-sky-600" />
              </div>
              <div className="text-2xl font-bold text-sky-700">{stats.despachos}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 shadow-inner space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
          {/* Buscador Principal */}
          <div className="flex-1 min-w-0 relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors z-10 pointer-events-none" />
            <Input
              placeholder="Buscar por código, descripción o referencia..."
              value={filtroArticulo}
              onChange={(e) => {
                setPage(1);
                setFiltroArticulo(e.target.value);
              }}
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
                    onSelect={(value: Date | undefined) => {
                      setPage(1);
                      setFechaInicio(value);
                    }}
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
                    onSelect={(value: Date | undefined) => {
                      setPage(1);
                      setFechaFin(value);
                    }}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
              <div className="w-full sm:w-[200px]">
                <Select value={filtroTipo} onValueChange={(value: string) => {
                  setPage(1);
                  setFiltroTipo(value);
                }}>
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

              <div className="w-full sm:w-[220px]">
                <Select value={filtroOrigen} onValueChange={(value: string) => {
                  setPage(1);
                  setFiltroOrigen(value);
                }}>
                  <SelectTrigger className="h-11 bg-white border-slate-200 text-xs font-bold shadow-sm rounded-lg">
                    <SelectValue placeholder="Origen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS" className="text-xs">Todos los orígenes</SelectItem>
                    <SelectItem value="DESPACHO" className="text-xs">Despacho</SelectItem>
                    <SelectItem value="DEVOLUCION" className="text-xs">Devolución</SelectItem>
                    <SelectItem value="ANULACION_DEVOLUCION" className="text-xs">Anulación devolución</SelectItem>
                    <SelectItem value="AJUSTE_CORTE" className="text-xs">Ajuste corte</SelectItem>
                    <SelectItem value="OTRO" className="text-xs">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chips de Filtros Activos */}
      {(filtroTipo !== 'TODOS' || filtroOrigen !== 'TODOS' || fechaInicio || fechaFin || filtroArticulo) && (
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
          {filtroOrigen !== 'TODOS' && (
            <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100 px-3 py-1 flex gap-2 items-center">
              Origen: {filtroOrigen}
              <X className="h-3 w-3 cursor-pointer hover:text-indigo-900" onClick={() => setFiltroOrigen('TODOS')} />
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
            onClick={() => { setPage(1); setFechaInicio(undefined); setFechaFin(undefined); setFiltroTipo('TODOS'); setFiltroOrigen('TODOS'); setFiltroArticulo(''); }}
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
                  <TableHead className="min-w-[140px]">Tipo / Origen</TableHead>
                  <TableHead className="text-right min-w-[100px]">Cantidad</TableHead>
                  <TableHead className="text-right min-w-[100px]">Balance</TableHead>
                  <TableHead className="min-w-[160px]">Usuario</TableHead>
                  <TableHead className="min-w-[220px]">Referencia</TableHead>
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
                      <TableCell>
                        <Skeleton className="h-6 w-20 rounded-full mb-2" />
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </TableCell>
                      <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 mb-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : movimientosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-24 bg-gray-50/20">
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
                          onClick={() => { setPage(1); setFechaInicio(undefined); setFechaFin(undefined); setFiltroTipo('TODOS'); setFiltroOrigen('TODOS'); setFiltroArticulo(''); }}
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
                          <button
                            type="button"
                            onClick={() => applyQuickFilter(mov.NumeroArticulo)}
                            className="font-bold text-gray-800 text-sm text-left hover:underline"
                            title="Filtrar por este código"
                          >
                            {highlightText(mov.NumeroArticulo, filtroArticulo)}
                          </button>
                          <span className="text-[11px] text-gray-500 truncate max-w-[200px]">{highlightText(mov.DescripcionArticulo, filtroArticulo)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => applyQuickFilter(mov.AreaDestino || '')}
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-fit text-left hover:underline ${mov.AreaDestino ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'}`}
                            title="Filtrar por área"
                          >
                            {mov.AreaDestino || 'SIN ÁREA'}
                          </button>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {mov.CodigoCuenta || '00000000'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className={getTipoClasses(mov.TipoMovimiento)}>
                            {mov.TipoMovimiento}
                          </Badge>
                          <Badge variant="outline" className={getOrigenClasses(mov.OrigenMovimiento || 'OTRO')}>
                            {mov.OrigenMovimiento || 'OTRO'}
                          </Badge>
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
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="text-xs font-mono break-words text-slate-700">
                          {mov.Referencia || '—'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="no-print flex flex-col gap-3 border-t border-slate-200/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {startItem}-{endItem} de {totalRows}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Filas</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value: string) => {
                    setPage(1);
                    setPageSize(Number(value));
                  }}
                >
                  <SelectTrigger className="h-8 w-[90px] bg-white text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {totalPages > 1 && (
              <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page > 1) {
                          setPage(page - 1);
                        }
                      }}
                    />
                  </PaginationItem>

                  {getPaginationItems(page, totalPages).map((item, index) => (
                    <PaginationItem key={`${item}-${index}`}>
                      {item === 'ellipsis' ? (
                        <PaginationEllipsis />
                      ) : (
                        <PaginationLink
                          href="#"
                          isActive={item === page}
                          onClick={(event) => {
                            event.preventDefault();
                            setPage(item);
                          }}
                        >
                          {item}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page < totalPages) {
                          setPage(page + 1);
                        }
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
