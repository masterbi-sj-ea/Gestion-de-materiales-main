import sql from 'mssql';
import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';
import { io } from '../../server';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';

export interface SolicitudResumen {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  Estado: string;
  IdSolicitante: number;
  NombreSolicitante: string;
  RolSolicitante: string | null;
  IdArea: number | null;
  AreaNombre: string | null;
  AreaCodigoCuenta: string | null;
  IdCentroCosto: number | null;
  CentroCostoCodigo: string | null;
  CentroCostoNombre: string | null;
  Comentario: string | null;
  TotalItems: number;
  TotalMonto: number;
}

export interface SolicitudCabecera {
  IdSolicitud: number;
  CodigoSolicitud: string;
  IdSolicitante: number;
  NombreSolicitante: string;
  EmailSolicitante: string;
  RolSolicitante: string | null;
  FechaSolicitud: string;
  Estado: string;
  Area: string | null;
  Comentario: string | null;
  IdCorteStock: number | null;
  IdArea: number | null;
  AreaNombre: string | null;
  IdCentroCosto: number | null;
  CentroCostoCodigo: string | null;
  CentroCostoNombre: string | null;
}

export interface SolicitudDetalle {
  IdDetalleSolicitud: number;
  IdSolicitud: number;
  IdMaterial: number;
  NumeroArticulo: string;
  DescripcionArticulo: string;
  UnidadMedidaMaterial: string;
  GrupoArticulos: string | null;
  CantidadSolicitada: number;
  CantidadAprobada: number | null;
  UnidadMedidaDetalle: string | null;
  ComentarioLinea: string | null;
  EnStock: number | null;
  UltimaFechaCompra: string | null;
  UltimoPrecioCompra: number | null;
  UltimaMonedaCompra: string | null;
}

export interface SolicitudCompleta {
  cabecera: SolicitudCabecera | null;
  detalle: SolicitudDetalle[];
}

export interface CrearSolicitudDetalleInput {
  idMaterial: number;
  cantidadSolicitada: number;
  unidadMedida?: string | null;
  comentarioLinea?: string | null;
  idArea?: number | null;
  idRecurso?: number | null;
}

export interface CrearSolicitudInput {
  idSolicitante: number;
  fechaSolicitud?: string | null; // ISO string o null para SYSDATETIME()
  estado?: string | null; // por defecto 'PENDIENTE'
  area?: string | null;
  comentario?: string | null;
  idCorteStock?: number | null;
  idArea?: number | null;
  idRecurso?: number | null;
  idCentroCosto?: number | null;
  detalle: CrearSolicitudDetalleInput[];
}

export interface ActualizarSolicitudInput {
  idSolicitud: number;
  fechaSolicitud?: string | null;
  nuevoEstado?: string | null;
  area?: string | null;
  comentario?: string | null;
  idArea?: number | null;
  idRecurso?: number | null;
  idCentroCosto?: number | null;
  detalle: CrearSolicitudDetalleInput[];
}

export async function crearSolicitud(input: CrearSolicitudInput): Promise<{ IdSolicitud: number; CodigoSolicitud: string }> {
  if (!input.detalle || input.detalle.length === 0) {
    throw new Error('La solicitud debe tener al menos una línea de detalle');
  }

  const pool = await getPool();

  // Construir TVP para dbo.TDetalleSolicitudMaterial
  const tvp = new sql.Table();
  tvp.columns.add('IdMaterial', sql.Int);
  tvp.columns.add('CantidadSolicitada', sql.Decimal(18, 4));
  tvp.columns.add('UnidadMedida', sql.NVarChar(50));
  tvp.columns.add('ComentarioLinea', sql.NVarChar(255));
  tvp.columns.add('IdArea', sql.Int);
  tvp.columns.add('IdRecurso', sql.Int);

  for (const d of input.detalle) {
    tvp.rows.add(
      d.idMaterial,
      d.cantidadSolicitada,
      d.unidadMedida ?? null,
      d.comentarioLinea ?? null,
      d.idArea ?? input.idArea ?? null,
      d.idRecurso ?? input.idRecurso ?? null
    );
  }

  const request = pool.request();

  request.input('IdSolicitante', sql.Int, input.idSolicitante);
  request.input('FechaSolicitud', sql.DateTime2, input.fechaSolicitud ?? null);
  request.input('Estado', sql.NVarChar(30), input.estado ?? 'PENDIENTE');
  request.input('Area', sql.NVarChar(100), input.area ?? null);
  request.input('Comentario', sql.NVarChar(500), input.comentario ?? null);
  request.input('IdCorteStock', sql.Int, input.idCorteStock ?? null);
  request.input('IdArea', sql.Int, input.idArea ?? null);
  request.input('IdCentroCosto', sql.Int, input.idCentroCosto ?? null);
  request.input('Detalle', tvp as any);

  const result = await request.execute<{ IdSolicitud: number; CodigoSolicitud: string }>('sp_CrearSolicitudMaterial');

  const row = (result.recordset && result.recordset[0]) as { IdSolicitud: number; CodigoSolicitud: string } | undefined;
  if (!row) {
    throw new Error('No se pudo crear la solicitud');
  }

  // Notificar por Socket a bodega
  try {
    io.to('bodega').emit('nueva_solicitud', {
      id: row.IdSolicitud,
      codigo: row.CodigoSolicitud,
      area: input.area || 'General'
    });
  } catch (err) {
    console.error('Error emitiendo socket nueva_solicitud:', err);
  }

  return row;
}

