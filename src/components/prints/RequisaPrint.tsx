import React from 'react';

interface DetalleDespachoPrint {
  Codigo: string;
  Descripcion: string;
  UnidadMedida: string;
  CantidadDespachada: number;
}

interface DespachoPrintData {
  CodigoDespacho: string;
  FechaDespacho: string;
  CodigoSolicitud: string;
  // Actividad muestra el área destino (ej: "BPM - BUENAS PRACTICAS DE MANUFACTURA")
  Actividad?: string;
  // Código de cuenta/CCO a imprimir (ej: 51103903)
  CodigoCuenta?: string;
  AreaNombre?: string; // backward compat
  CodigoCentroCosto?: string; // backward compat
  NombreSolicitante: string;
  Observaciones: string | null;
  Detalles: DetalleDespachoPrint[];
}

interface RequisaPrintProps {
  data: DespachoPrintData | null;
}

export const RequisaPrint = React.forwardRef<HTMLDivElement, RequisaPrintProps>(({ data }, ref) => {
  if (!data) {
    return <div ref={ref} className="print-container" style={{ display: 'none' }} />;
  }

  const {
    CodigoDespacho,
    FechaDespacho,
    CodigoSolicitud,
    Actividad,
    CodigoCuenta,
    AreaNombre,
    CodigoCentroCosto,
    NombreSolicitante,
    Observaciones,
    Detalles,
  } = data;

  const numeroDespacho = (CodigoDespacho?.match(/\d+/g)?.pop()) ?? '098145';
  const fechaImpresion = FechaDespacho || '';

  const actividadImpresion = Actividad || AreaNombre || '';
  const ccoImpresion = CodigoCuenta || CodigoCentroCosto || '';
  const totalFilas = 9;
  const filasVacias = Math.max(0, totalFilas - Detalles.length);

  return (
    <div ref={ref} className="print-container requisa-print">
      <header className="requisa-header">
        <div className="requisa-header-row">
          <h1 className="requisa-title">REQUISA SALIDA DE BODEGA&nbsp;&nbsp;EXTRACEITE</h1>
          <div className="requisa-logo">
            <img src="/logo_extraceite.png" alt="Extraceite" />
            <span>Extraceite</span>
          </div>
        </div>

        <table className="requisa-mini-table">
          <tbody>
            <tr>
              <th>FECHA</th>
              <td>{fechaImpresion}</td>
            </tr>
            <tr>
              <th>SOLICITUD N°</th>
              <td>{CodigoSolicitud}</td>
            </tr>
          </tbody>
        </table>
      </header>

      <main>
        <table className="items-table requisa-items-table">
          <colgroup>
            <col style={{ width: '13%' }} />
            <col style={{ width: '40%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>CODIGO</th>
              <th>DESCRIPCION DEL MATERIAL</th>
              <th>U/MEDIDA</th>
              <th>CANTIDAD</th>
              <th>ACTIVIDAD</th>
              <th>CCO</th>
            </tr>
          </thead>
          <tbody>
            {Detalles.map((item, index) => (
              <tr key={index}>
                <td className="tc">{item.Codigo}</td>
                <td>{item.Descripcion}</td>
                <td className="tc">{item.UnidadMedida}</td>
                <td className="tc">{item.CantidadDespachada}</td>
                <td className="tc small">{actividadImpresion}</td>
                <td className="tc small">{ccoImpresion}</td>
              </tr>
            ))}
            {Array.from({ length: filasVacias }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="requisa-observaciones">
          <span className="label">OBSERVACIONES:</span>
          <span className="line">{Observaciones || ''}</span>
        </div>
      </main>

      <footer className="requisa-footer">
        <div className="requisa-footer-meta">
          <span className="form-code">FR-F-BD-025</span>
          <span className="requisa-no">
            N° <span className="red-number">{numeroDespacho}</span>
          </span>
        </div>

        <div className="requisa-signatures">
          <div className="requisa-signature">
            <div className="signature-line"></div>
            <div className="sig-title">Entrega bodega</div>
            <div className="sig-subtitle">Nombre y firma</div>
          </div>
          <div className="requisa-signature">
            <div className="signature-line"></div>
            <div className="sig-title">Retirado por</div>
            <div className="sig-subtitle">Nombre y firma</div>
          </div>
          <div className="requisa-signature">
            <div className="signature-line"></div>
            <div className="sig-title">Autorizado por</div>
            <div className="sig-subtitle">Nombre del Ingeniero</div>
          </div>
        </div>
      </footer>
    </div>
  );
});
