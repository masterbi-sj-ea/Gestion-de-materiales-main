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
  const { user } = useAuth();
  
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

  return (
    <div ref={ref} className="print-container">
      <header className="print-header">
         <div className="header-left">
            <div className="logo-placeholder">
               <img src="/logo_extraceite.png" alt="Extraceite" style={{ width: '50px', height: 'auto' }} />
               <span style={{ fontWeight: 'bold', fontSize: '10pt' }}>Extraceite</span>
            </div>
         </div>
         <div className="header-center">
            <h1 style={{ fontSize: '16pt', fontWeight: 'bold' }}>SOLICITUD DE PEDIDO A BODEGA EXTRACEITE, S.A.</h1>
         </div>
         <div className="header-right" style={{ textAlign: 'right' }}>
             <p style={{ margin: 0, fontSize: '8pt', color: '#666' }}>FR-F-BD-022</p>
             <p style={{ margin: 0, fontSize: '14pt', fontWeight: 'bold' }}>
               Nº <span className="red-number">{numeroDespacho}</span>
             </p>
         </div>
      </header>

      <div className="info-grid">
        <div className="info-item">
          <span className="info-label">FECHA:</span>
          <span className="info-underline">{fechaImpresion}</span>
        </div>
        <div className="info-item">
          <span className="info-label">REQUISA DE SALIDA No. :</span>
          <span className="info-underline">{CodigoSolicitud}</span>
        </div>
      </div>

      <main>
        <div className="items-section">
          <table className="items-table">
            <thead>
              <tr>
                <th>CODIGO</th>
                <th>DESCRIPCION MATERIAL</th>
                <th>U/MEDIDA</th>
                <th>CANTIDAD</th>
                <th>ACTIVIDAD</th>
                <th>CODIGO DE CUENTA</th>
              </tr>
            </thead>
            <tbody>
              {Detalles.map((item, index) => (
                <tr key={index}>
                  <td style={{ textAlign: 'center' }}>{item.Codigo}</td>
                  <td>{item.Descripcion}</td>
                  <td style={{ textAlign: 'center' }}>{item.UnidadMedida}</td>
                  <td style={{ textAlign: 'center' }}>{item.CantidadDespachada}</td>
                  <td style={{ fontSize: '0.8rem', textAlign: 'center' }}>{Actividad || AreaNombre || ''}</td>
                  <td style={{ fontSize: '0.8rem', textAlign: 'center' }}>{CodigoCuenta || CodigoCentroCosto || ''}</td>
                </tr>
              ))}
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
      </main>

      <footer className="print-footer-new">
        <div className="extra-info">
          <div className="info-row">
            <span className="info-label">Hora de inicio de despacho:</span>
            <span className="info-underline" style={{ width: '150px' }}></span>
            <span className="info-label" style={{ marginLeft: '20px' }}>Hora de finalización de despacho:</span>
            <span className="info-underline" style={{ width: '150px' }}></span>
          </div>
        </div>

        <div className="signatures-grid">
            <div className="signature-item">
              <div className="signature-line"></div>
              <p>Autorizado por</p>
              <p>Nombre y firma del jefe de área</p>
            </div>
            <div className="signature-item">
              <div className="signature-line"></div>
              <p>Autorizado por</p>
              <p>de la persona que retira</p>
            </div>
        </div>
        
        <div className="footer-bottom">
          <p style={{ fontSize: '7pt', margin: 0 }}>180B 50J (2) 005501 - 104500 Sep/2024</p>
        </div>
      </footer>
    </div>
  );
});