export async function actualizarSolicitud(input: ActualizarSolicitudInput): Promise<void> {
  if (!input.detalle || input.detalle.length === 0) {
    throw new Error('La solicitud debe tener al menos una línea de detalle');
  }

  const pool = await getPool();

  const tvp = new sql.Table();
  tvp.columns.add('IdMaterial', sql.Int);
  tvp.columns.add('CantidadSolicitada', sql.Decimal(18, 4));
  tvp.columns.add('UnidadMedida', sql.NVarChar(50));
  tvp.columns.add('ComentarioLinea', sql.NVarChar(255));
  tvp.columns.add('IdArea', sql.Int);
  tvp.columns.add('IdRecurso', sql.Int);

  for (const d of input.detalle) {
    tvp.rows.add(
      d.idMaterial,
      d.cantidadSolicitada,
      d.unidadMedida ?? null,
      d.comentarioLinea ?? null,
      d.idArea ?? input.idArea ?? null,
      d.idRecurso ?? input.idRecurso ?? null
    );
  }

  const request = pool.request();
  request.input('IdSolicitud', sql.Int, input.idSolicitud);
  request.input('FechaSolicitud', sql.DateTime2, input.fechaSolicitud ?? null);
  request.input('NuevoEstado', sql.NVarChar(30), input.nuevoEstado ?? 'PENDIENTE');
  request.input('Area', sql.NVarChar(100), input.area ?? null);
  request.input('Comentario', sql.NVarChar(500), input.comentario ?? null);
  request.input('IdArea', sql.Int, input.idArea ?? null);
  request.input('IdCentroCosto', sql.Int, input.idCentroCosto ?? null);
  request.input('Detalle', tvp as any);

  await request.execute('sp_ActualizarSolicitudMaterial');
}

export async function listarSolicitudes(params: {
  idSolicitante?: number;
  estado?: string;
  idArea?: number;
  fechaDesde?: string;
  fechaHasta?: string;
} = {}): Promise<SolicitudResumen[]> {
  return callSpMany<SolicitudResumen>('sp_ListarSolicitudesMaterial', {
    IdSolicitante: params.idSolicitante ?? null,
    Estado: params.estado ?? null,
    IdArea: params.idArea ?? null,
    FechaDesde: params.fechaDesde ?? null,
    FechaHasta: params.fechaHasta ?? null,
  });
}

export async function obtenerSolicitud(idSolicitud: number): Promise<SolicitudCompleta> {
  const pool = await getPool();
  const request = pool.request();
  request.input('IdSolicitud', sql.Int, idSolicitud);

  const result = await request.execute('sp_ObtenerSolicitudMaterial');

  const recordsets = (result as any).recordsets as any[] | undefined;
  const cabecera = (recordsets?.[0]?.[0] as SolicitudCabecera) ?? null;
  const detalle = (recordsets?.[1] as SolicitudDetalle[]) ?? [];

  return {
    cabecera,
    detalle,
  };
}

