import React from 'react';
import { useAuth } from '../../hooks/useAuth';

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
  const { user } = useAuth(); // Obtener usuario para 'Entregado por' si se desea
  // IMPORTANTE: no devolver null. Mantener el nodo montado evita errores de react-to-print (contentWindow)
  // cuando el contenido se monta/desmonta alrededor del ciclo de impresión.
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
    CodigoCentroCosto, // legacy
    NombreSolicitante,
    Observaciones,
    Detalles,
  } = data;

  // Formatear número consecutivo del despacho (solo dígitos al final)
  const numeroDespacho = (CodigoDespacho?.match(/\d+/g)?.pop()) ?? '';

  // La fecha ya viene formateada desde el flujo de despacho; evitar reparseo que causa "Invalid Date"
  const fechaImpresion = FechaDespacho || '';

  return (
    <div ref={ref} className="print-container">
      <header className="print-header">
         <div className="header-left">
            <div className="header-box">
              <div className="header-row">
                <span className="header-label">FECHA</span>
                <span className="header-value">{fechaImpresion}</span>
              </div>
              <div className="header-row border-top">
                <span className="header-label">SOLICITUD N°</span>
                <span className="header-value text-xs">{CodigoSolicitud}</span>
              </div>
            </div>
         </div>
         <div className="header-center">
            <h1>REQUISA SALIDA DE BODEGA EXTRACEITE</h1>
         </div>
         <div className="header-right">
             <div className="logo-placeholder">
               {/* Logo inline para evitar errores de carga en impresión */}
               <svg viewBox="0 0 24 24" width="40" height="40" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M12 2L2 7l10 5 10-5-10-5z" />
                 <path d="M2 17l10 5 10-5" />
                 <path d="M2 12l10 5 10-5" />
               </svg>
               <span>Extraceite</span>
             </div>
         </div>
      </header>

      <main>
        <div className="items-section">
          <table className="items-table">
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
                  <td>{item.Codigo}</td>
                  <td>{item.Descripcion}</td>
                  <td>{item.UnidadMedida}</td>
                  <td>{item.CantidadDespachada}</td>
                  <td style={{fontSize: '0.9rem', textAlign: 'center'}}>{Actividad || AreaNombre || ''}</td>
                  <td style={{fontSize: '0.9rem', textAlign: 'center'}}>{CodigoCuenta || CodigoCentroCosto || ''}</td>
                </tr>
              ))}
              {/* Rellenar hasta 10 filas para mantener altura fija como el formulario físico */}
              {Array.from({ length: Math.max(0, 10 - Detalles.length) }).map((_, i) => (
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
        </div>

        <div className="observaciones-section">
          <p><strong>OBSERVACIONES:</strong> {Observaciones || '__________________________________________________________________________________'}</p> 
          <p className="form-code">FR-F-BD-025</p>
        </div>
      </main>

      <footer className="print-footer">
        <div className="signatures-container">
            <div className="signature-box">
            <div className="signature-line"></div>
            <p>Entrega bodega</p>
            <p>Nombre y firma</p>
            </div>
            <div className="signature-box">
            <div className="signature-line"></div>
            <p>Retirado por</p>
            <p>Nombre y firma</p>
            </div>
            <div className="signature-box">
            <div className="signature-line"></div>
            <p>Autorizado por</p>
            <p>Nombre del Ingeniero</p>
            </div>
        </div>
        
        <div className="dispatch-number">
             <p>N° <span className="red-number">{numeroDespacho}</span></p>
        </div>
      </footer>
    </div>
  );
});
