const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'components', 'DespachoPage.tsx');

const content = fs.readFileSync(targetFile, 'utf8');
const lines = content.split('\n');

const startTag = '{/* Modal de Despacho */}';
const endTag = '    </div>';

let startIdx = lines.findIndex(l => l.includes(startTag));
let endIdx = -1;

// Find the closure of the component
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i] === '  );') {
    endIdx = i;
    break;
  }
}

if (startIdx !== -1 && endIdx !== -1) {
  const newModal = `      {/* Modal de Despacho */}
      <Dialog
        open={!!selectedSolicitud || modalLoading}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedSolicitud(null);
            setEditedItems({});
            setObservacionesDespacho('');
            setSelectedDetalleId(null);
            setItemSearch('');
          }
        }}
      >
        <DialogContent className="max-w-[1200px] w-[95vw] h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 sm:rounded-[2rem] border border-slate-200/50 shadow-2xl">
          {modalLoading && !selectedSolicitud && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-500 animate-pulse">Cargando la solicitud...</p>
            </div>
          )}

          {selectedSolicitud && (
            <>
              {/* Header Premium Fijo */}
              <div className="bg-white px-5 sm:px-8 py-5 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
                <div>
                  <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    Despacho de Materiales
                    <Badge variant={selectedSolicitud.cabecera.Estado === 'APROBADA' ? 'default' : 'secondary'} className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1">
                      {selectedSolicitud.cabecera.Estado}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-slate-700 bg-slate-100/80 px-2.5 py-1 rounded-md border border-slate-200/60 shadow-sm">
                      {selectedSolicitud.cabecera.CodigoSolicitud}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-600 font-semibold bg-white border border-slate-200/60 px-2.5 py-1 rounded-md shadow-sm">
                      {(selectedSolicitud.cabecera.AreaNombre || '').split(' - ').pop()?.trim() || selectedSolicitud.cabecera.AreaNombre}
                    </span>
                  </DialogDescription>
                </div>
                
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-right bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Solicitante</span>
                    <span className="text-sm font-bold text-slate-800">{selectedSolicitud.cabecera.NombreSolicitante}</span>
                  </div>
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</span>
                    <span className="text-sm font-bold text-slate-800">{new Date(selectedSolicitud.cabecera.FechaSolicitud).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Área Central Split (Izquierda lista, Derecha Detalle) */}
              <div className="flex-1 flex overflow-hidden min-h-0 relative">
                
                {/* Panel Izquierdo: Lista de Materiales */}
                <div className="w-full sm:w-[320px] lg:w-[380px] bg-slate-50/50 border-r border-slate-200/60 flex flex-col shrink-0">
                  <div className="p-4 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm z-10 sticky top-0">
                    <div className="relative group">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
                      <input
                        type="text"
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="Buscar por código o material..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all shadow-sm placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 scroll-smooth"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (!selectedSolicitud) return;
                      const detalle = selectedSolicitud.detalle;
                      const filtered = detalle.filter((item) => {
                        const term = itemSearch.toLowerCase().trim();
                        if (!term) return true;
                        return (
                          item.Codigo.toLowerCase().includes(term) ||
                          item.Descripcion.toLowerCase().includes(term)
                        );
                      });
                      const currentIndex = filtered.findIndex((d) => d.IdDetalleSolicitud === selectedDetalleId);
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, filtered.length - 1);
                        const target = filtered[next];
                        if (target) setSelectedDetalleId(target.IdDetalleSolicitud);
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
                        const target = filtered[prev];
                        if (target) setSelectedDetalleId(target.IdDetalleSolicitud);
                      }
                    }}
                  >
                    {selectedSolicitud.detalle
                      .filter((item) => {
                        const term = itemSearch.toLowerCase().trim();
                        if (!term) return true;
                        return (
                          item.Codigo.toLowerCase().includes(term) ||
                          item.Descripcion.toLowerCase().includes(term)
                        );
                      })
                      .map((item) => {
                        const cantidadADespachar = editedItems[item.IdDetalleSolicitud] || 0;
                        const { label, tone } = getItemEstado(item);
                        const isSelected = item.IdDetalleSolicitud === selectedDetalleId;

                        const toneIndicator =
                          tone === 'error' ? 'bg-red-500' :
                          tone === 'success' ? 'bg-emerald-500' :
                          tone === 'warning' ? 'bg-amber-500' : 'bg-slate-300';

                        return (
                          <button
                            key={item.IdDetalleSolicitud}
                            onClick={() => setSelectedDetalleId(item.IdDetalleSolicitud)}
                            className={\`w-full group flex flex-col text-left p-3.5 rounded-2xl transition-all duration-200 border \${
                              isSelected 
                                ? 'bg-white border-slate-300 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] ring-1 ring-slate-900/5 translate-x-1' 
                                : 'bg-transparent border-transparent hover:bg-white/80 hover:border-slate-200 hover:shadow-sm'
                            }\`}
                          >
                            <div className="flex items-start justify-between gap-2 w-full mb-1.5">
                              <div className="flex gap-2 items-center flex-1 min-w-0">
                                <div className={\`w-2 h-2 rounded-full shrink-0 \${toneIndicator} shadow-sm\`} />
                                <span className={\`font-mono text-[11px] shrink-0 tracking-tight \${isSelected ? 'text-slate-900 font-bold' : 'text-slate-500 group-hover:text-slate-700 font-semibold'}\`}>
                                  {item.Codigo}
                                </span>
                              </div>
                              <span className={\`shrink-0 text-[9px] uppercase tracking-widest font-black px-2 py-0.5 rounded-full border \${
                                tone === 'success' ? 'text-emerald-700 bg-emerald-50 border-emerald-200/50' : 
                                tone === 'error' ? 'text-red-700 bg-red-50 border-red-200/50' : 
                                tone === 'warning' ? 'text-amber-700 bg-amber-50 border-amber-200/50' : 'text-slate-600 bg-slate-100 border-slate-200'
                              }\`}>
                                {label}
                              </span>
                            </div>
                            <p className={\`text-xs leading-relaxed line-clamp-2 w-full \${isSelected ? 'font-bold text-slate-900' : 'font-semibold text-slate-600 group-hover:text-slate-900'}\`}>
                              {item.Descripcion}
                            </p>
                            <div className="mt-3 flex w-full flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-slate-500 bg-slate-100/50 p-2 rounded-xl border border-slate-100">
                              <span className="flex-1 flex justify-between items-center">
                                <span className="font-medium uppercase tracking-wider text-[9px]">Sol</span> <strong className="text-slate-900 text-xs font-black">{item.CantidadSolicitada}</strong>
                              </span>
                              <span className="flex-1 flex justify-between items-center">
                                <span className="font-medium uppercase tracking-wider text-[9px]">Stock</span> <strong className="text-slate-900 text-xs font-black">{item.EnStock}</strong>
                              </span>
                              <span className="flex-1 flex justify-between items-center border-l border-slate-200 pl-2">
                                <span className="font-medium uppercase tracking-wider text-[9px]">Desp</span> <strong className={\`text-xs font-black \${tone === 'error' ? 'text-red-600' : 'text-emerald-600'}\`}>{cantidadADespachar}</strong>
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Panel Derecho: Detalle del Material Seleccionado */}
                <div className="flex-1 flex flex-col bg-slate-50/30 overflow-y-auto relative bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)]">
                  {(() => {
                      const detalle = selectedSolicitud.detalle;
                      const current = detalle.find((d) => d.IdDetalleSolicitud === selectedDetalleId) || detalle[0];
                      
                      if (!current) {
                        return (
                          <div className="flex-1 flex items-center justify-center p-8 absolute inset-0 z-10 bg-slate-50/50 backdrop-blur-sm">
                            <div className="text-center space-y-4 opacity-60">
                              <Package className="w-20 h-20 mx-auto text-slate-300 drop-shadow-sm" />
                              <p className="text-lg font-semibold text-slate-500 tracking-tight">Selecciona un material de la lista</p>
                            </div>
                          </div>
                        );
                      }

                      const isAprobada = selectedSolicitud.cabecera.Estado === 'APROBADA';
                      const cantidadADespachar = editedItems[current.IdDetalleSolicitud] || 0;
                      const maxPermitido = Math.min(current.CantidadSolicitada, current.EnStock);
                      const { label, tone } = getItemEstado(current);
                      const codigoCuenta = resolveCodigoCuentaSolicitud(selectedSolicitud.cabecera);

                      return (
                        <div className="p-5 sm:p-10 space-y-8 max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out relative z-10">
                          {/* Item Header */}
                          <div>
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                              <div className="bg-slate-900 text-white font-mono text-sm font-bold px-3 py-1.5 rounded-lg shadow-sm">
                                {current.Codigo}
                              </div>
                              <Badge variant="outline" className="text-xs text-slate-600 font-bold bg-white border-slate-200/80 shadow-sm px-2.5 py-1">
                                {current.UnidadMedida || 'U/M'}
                              </Badge>
                              <div className={\`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm \${
                                  tone === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : 
                                  tone === 'success' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 
                                  tone === 'warning' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 
                                  'bg-slate-100 text-slate-600 border border-slate-200'
                                }\`}>
                                {label}
                              </div>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-[1.15] tracking-tight">
                              {current.Descripcion}
                            </h2>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white border border-slate-200/80 rounded-[1.5rem] p-5 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-slate-100 to-transparent opacity-50 rounded-bl-full -z-10" />
                              <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 group-hover:text-slate-500 transition-colors">Solicitado</p>
                              <p className="text-4xl font-black text-slate-800 tracking-tight">{current.CantidadSolicitada}</p>
                            </div>
                            <div className="bg-white border border-slate-200/80 rounded-[1.5rem] p-5 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                               <div className={\`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-slate-100 to-transparent opacity-50 rounded-bl-full -z-10 \${current.EnStock === 0 ? 'from-red-100' : ''}\`} />
                              <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 group-hover:text-slate-500 transition-colors">Stock Actual</p>
                              <p className={\`text-4xl font-black tracking-tight \${current.EnStock === 0 ? 'text-red-500' : 'text-slate-800'}\`}>
                                {current.EnStock}
                              </p>
                            </div>
                            <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-[1.5rem] p-5 shadow-sm col-span-2 sm:col-span-2 flex flex-col justify-center">
                              <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2">Código de Cuenta</p>
                              <p className="text-xl font-bold text-slate-700 break-words tracking-tight">{codigoCuenta || '-'}</p>
                            </div>
                          </div>

                          {/* Control de Cantidad */}
                          <div className={\`bg-white rounded-[2rem] p-6 sm:p-auto sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 transition-all relative overflow-hidden \${
                            isAprobada ? 'hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:ring-slate-900/10' : 'opacity-70'
                          }\`}>
                            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-slate-50/50 to-transparent pointer-events-none" />
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-8 relative z-10">
                              <div className="w-full sm:w-1/2">
                                <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">Cantidad a Despachar</h3>
                                <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-xs">
                                  Ingresa la cantidad que vas a entregar. No puede exceder lo solicitado ({current.CantidadSolicitada}) ni el stock ({current.EnStock}).
                                </p>
                                
                                <div className="flex flex-wrap gap-2.5 mt-5">
                                  <Button type="button" variant="secondary" size="sm" className="font-bold text-xs rounded-xl shadow-sm" disabled={!isAprobada} 
                                    onClick={() => handleCantidadChange(current.IdDetalleSolicitud, '0')}>
                                    Limpiar a 0
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" className="font-bold text-xs rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 shadow-sm" disabled={!isAprobada}
                                    onClick={() => handleCantidadChange(current.IdDetalleSolicitud, String(current.CantidadSolicitada))}>
                                    Aplicar {current.CantidadSolicitada} (Sol)
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" className="font-bold text-xs rounded-xl shadow-sm" disabled={!isAprobada}
                                    onClick={() => handleCantidadChange(current.IdDetalleSolicitud, String(maxPermitido))}>
                                    Máximo ({maxPermitido})
                                  </Button>
                                </div>
                              </div>
                              
                              <div className="w-full sm:w-1/2 flex justify-center sm:justify-end shrink-0">
                                <div className="relative group">
                                  <div className="absolute -inset-1 bg-gradient-to-r from-slate-200 to-slate-100 rounded-[2.5rem] blur-md opacity-50 group-hover:opacity-100 transition duration-500"></div>
                                  <input
                                    type="number"
                                    min="0"
                                    max={maxPermitido}
                                    value={cantidadADespachar}
                                    onChange={(e) => handleCantidadChange(current.IdDetalleSolicitud, e.target.value)}
                                    onBlur={(e) => {
                                      const val = parseInt(e.target.value);
                                      const clamped = isNaN(val) ? 0 : Math.max(0, Math.min(maxPermitido, val));
                                      handleCantidadChange(current.IdDetalleSolicitud, clamped.toString());
                                    }}
                                    disabled={!isAprobada}
                                    className="relative w-32 h-24 sm:w-56 sm:h-36 bg-white focus:bg-white text-5xl sm:text-7xl text-center font-black tracking-tighter text-slate-900 border-2 border-slate-200/80 focus:border-slate-900 rounded-[2rem] focus:ring-4 focus:ring-slate-900/10 shadow-sm transition-all outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Notas */}
                          <div className="bg-white rounded-[1.5rem] p-6 border border-slate-200/80 shadow-sm relative overflow-hidden">
                            <Label htmlFor="observaciones" className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-3 block">
                              Observaciones y Notas
                            </Label>
                            <Textarea
                              id="observaciones"
                              placeholder="Ingresa notas, condiciones de entrega, o responsable del retiro."
                              value={observacionesDespacho}
                              onChange={(e) => setObservacionesDespacho(e.target.value)}
                              rows={2}
                              disabled={selectedSolicitud.cabecera.Estado !== 'APROBADA'}
                              className="text-sm font-medium border-slate-200 bg-slate-50 focus:bg-white rounded-xl shadow-inner focus-visible:ring-2 focus-visible:ring-slate-900/20 focus-visible:border-slate-900 transition-all resize-none"
                            />
                          </div>

                        </div>
                      );
                  })()}
                </div>
              </div>

              {/* Contenedor del Footer */}
              <div className="z-20 flex flex-col shrink-0 bg-white">
                {/* Banner de alertas dinámicas */}
                {hayExcedeStock() && (
                  <div className="px-6 py-3.5 bg-red-500 text-white flex items-center justify-center gap-3 w-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-bold tracking-wide">Existen ítems que exceden el stock disponible. Ajusta la cantidad.</p>
                  </div>
                )}
                {!hayExcedeStock() && hayCantidadesPendientes() && (
                  <div className="px-6 py-3.5 bg-amber-400 text-amber-950 flex items-center justify-center gap-3 w-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-bold tracking-wide">
                      {selectedSolicitud.cabecera.Estado === 'APROBADA'
                        ? "Hay cantidades pendientes. Se generará un Despacho Parcial."
                        : "Esta solicitud tiene estado parcial."}
                    </p>
                  </div>
                )}

                {/* Botones del Footer */}
                <DialogFooter className="px-5 sm:px-8 py-5 flex-col-reverse sm:flex-row items-center justify-between gap-4 border-t border-slate-200 shrink-0 w-full bg-slate-50/50 backdrop-blur-md">
                  <Button
                    variant="ghost"
                    size="lg"
                    className="w-full sm:w-auto font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl"
                    onClick={() => {
                      setSelectedSolicitud(null);
                      setEditedItems({});
                      setObservacionesDespacho('');
                    }}
                    disabled={isDispatching}
                  >
                    {selectedSolicitud?.cabecera.Estado === 'APROBADA' ? 'Cancelar y Volver' : 'Cerrar ventana'}
                  </Button>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    {selectedSolicitud?.cabecera.Estado === 'APROBADA' && hayCantidadesPendientes() && (
                      <Button
                        size="lg"
                        className="w-full sm:w-auto font-black tracking-tight text-amber-950 bg-amber-400 hover:bg-amber-500 shadow-md shadow-amber-500/20 transition-transform active:scale-95 rounded-xl border border-amber-500/20"
                        onClick={() => handleDespachar('parcial')}
                        disabled={isDispatching || hayDespachoVacio()}
                      >
                        {isDispatching ? 'Procesando...' : (
                          <><Package className="w-5 h-5 mr-2 opacity-80" /> Despachar Parcial</>
                        )}
                      </Button>
                    )}
                    {selectedSolicitud?.cabecera.Estado === 'APROBADA' && (
                      <Button
                        size="lg"
                        className="w-full sm:w-auto font-black tracking-tight text-white bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-900/20 transition-transform active:scale-95 rounded-xl border border-slate-700"
                        onClick={() => handleDespachar('total')}
                        disabled={!esDespachoCompleto() || isDispatching || hayExcedeStock()}
                      >
                        {isDispatching ? 'Procesando...' : (
                          <><CheckCircle className="w-5 h-5 mr-2 opacity-80" /> Despacho Completo</>
                        )}
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>`;

  // lines[startIdx] through lines[endIdx] are updated
  lines.splice(startIdx, endIdx - startIdx + 1, newModal);
  fs.writeFileSync(targetFile, lines.join('\n'), 'utf8');
  console.log('Success');
} else {
  console.log('Failed to find tags', startIdx, endIdx);
}