export async function registrarAprobacionSolicitud(input: {
  idSolicitud: number;
  idAprobador: number;
  estado: 'APROBADA' | 'RECHAZADA';
  comentario?: string | null;
}): Promise<void> {
  await callSpOne('sp_RegistrarAprobacionSolicitud', {
    IdSolicitud: input.idSolicitud,
    IdAprobador: input.idAprobador,
    Estado: input.estado,
    Comentario: input.comentario ?? null,
  });

  // Notificar al solicitante
  if (input.estado === 'APROBADA') {
    try {
      // Obtenemos el código de la solicitud para el toast
      const pool = await getPool();
      const res = await pool.request()
        .input('id', sql.Int, input.idSolicitud)
        .query('SELECT CodigoSolicitud FROM SolicitudesMaterial WHERE IdSolicitud = @id');
      const codigo = res.recordset[0]?.CodigoSolicitud;

      io.emit('solicitud_aprobada', {
        id: input.idSolicitud,
        codigo: codigo || `#${input.idSolicitud}`
      });
    } catch (err) {
      console.error('Error emitiendo socket solicitud_aprobada:', err);
    }
  }
}

export interface AprobacionSolicitud {
  IdAprobacion: number;
  IdSolicitud: number;
  IdAprobador: number;
  NombreAprobador: string;
  EmailAprobador: string;
  FechaAprobacion: string;
  Estado: string;
  Comentario: string | null;
}

export async function listarAprobacionesPorSolicitud(idSolicitud: number): Promise<AprobacionSolicitud[]> {
  return callSpMany<AprobacionSolicitud>('sp_ListarAprobacionesPorSolicitud', { IdSolicitud: idSolicitud });
}

export async function actualizarEstadoSolicitud(idSolicitud: number, nuevoEstado: string): Promise<void> {
  await callSpOne('sp_ActualizarEstadoSolicitudMaterial', {
    IdSolicitud: idSolicitud,
    NuevoEstado: nuevoEstado,
  });
}

export async function registrarDespachoSolicitud(input: {
  idSolicitud: number;
  nuevoEstado?: string;
  detalle: { idMaterial: number; cantidadAprobada: number; comentarioLinea?: string | null }[];
}): Promise<void> {
  await callSpOne('sp_RegistrarDespachoSolicitud', {
    IdSolicitud: input.idSolicitud,
    NuevoEstado: input.nuevoEstado ?? 'DESPACHADA',
    DetalleDesp: {
      type: 'TDespachoSolicitudDetalle',
      value: input.detalle.map((d) => ({
        IdMaterial: d.idMaterial,
        CantidadAprobada: d.cantidadAprobada,
        ComentarioLinea: d.comentarioLinea ?? null,
      })),
    },
  });
}

function dibujarLogoPlaceholder(doc: any, x: number, y: number) {
  doc.save()
     .path(`M ${x + 30} ${y + 5} Q ${x + 50} ${y + 25} ${x + 30} ${y + 35} Q ${x + 10} ${y + 25} ${x + 30} ${y + 5} Z`)
     .fillAndStroke("#333", "#333")
     .restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
  doc.text("Extraceite", x, y + 40, { width: 60, align: "center" });
}

