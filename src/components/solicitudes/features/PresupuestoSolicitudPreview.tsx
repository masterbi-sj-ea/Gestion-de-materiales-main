import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';

export interface SolicitudPresupuestoPreviewArea {
  idArea: number;
  areaNombre: string;
  presupuestoId: number | null;
  presupuesto: number | null;
  comprometidoActual: number;
  solicitadoNuevo: number;
  disponibleAntes: number | null;
  disponibleDespues: number | null;
  porcentajeUsoAntes: number | null;
  porcentajeUsoDespues: number | null;
  estado: 'ok' | 'alerta' | 'critico' | 'excedido' | 'sin-presupuesto';
}

export interface SolicitudPresupuestoPreviewData {
  bloqueada: boolean;
  mensaje: string | null;
  materialesSinPrecio: number[];
  areas: SolicitudPresupuestoPreviewArea[];
}

interface Props {
  loading: boolean;
  error: string | null;
  preview: SolicitudPresupuestoPreviewData | null;
  visible: boolean;
}

function getAreasWithoutBudget(preview: SolicitudPresupuestoPreviewData | null): string[] {
  if (!preview) {
    return [];
  }

  return Array.from(
    new Set(
      preview.areas
        .filter((area) => area.estado === 'sin-presupuesto')
        .map((area) => area.areaNombre)
        .filter(Boolean),
    ),
  );
}

export function getBudgetPreviewUserMessage(preview: SolicitudPresupuestoPreviewData | null): string | null {
  const rawMessage = preview?.mensaje?.trim();
  if (!rawMessage) {
    return null;
  }

  if (rawMessage.startsWith('PRESUPUESTO_NO_CONFIGURADO:')) {
    const areas = getAreasWithoutBudget(preview);

    if (areas.length === 1) {
      return `El area ${areas[0]} no tiene presupuesto vigente para la fecha de la solicitud.`;
    }

    if (areas.length > 1) {
      return `Las areas ${areas.join(', ')} no tienen presupuesto vigente para la fecha de la solicitud.`;
    }

    return 'No hay presupuesto vigente para el area de la solicitud.';
  }

  if (rawMessage.startsWith('PRESUPUESTO_SIN_PRECIO_REFERENCIA:')) {
    return 'No fue posible validar el presupuesto porque hay materiales sin precio de referencia.';
  }

  if (rawMessage.startsWith('PRESUPUESTO_EXCEDIDO:')) {
    const exceededAreas = preview?.areas.filter((area) => area.estado === 'excedido') ?? [];

    if (exceededAreas.length === 1) {
      const [area] = exceededAreas;
      return `El area ${area.areaNombre} tiene ${formatCurrency(area.disponibleAntes)} disponibles antes de esta solicitud. La solicitud actual requiere ${formatCurrency(area.solicitadoNuevo)} y dejaria un saldo de ${formatCurrency(area.disponibleDespues)}.`;
    }

    if (exceededAreas.length > 1) {
      return `La solicitud excede el presupuesto disponible en ${exceededAreas.length} areas. Revisa el disponible actual y el saldo proyectado de cada una.`;
    }

    return rawMessage.replace(/^PRESUPUESTO_EXCEDIDO:\s*/, '');
  }

  return rawMessage;
}

function formatCurrency(value: number | null): string {
  if (value == null) {
    return '-';
  }

  const absolute = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-${absolute} USD` : `${absolute} USD`;
}

function statusBadge(area: SolicitudPresupuestoPreviewArea) {
  switch (area.estado) {
    case 'ok':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Controlado</Badge>;
    case 'alerta':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Alerta</Badge>;
    case 'critico':
      return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Critico</Badge>;
    case 'excedido':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Bloqueado</Badge>;
    case 'sin-presupuesto':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Sin presupuesto vigente</Badge>;
    default:
      return <Badge variant="outline">Pendiente</Badge>;
  }
}

export function PresupuestoSolicitudPreview({ loading, error, preview, visible }: Props) {
  if (!visible) {
    return null;
  }

  const userMessage = getBudgetPreviewUserMessage(preview);

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          {preview?.bloqueada ? <ShieldAlert className="h-5 w-5 text-red-600" /> : <ShieldCheck className="h-5 w-5 text-emerald-600" />}
          Impacto presupuestario previo al envio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculando consumo y disponibilidad por area...
          </div>
        )}

        {!loading && error && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error} El servidor igual validara el presupuesto al enviar.
            </AlertDescription>
          </Alert>
        )}

        {!loading && userMessage && (
          <Alert variant={preview?.bloqueada ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{userMessage}</AlertDescription>
          </Alert>
        )}

        {!loading && preview && preview.materialesSinPrecio.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Materiales sin precio de referencia: {preview.materialesSinPrecio.join(', ')}.
            </AlertDescription>
          </Alert>
        )}

        {!loading && preview && preview.areas.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {preview.areas.map((area) => {
              const percentage = area.estado === 'sin-presupuesto' ? null : area.porcentajeUsoDespues;
              const progressClass = area.estado === 'excedido'
                ? 'bg-red-500'
                : area.estado === 'critico'
                  ? 'bg-orange-500'
                  : area.estado === 'alerta'
                    ? 'bg-amber-500'
                    : area.estado === 'sin-presupuesto'
                      ? 'bg-amber-400'
                      : 'bg-emerald-500';
              const disponibleDespuesTexto = area.estado === 'sin-presupuesto'
                ? 'Sin presupuesto vigente'
                : formatCurrency(area.disponibleDespues);
              const disponibleDespuesClassName = area.estado === 'sin-presupuesto'
                ? 'text-amber-700'
                : area.disponibleDespues != null && area.disponibleDespues < 0
                  ? 'text-red-600'
                  : 'text-slate-900';
              const disponibleAntesTexto = area.estado === 'sin-presupuesto'
                ? 'Sin presupuesto vigente'
                : formatCurrency(area.disponibleAntes);
              const disponibleAntesClassName = area.estado === 'sin-presupuesto'
                ? 'text-amber-700'
                : 'text-slate-900';

              return (
                <div key={area.idArea} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{area.areaNombre}</div>
                      <div className="text-xs text-slate-500">Area #{area.idArea}</div>
                    </div>
                    {statusBadge(area)}
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                        <span>Uso proyectado</span>
                        <span>{percentage == null ? 'Revision requerida' : `${percentage.toFixed(1)}%`}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${progressClass}`}
                          style={{ width: `${Math.max(0, Math.min(100, percentage ?? 0))}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Presupuesto (USD)</div>
                        <div className="mt-1 font-semibold text-slate-900">{formatCurrency(area.presupuesto)}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Comprometido actual (USD)</div>
                        <div className="mt-1 font-semibold text-slate-900">{formatCurrency(area.comprometidoActual)}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Disponible actual (USD)</div>
                        <div className={`mt-1 font-semibold ${disponibleAntesClassName}`}>
                          {disponibleAntesTexto}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Solicitud actual (USD)</div>
                        <div className="mt-1 font-semibold text-slate-900">{formatCurrency(area.solicitadoNuevo)}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Disponible despues (USD)</div>
                        <div className={`mt-1 font-semibold ${disponibleDespuesClassName}`}>
                          {disponibleDespuesTexto}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