export async function generarPdfSolicitud(idSolicitud: number): Promise<PassThrough> {
  const pool = await getPool();

  // 1. Obtener datos de la solicitud
  const query = `
    SELECT 
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.FechaSolicitud,
      u.NombreCompleto AS NombreSolicitante,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      COALESCE(
        cc.Codigo, 
        a.Codigo,
        (SELECT TOP 1 arc.CodigoCuenta 
         FROM AreaRecursoCuenta arc 
         WHERE arc.IdArea = s.IdArea AND arc.IdRecurso = 1 AND ISNULL(arc.Activo, 1) = 1)
      ) AS CodigoCC,
      s.IdArea
    FROM SolicitudesMaterial s
    JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
    LEFT JOIN Areas a ON s.IdArea = a.IdArea
    LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
    WHERE s.IdSolicitud = @id
  `;

  const cabeceraResult = await pool.request()
    .input('id', sql.Int, idSolicitud)
    .query(query);

  if (cabeceraResult.recordset.length === 0) {
    throw new Error('Solicitud no encontrada');
  }

  const cab = cabeceraResult.recordset[0];

  const queryDetalle = `
  SELECT 
    m.IdMaterial,
    m.NumeroArticulo AS Codigo,
    m.DescripcionArticulo AS Descripcion,
    m.UnidadMedida,
    d.CantidadSolicitada,
    a.Nombre AS Actividad,
    arc.CodigoCuenta
  FROM DetalleSolicitudesMaterial d
  JOIN SolicitudesMaterial sm ON sm.IdSolicitud = d.IdSolicitud
  JOIN Materiales m ON d.IdMaterial = m.IdMaterial

  LEFT JOIN Areas a
    ON a.IdArea = COALESCE(d.IdArea, sm.IdArea)

  OUTER APPLY (
    SELECT TOP (1) mr.IdRecurso
    FROM MaterialRecurso mr
    WHERE mr.IdMaterial = d.IdMaterial
      AND mr.Activo = 1
    ORDER BY mr.IdRecurso
  ) MRE

  LEFT JOIN AreaRecursoCuenta arc
    ON arc.IdArea = COALESCE(d.IdArea, sm.IdArea)
   AND arc.IdRecurso = COALESCE(d.IdRecurso, MRE.IdRecurso)
   AND ISNULL(arc.Activo, 1) = 1

  WHERE d.IdSolicitud = @id
  ORDER BY d.IdDetalleSolicitud;
`;

  const detalleResult = await pool.request()
    .input('id', sql.Int, idSolicitud)
    .query(queryDetalle);

  const detalle = detalleResult.recordset;
  // Debug: log query and sample result to confirm fields before PDF generation
  try {
    console.log('[PDF Solicitud] queryDetalle:', queryDetalle);
    console.log('[PDF Solicitud] detalle rows:', detalle.length);
    if (detalle.length > 0) {
      console.log('[PDF Solicitud] detalle columns:', Object.keys(detalle[0]));
      console.log('[PDF Solicitud] first rows sample:', detalle.slice(0, 5));
    }
  } catch (e) {
    console.error('[PDF Solicitud] Error logging detalle sample', e);
  }

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margins: { top: 20, bottom: 20, left: 30, right: 30 },
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  doc.lineWidth(0.5);
  const left = 30;
  const right = doc.page.width - 30;
  const contentW = right - left;

  const strokeBox = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).stroke();
  const fillStrokeBox = (x: number, y: number, w: number, h: number, color = "#E8E8E8") => {
    doc.save().fillColor(color).rect(x, y, w, h).fill().restore();
    doc.rect(x, y, w, h).stroke();
  };
  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("es-NI") : "";

  const drawRequisa = (startY: number) => {
    // Título igual al físico
    doc.font("Times-Bold").fontSize(16);
    doc.text("SOLICITUD DE PEDIDO A BODEGA EXTRACEITE, S.A.", left, startY, { align: 'center', width: contentW });
    
    doc.font("Helvetica").fontSize(8).fillColor("#666");
    doc.text("FR-F-BD-022", right - 60, startY);

    const logoX = left;
    const logoY = startY - 5;
    const posiblesRutas = [
      path.join(process.cwd(), "backend", "public", "logo_extraceite.png"),
      path.join(process.cwd(), "public", "logo_extraceite.png"),
      path.join(process.cwd(), "backend", "public", "logo.png"),
      path.join(process.cwd(), "public", "logo.png")
    ];

    let logoFinalPath = null;
    for (const ruta of posiblesRutas) {
      if (fs.existsSync(ruta)) { logoFinalPath = ruta; break; }
    }

    if (logoFinalPath) {
      try { doc.image(logoFinalPath, logoX, logoY, { width: 45 }); }
      catch (err) { dibujarLogoPlaceholder(doc, logoX, logoY); }
    } else {
      dibujarLogoPlaceholder(doc, logoX, logoY);
    }

    const numDespacho = String(cab.CodigoSolicitud).replace(/\D/g, '').slice(-6) || '000000';
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#e11d48");
    doc.text(`Nº ${numDespacho}`, right - 80, startY + 15, { align: 'right', width: 80 });

    const infoY = startY + 50;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("black");
    doc.text("FECHA: ", left, infoY);
    doc.font("Helvetica").text(fmtDate(cab.FechaSolicitud), left + 45, infoY);
    doc.moveTo(left + 45, infoY + 10).lineTo(left + 200, infoY + 10).stroke();

    doc.font("Helvetica-Bold").text("REQUISA DE SALIDA No. : ", left + 250, infoY);
    doc.font("Helvetica").text(cab.CodigoSolicitud, left + 365, infoY);
    doc.moveTo(left + 365, infoY + 10).lineTo(right, infoY + 10).stroke();

    const tableY = infoY + 25;
    const headerH = 20;
    const rowHTable = 20;
    const rowsLimit = 10;

    const wCodigo = 60;
    const wDesc = 200;
    const wUM = 50;
    const wCant = 50;
    const wAct = 100;
    const wCCO = contentW - (wCodigo + wDesc + wUM + wCant + wAct);

    fillStrokeBox(left, tableY, contentW, headerH);
    doc.font("Helvetica-Bold").fontSize(8).text("CODIGO", left, tableY + 6, { width: wCodigo, align: 'center' });
    doc.text("DESCRIPCION MATERIAL", left + wCodigo, tableY + 6, { width: wDesc, align: 'center' });
    doc.text("U/MEDIDA", left + wCodigo + wDesc, tableY + 6, { width: wUM, align: 'center' });
    doc.text("CANTIDAD", left + wCodigo + wDesc + wUM, tableY + 6, { width: wCant, align: 'center' });
    doc.text("ACTIVIDAD", left + wCodigo + wDesc + wUM + wCant, tableY + 6, { width: wAct, align: 'center' });
    doc.text("CODIGO DE CUENTA", left + wCodigo + wDesc + wUM + wCant + wAct, tableY + 6, { width: wCCO, align: 'center' });

    for (let i = 0; i <= rowsLimit; i++) {
      const y = tableY + headerH + (i * rowHTable);
      if (i < rowsLimit) {
        doc.moveTo(left, y).lineTo(right, y).stroke();
        const it = detalle[i];
        if (it) {
          doc.font("Helvetica").fontSize(8);
          doc.text(it.Codigo, left, y + 6, { width: wCodigo, align: 'center' });
          doc.text(it.Descripcion, left + wCodigo + 5, y + 6, { width: wDesc - 10 });
          doc.text(it.UnidadMedida, left + wCodigo + wDesc, y + 6, { width: wUM, align: 'center' });
          doc.text(String(it.CantidadSolicitada), left + wCodigo + wDesc + wUM, y + 6, { width: wCant, align: 'center' });
          doc.text(it.Actividad || cab.AreaNombre || '', left + wCodigo + wDesc + wUM + wCant, y + 6, { width: wAct, align: 'center' });
          doc.text(it.CodigoCuenta || cab.CodigoCC || '', left + wCodigo + wDesc + wUM + wCant + wAct, y + 6, { width: wCCO, align: 'center' });
        }
      }
    }
    // Vertical lines
    [wCodigo, wCodigo+wDesc, wCodigo+wDesc+wUM, wCodigo+wDesc+wUM+wCant, wCodigo+wDesc+wUM+wCant+wAct].forEach(x => {
      doc.moveTo(left + x, tableY).lineTo(left + x, tableY + headerH + (rowsLimit * rowHTable)).stroke();
    });
    strokeBox(left, tableY, contentW, headerH + (rowsLimit * rowHTable));

    const footerY = tableY + headerH + (rowsLimit * rowHTable) + 15;
    doc.font("Helvetica").fontSize(9);
    doc.text("Hora de inicio de despacho: ____________", left, footerY);
    doc.text("Hora de finalización de despacho: ____________", left + 250, footerY);

    const sigY = footerY + 50;
    doc.moveTo(left + 20, sigY).lineTo(left + 180, sigY).stroke();
    doc.text("Autorizado por", left + 20, sigY + 5, { width: 160, align: 'center' });
    doc.text("Nombre y firma del jefe de área", left + 20, sigY + 15, { width: 160, align: 'center' });

    doc.moveTo(right - 180, sigY).lineTo(right - 20, sigY).stroke();
    doc.text("Autorizado por", right - 180, sigY + 5, { width: 160, align: 'center' });
    doc.text("de la persona que retira", right - 180, sigY + 15, { width: 160, align: 'center' });

    doc.fontSize(7).text("180B 50J (2) 095501 - 104500 Sep/2024", left, sigY + 40);
  };

  drawRequisa(40);
  doc.end();
  return stream;
}
