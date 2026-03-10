import sql from 'mssql';
import { getPool } from '../../config/db';
import { callSpOne } from '../../infra/spCaller';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';

export interface DespachoPendiente {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  NombreSolicitante: string;
  AreaNombre: string;
  Estado: string;
  EstadoDespacho?: 'LISTA_PARA_DESPACHO' | 'NO_LISTA';
  ListaParaDespachar?: boolean;
  EstadoDespachoLabel?: string;
  ItemsTotal: number;
}

export interface DetalleDespachoItem {
  IdDetalleSolicitud: number;
  IdMaterial: number;
  Codigo: string;
  Descripcion: string;
  UnidadMedida: string;
  CantidadSolicitada: number;
  CantidadAprobada: number;
  CantidadPendiente: number;
  EnStock: number;
}

export interface SolicitudDespachoDetalle {
  cabecera: DespachoPendiente;
  detalle: DetalleDespachoItem[];
}

export async function listarSolicitudesPendientes(): Promise<DespachoPendiente[]> {
  const pool = await getPool();
  const query = `
    SELECT 
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.FechaSolicitud,
      u.NombreCompleto AS NombreSolicitante,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      s.Estado,
      CASE 
        WHEN s.Estado IN ('APROBADA', 'PARCIALMENTE_DESPACHADA') THEN 'LISTA_PARA_DESPACHO' 
        ELSE 'NO_LISTA' 
      END AS EstadoDespacho,
      CASE 
        WHEN s.Estado IN ('APROBADA', 'PARCIALMENTE_DESPACHADA') THEN CAST(1 AS bit) 
        ELSE CAST(0 AS bit) 
      END AS ListaParaDespachar,
      CASE 
        WHEN s.Estado = 'APROBADA' THEN 'Aprobada'
        WHEN s.Estado = 'PARCIALMENTE_DESPACHADA' THEN 'Parcialmente Despachada'
        ELSE 'No lista'
      END AS EstadoDespachoLabel,
      (SELECT COUNT(*) FROM DetalleSolicitudesMaterial d WHERE d.IdSolicitud = s.IdSolicitud) AS ItemsTotal
    FROM SolicitudesMaterial s
    JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
    LEFT JOIN Areas a ON s.IdArea = a.IdArea
    WHERE s.Estado IN ('APROBADA', 'PARCIALMENTE_DESPACHADA')
    ORDER BY s.FechaSolicitud DESC
  `;
  
  const result = await pool.request().query(query);
  return result.recordset;
}

export async function listarSolicitudesDespachadas(): Promise<any[]> {
  const pool = await getPool();
  // Historial: Ahora leemos de la tabla Despachos para ver cada evento de entrega
  const query = `
    SELECT 
      d.IdDespacho,
      d.FechaDespacho,
      d.Estado AS EstadoDespacho,
      s.IdSolicitud,
      s.CodigoSolicitud,
      u.NombreCompleto AS NombreSolicitante,
      ud.NombreCompleto AS NombreDespachador,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      s.Estado AS EstadoSolicitud,
      (SELECT COUNT(*) FROM DetalleDespachos dd WHERE dd.IdDespacho = d.IdDespacho) AS ItemsDespachados
    FROM Despachos d
    JOIN SolicitudesMaterial s ON d.IdSolicitud = s.IdSolicitud
    JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
    JOIN Usuarios ud ON d.IdUsuarioDespacha = ud.IdUsuario
    LEFT JOIN Areas a ON s.IdArea = a.IdArea
    ORDER BY d.FechaDespacho DESC
  `;
  
  const result = await pool.request().query(query);
  return result.recordset;
}

export async function obtenerSolicitudParaDespacho(id: number): Promise<SolicitudDespachoDetalle | null> {
  const pool = await getPool();
  
  // Obtener cabecera
  const queryCabecera = `
    SELECT 
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.FechaSolicitud,
      u.NombreCompleto AS NombreSolicitante,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      s.IdArea,
      s.IdCentroCosto,
      cc.Codigo AS CentroCostoCodigo,
      cc.Codigo AS CodigoCuenta,
      COALESCE(cc.Codigo, cc.Nombre) AS CodigoCentroCosto,
      s.Estado,
      (SELECT COUNT(*) FROM DetalleSolicitudesMaterial d WHERE d.IdSolicitud = s.IdSolicitud) AS ItemsTotal
    FROM SolicitudesMaterial s
    JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
    LEFT JOIN Areas a ON (s.IdArea IS NOT NULL AND s.IdArea = a.IdArea) OR (s.IdArea IS NULL AND s.Area = a.Nombre)
    LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
    WHERE s.IdSolicitud = @Id
  `;
  
  const cabeceraResult = await pool.request()
    .input('Id', sql.Int, id)
    .query(queryCabecera);
    
  if (cabeceraResult.recordset.length === 0) return null;
  const cabecera = cabeceraResult.recordset[0];

  // Si no tenemos Código de Centro de Costo en cabecera, intentamos buscarlo en detalle (fallback)
  if (!cabecera.CodigoCentroCosto) {
      const detalleAreaResult = await pool.request()
      .input('Id', sql.Int, id)
      .query(`
        SELECT TOP 1 
          cc.Codigo AS CentroCostoCodigo
        FROM DetalleSolicitudesMaterial d
        JOIN Areas a ON d.IdArea = a.IdArea
        JOIN CentrosCosto cc ON a.IdCentroCosto = cc.IdCentroCosto
        WHERE d.IdSolicitud = @Id AND d.IdArea IS NOT NULL
      `);
      if (detalleAreaResult.recordset.length > 0) {
        cabecera.CentroCostoCodigo = detalleAreaResult.recordset[0].CentroCostoCodigo;
        cabecera.CodigoCentroCosto = detalleAreaResult.recordset[0].CentroCostoCodigo; // legacy compat
      }
  }

  // Si la solicitud/área NO tienen centro de costo, en este modelo el "Código de cuenta" puede venir
  // desde AreaRecursoCuenta (por IdArea). Esto cubre casos como tu ejemplo: Solicitud.IdCentroCosto=NULL
  // y Areas.IdCentroCosto=NULL, pero AreaRecursoCuenta sí tiene CodigoCuenta.
  if (!cabecera.CodigoCuenta) {
    // 1) Intentar por el IdArea de cabecera (si vino)
    if (cabecera.IdArea) {
      const cuentaPorArea = await pool.request()
        .input('IdArea', sql.Int, cabecera.IdArea)
        .query(`
          SELECT TOP 1 arc.CodigoCuenta
          FROM AreaRecursoCuenta arc
          WHERE arc.IdArea = @IdArea
            AND arc.IdRecurso = 1
            AND ISNULL(arc.Activo, 1) = 1
            AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta,''))) <> ''
          ORDER BY arc.IdAreaRecursoCuenta DESC
        `);
      let codigo = cuentaPorArea.recordset?.[0]?.CodigoCuenta;

      // Fallback: cualquier cuenta activa por área
      if (!codigo) {
        const cuentaPorAreaAny = await pool.request()
          .input('IdArea', sql.Int, cabecera.IdArea)
          .query(`
            SELECT TOP 1 arc.CodigoCuenta
            FROM AreaRecursoCuenta arc
            WHERE arc.IdArea = @IdArea
              AND ISNULL(arc.Activo, 1) = 1
              AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta,''))) <> ''
            ORDER BY arc.IdAreaRecursoCuenta DESC
          `);
        codigo = cuentaPorAreaAny.recordset?.[0]?.CodigoCuenta;
      }

      if (codigo) {
        cabecera.CodigoCuenta = codigo;
      }
    }

    // 2) Fallback: si no hay IdArea en cabecera, intentar por el primer IdArea del detalle
    if (!cabecera.CodigoCuenta) {
      const cuentaPorDetalleArea = await pool.request()
        .input('Id', sql.Int, id)
        .query(`
          SELECT TOP 1 arc.CodigoCuenta
          FROM DetalleSolicitudesMaterial d
          JOIN AreaRecursoCuenta arc ON arc.IdArea = d.IdArea
          WHERE d.IdSolicitud = @Id
            AND d.IdArea IS NOT NULL
            AND arc.IdRecurso = 1
            AND ISNULL(arc.Activo, 1) = 1
            AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta,''))) <> ''
          ORDER BY arc.IdAreaRecursoCuenta DESC
        `);
      let codigo = cuentaPorDetalleArea.recordset?.[0]?.CodigoCuenta;

      // Fallback: cualquier cuenta activa por el área del detalle
      if (!codigo) {
        const cuentaPorDetalleAreaAny = await pool.request()
          .input('Id', sql.Int, id)
          .query(`
            SELECT TOP 1 arc.CodigoCuenta
            FROM DetalleSolicitudesMaterial d
            JOIN AreaRecursoCuenta arc ON arc.IdArea = d.IdArea
            WHERE d.IdSolicitud = @Id
              AND d.IdArea IS NOT NULL
              AND ISNULL(arc.Activo, 1) = 1
              AND LTRIM(RTRIM(ISNULL(arc.CodigoCuenta,''))) <> ''
            ORDER BY arc.IdAreaRecursoCuenta DESC
          `);
        codigo = cuentaPorDetalleAreaAny.recordset?.[0]?.CodigoCuenta;
      }

      if (codigo) {
        cabecera.CodigoCuenta = codigo;
      }
    }
  }

  // Obtener detalle con stock actual
  const queryDetalle = `
    SELECT 
      d.IdDetalleSolicitud,
      d.IdMaterial,
      m.NumeroArticulo AS Codigo,
      m.DescripcionArticulo AS Descripcion,
      m.UnidadMedida,
      d.CantidadSolicitada,
      ISNULL(d.CantidadAprobada, 0) AS CantidadAprobada,
      (d.CantidadSolicitada - ISNULL(d.CantidadAprobada, 0)) AS CantidadPendiente,
      ISNULL(sa.EnStock, 0) AS EnStock
    FROM DetalleSolicitudesMaterial d
    JOIN Materiales m ON d.IdMaterial = m.IdMaterial
    LEFT JOIN StockActual sa ON m.IdMaterial = sa.IdMaterial
    WHERE d.IdSolicitud = @Id
  `;

  const detalleResult = await pool.request()
    .input('Id', sql.Int, id)
    .query(queryDetalle);

  // Fallback adicional: si no hubo centro de costo en cabecera, intentar resolverlo vía el idCentroCosto directo
  // (en algunos entornos el vínculo cabezal/área no existe pero la solicitud sí tiene IdCentroCosto)
  if (!cabecera.CentroCostoCodigo && cabecera.IdCentroCosto) {
    const ccById = await pool.request()
      .input('IdCC', sql.Int, cabecera.IdCentroCosto)
      .query(`SELECT Codigo FROM CentrosCosto WHERE IdCentroCosto = @IdCC`);
    const codigo = ccById.recordset?.[0]?.Codigo;
    if (codigo) {
      cabecera.CentroCostoCodigo = codigo;
      cabecera.CodigoCentroCosto = codigo;
    }
  }

  return {
    cabecera,
    detalle: detalleResult.recordset
  };
}

export async function registrarDespacho(input: {
  idSolicitud: number;
  observaciones: string;
  detalle: { idDetalleSolicitud: number; cantidadDespachada: number }[];
  idUsuario?: number;
}) {
  try {
    // Validaciones de entrada (rápidas)
    if (!input?.idSolicitud || !Number.isFinite(input.idSolicitud)) {
      const e: any = new Error('IdSolicitud inválido');
      e.statusCode = 400;
      throw e;
    }
    if (!Array.isArray(input.detalle) || input.detalle.length === 0) {
      const e: any = new Error('El despacho debe contener al menos una línea');
      e.statusCode = 400;
      throw e;
    }

    const normalizado = input.detalle.map((d) => ({
      idDetalleSolicitud: Number(d.idDetalleSolicitud),
      cantidadDespachada: Number(d.cantidadDespachada),
    }));

    for (const d of normalizado) {
      if (!Number.isFinite(d.idDetalleSolicitud) || d.idDetalleSolicitud <= 0) {
        const e: any = new Error('idDetalleSolicitud inválido');
        e.statusCode = 400;
        throw e;
      }
      if (!Number.isFinite(d.cantidadDespachada) || d.cantidadDespachada <= 0) {
        const e: any = new Error('La cantidad a despachar debe ser mayor que cero');
        e.statusCode = 400;
        throw e;
      }
    }

    // Validación de negocio contra BD (antes de la transacción)
    const pool = await getPool();
    const detalleDbResult = await pool.request()
      .input('IdSolicitud', sql.Int, input.idSolicitud)
      .query(`
        SELECT 
          d.IdDetalleSolicitud,
          d.IdMaterial,
          d.CantidadSolicitada,
          ISNULL(d.CantidadAprobada, 0) AS CantidadDespachadaAnterior,
          ISNULL(sa.EnStock, 0) AS EnStock
        FROM DetalleSolicitudesMaterial d
        LEFT JOIN StockActual sa ON d.IdMaterial = sa.IdMaterial
        WHERE d.IdSolicitud = @IdSolicitud
      `);

    const detalleDb: Array<{ IdDetalleSolicitud: number; IdMaterial: number; CantidadSolicitada: number; CantidadDespachadaAnterior: number; EnStock: number }> = detalleDbResult.recordset;
    const mapDb = new Map<number, { solicitada: number; despachadaAnterior: number; enStock: number }>();
    for (const row of detalleDb) {
      mapDb.set(row.IdDetalleSolicitud, {
        solicitada: Number(row.CantidadSolicitada ?? 0),
        despachadaAnterior: Number(row.CantidadDespachadaAnterior ?? 0),
        enStock: Number(row.EnStock ?? 0),
      });
    }

    // Validaciones de negocio por línea
    for (const d of normalizado) {
      const row = mapDb.get(d.idDetalleSolicitud);
      if (!row) {
        const e: any = new Error(`El ítem ${d.idDetalleSolicitud} no pertenece a la solicitud ${input.idSolicitud}`);
        e.statusCode = 400;
        throw e;
      }

      if (d.cantidadDespachada > (row.solicitada - row.despachadaAnterior)) {
        const e: any = new Error(`La cantidad ${d.cantidadDespachada} excede el saldo pendiente (${row.solicitada - row.despachadaAnterior}) para la línea ${d.idDetalleSolicitud}`);
        e.statusCode = 409;
        throw e;
      }

      if (d.cantidadDespachada > row.enStock) {
        const e: any = new Error(`Stock insuficiente (${row.enStock}) para la línea ${d.idDetalleSolicitud}`);
        e.statusCode = 409;
        throw e;
      }
    }

    // Crear la tabla temporal para pasar al SP
    const tvp = new sql.Table('dbo.TDetalleDespacho');
    tvp.columns.add('IdDetalleSolicitud', sql.Int);
    tvp.columns.add('CantidadDespachada', sql.Decimal(18, 4));

    for (const item of normalizado) {
      tvp.rows.add(item.idDetalleSolicitud, item.cantidadDespachada);
    }

    // Llamar al Stored Procedure
    const request = pool.request();
    request.input('IdSolicitud', sql.Int, input.idSolicitud);
    request.input('IdUsuarioDespacha', sql.Int, input.idUsuario || 1); 
    request.input('Observaciones', sql.NVarChar(500), input.observaciones || '');
    request.input('Detalle', tvp);

    const spResult = await request.execute('dbo.sp_RegistrarDespacho');
    
    // Obtenemos los resultados del SP
    const nuevoEstado = spResult.recordset[0]?.NuevoEstado || 'DESPACHADA';
    const idDespachoGenerado = spResult.recordset[0]?.IdDespachoGenerado;

    // Recuperar información para la respuesta (útil para impresión o refresco inmediato)
    const pool2 = await getPool();
    
    // 1. Obtener Centro de Costo / Cuenta
    const cabeceraResult = await pool2.request()
      .input('Id', sql.Int, input.idSolicitud)
      .query(`
        SELECT 
           s.IdCentroCosto,
           cc.Codigo AS CodigoCentroCosto,
           s.IdArea AS IdAreaCabecera,
           a.Nombre AS AreaNombre,
           (SELECT TOP 1 arc.CodigoCuenta 
            FROM AreaRecursoCuenta arc 
            WHERE arc.IdArea = s.IdArea AND arc.IdRecurso = 1 AND ISNULL(arc.Activo, 1) = 1) AS CodigoCuentaArea
        FROM SolicitudesMaterial s
        LEFT JOIN Areas a ON s.IdArea = a.IdArea
        LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
        WHERE s.IdSolicitud = @Id
      `);
    
    const rowCabCtx = cabeceraResult.recordset[0];
    const codigoCCO = rowCabCtx?.CodigoCentroCosto || rowCabCtx?.CodigoCuentaArea || '';

    // 2. Obtener el detalle específico que se acaba de despachar (para el reporte de entrega)
    const detalleDespachoResult = await pool2.request()
      .input('IdDespacho', sql.Int, idDespachoGenerado)
      .query(`
        SELECT 
          m.NumeroArticulo AS Codigo,
          m.DescripcionArticulo AS Descripcion,
          m.UnidadMedida,
          dd.CantidadDespachada
        FROM DetalleDespachos dd
        JOIN Materiales m ON dd.IdMaterial = m.IdMaterial
        WHERE dd.IdDespacho = @IdDespacho
      `);

    return {
      despacho: {
        CodigoDespacho: `DESP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${idDespachoGenerado}`,
        FechaDespacho: new Date().toISOString(),
        CodigoCentroCosto: codigoCCO,
        CodigoCuenta: codigoCCO,
        Estado: nuevoEstado,
        IdDespacho: idDespachoGenerado
      },
      detalle: detalleDespachoResult.recordset,
      idDespachoGenerado: idDespachoGenerado
    };

  } catch (error) {
    console.error('Error en registrarDespacho service:', error);
    throw error;
  }
}

// Métrica: contar despachos registrados hoy usando Auditoría
export async function contarDespachosHoy(): Promise<number> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT COUNT(*) AS Conteo
    FROM Despachos
    WHERE CONVERT(date, FechaDespacho) = CONVERT(date, GETDATE())
  `);
  return result.recordset[0]?.Conteo ?? 0;
}

export async function generarPdfDespacho(idDespacho: number): Promise<PassThrough> {
  const pool = await getPool();

  // 1. Obtener datos del despacho
  const query = `
    SELECT 
      d.IdDespacho,
      d.FechaDespacho,
      d.Observaciones,
      s.CodigoSolicitud,
      s.FechaSolicitud,
      u_sol.NombreCompleto AS NombreSolicitante,
      u_desp.NombreCompleto AS NombreDespachador,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      COALESCE(
        cc.Codigo, 
        a.Codigo,
        (SELECT TOP 1 arc.CodigoCuenta 
         FROM AreaRecursoCuenta arc 
         WHERE arc.IdArea = s.IdArea AND arc.IdRecurso = 1 AND ISNULL(arc.Activo, 1) = 1)
      ) AS CodigoCC,
      s.IdArea
    FROM Despachos d
    JOIN SolicitudesMaterial s ON d.IdSolicitud = s.IdSolicitud
    JOIN Usuarios u_sol ON s.IdSolicitante = u_sol.IdUsuario
    JOIN Usuarios u_desp ON d.IdUsuarioDespacha = u_desp.IdUsuario
    LEFT JOIN Areas a ON s.IdArea = a.IdArea
    LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
    WHERE d.IdDespacho = @idDespacho
  `;

  const cabeceraResult = await pool.request()
    .input('idDespacho', sql.Int, idDespacho)
    .query(query);

  if (cabeceraResult.recordset.length === 0) {
    throw new Error('Despacho no encontrado');
  }

  const cab = cabeceraResult.recordset[0];

  // 1.1 Obtener los centros de costo y cuentas de los materiales (usando el IdArea del despacho)
  const queryCcoMateriales = `
    SELECT 
      m.IdMaterial,
      arc.CodigoCuenta
    FROM DetalleDespachos dd
    JOIN Materiales m ON dd.IdMaterial = m.IdMaterial
    LEFT JOIN AreaRecursoCuenta arc ON arc.IdArea = @idArea 
      AND arc.IdRecurso = 1 
      AND ISNULL(arc.Activo, 1) = 1
    WHERE dd.IdDespacho = @idDespacho
  `;

  const ccoResult = await pool.request()
    .input('idDespacho', sql.Int, idDespacho)
    .input('idArea', sql.Int, cab.IdArea)
    .query(queryCcoMateriales);
  
  const mapCco = new Map();
  ccoResult.recordset.forEach(r => mapCco.set(r.IdMaterial, r.CodigoCuenta));

  const queryDetalle = `
    SELECT 
      m.IdMaterial,
      m.NumeroArticulo AS Codigo,
      m.DescripcionArticulo AS Descripcion,
      m.UnidadMedida,
      dd.CantidadDespachada,
      arc.CodigoCuenta AS CodigoCuentaLinea,
      COALESCE(a_det.Nombre, s.Area) AS ActividadLinea
    FROM DetalleDespachos dd
    JOIN Materiales m ON dd.IdMaterial = m.IdMaterial
    JOIN Despachos d_det ON dd.IdDespacho = d_det.IdDespacho
    JOIN SolicitudesMaterial s ON d_det.IdSolicitud = s.IdSolicitud
    LEFT JOIN DetalleSolicitudesMaterial dsm ON dsm.IdSolicitud = s.IdSolicitud AND dsm.IdMaterial = m.IdMaterial
    LEFT JOIN Areas a_det ON a_det.IdArea = COALESCE(dsm.IdArea, s.IdArea)
    LEFT JOIN MaterialRecurso mr ON mr.IdMaterial = m.IdMaterial AND mr.Activo = 1
    LEFT JOIN AreaRecursoCuenta arc ON arc.IdArea = a_det.IdArea 
      AND arc.IdRecurso = mr.IdRecurso 
      AND ISNULL(arc.Activo, 1) = 1
    WHERE dd.IdDespacho = @idDespacho
  `;

  const detalleResult = await pool.request()
    .input('idDespacho', sql.Int, idDespacho)
    .query(queryDetalle);

  const detalle = detalleResult.recordset;

  // 2. Crear documento PDF (A4 - Orientación Horizontal para 2 copias por página)
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margins: { top: 10, bottom: 10, left: 20, right: 20 },
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  // --- 0) CONFIGURACIÓN GLOBAL ---
  doc.lineWidth(0.5);
  const left = 20;
  const right = doc.page.width - 20;
  const contentW = right - left;

  const strokeBox = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).stroke();
  const fillStrokeBox = (x: number, y: number, w: number, h: number, color = "#F3F4F6") => {
    doc.save().fillColor(color).rect(x, y, w, h).fill().restore();
    doc.rect(x, y, w, h).stroke();
  };
  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("es-NI") : "";

  // Función interna para dibujar una copia de la requisa
  const dibujarRequisa = (startY: number) => {
    // --- 1) ENCABEZADO Y LOGO ---
    const logoX = left;
    const logoY = startY;
    
    const posiblesRutas = [
      path.join(process.cwd(), "backend", "public", "logo.png"),
      path.join(process.cwd(), "public", "logo.png"),
      path.join(process.cwd(), "backend", "public", "logo_extraceite.png"),
      path.join(process.cwd(), "public", "logo_extraceite.png")
    ];

    let logoFinalPath = null;
    for (const ruta of posiblesRutas) {
      if (fs.existsSync(ruta)) {
        logoFinalPath = ruta;
        break;
      }
    }

    const logoW = 45;
    const logoImgX = right - 52; // mover 10pt más a la izquierda (antes right - 42)

    if (logoFinalPath) {
      try {
        doc.image(logoFinalPath, logoImgX, logoY, { width: logoW });
      } catch (err) { dibujarLogoPlaceholder(doc, logoImgX, logoY); }
    } else { dibujarLogoPlaceholder(doc, logoImgX, logoY); }

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000");
    doc.text("REQUISA SALIDA DE BODEGA EXTRACEITE", left, startY + 15, { align: "left" });
    
    // Texto Extraceite debajo del logo (dar más espacio para evitar que haga wrap)
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    const logoTextX = Math.max(logoImgX - 15, left);
    const logoTextW = Math.min(logoW + 30, contentW - (logoTextX - left));
    doc.text("Extraceite", logoTextX, startY + 50, { width: logoTextW, align: "center" });
    
    // --- 2) INFORMACIÓN GENERAL ---

    const infoY = startY + 55;
    const tableInfoW = 160;
    const tableInfoH = 34;

    strokeBox(left, infoY, tableInfoW, tableInfoH);
    doc.moveTo(left, infoY + 17).lineTo(left + tableInfoW, infoY + 17).stroke();
    doc.moveTo(left + 60, infoY).lineTo(left + 60, infoY + tableInfoH).stroke();

    doc.font("Helvetica-Bold").fontSize(8);
    doc.text("FECHA", left + 5, infoY + 5);
    doc.text("SOLICITUD N°", left + 5, infoY + 22);

    doc.font("Helvetica").fontSize(8);
    doc.text(fmtDate(cab?.FechaDespacho), left + 65, infoY + 5);
    doc.text(cab?.CodigoSolicitud || "", left + 65, infoY + 22);

    // --- 3) TABLA DE ITEMS ---
    const tableY = infoY + 45;
    const headerH = 20;
    // Altura de fila ~8mm (PDFKit usa puntos: 1pt ≈ 0.3528mm)
    const rowH = 23;
    const rowsCount = 9; // Reducido a 9 campos en total

    // Ajuste de anchos para que CCO no quede demasiado angosto (evita que el código se parta en vertical)
    const wCodigo = 60;
    const wUM = 60;
    const wCant = 60;
    const wAct = 120;
    const wCCO = 70;
    const wDesc = contentW - (wCodigo + wUM + wCant + wAct + wCCO);

    const xCodigo = left;
    const xDesc = xCodigo + wCodigo;
    const xUM = xDesc + wDesc;
    const xCant = xUM + wUM;
    const xAct = xCant + wCant;
    const xCCO = xAct + wAct;

    // Encabezados
    fillStrokeBox(left, tableY, contentW, headerH, "#FFFFFF"); // Fondo blanco
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
    const hY = tableY + 6;
    doc.text("CODIGO", xCodigo, hY, { width: wCodigo, align: "center" });
    doc.text("DESCRIPCION DEL MATERIAL", xDesc, hY, { width: wDesc, align: "center" });
    doc.text("U/MEDIDA", xUM, hY, { width: wUM, align: "center" });
    doc.text("CANTIDAD", xCant, hY, { width: wCant, align: "center" });
    doc.text("ACTIVIDAD", xAct, hY, { width: wAct, align: "center" });
    doc.text("CCO", xCCO, hY, { width: wCCO, align: "center" });

    // Cuerpo de la tabla
    doc.font("Helvetica").fontSize(8);
    for (let i = 0; i < rowsCount; i++) {
        const curY = tableY + headerH + (i * rowH);
        
        // Dibujar cuadro de la fila (rectángulo completo con bordes)
        doc.rect(left, curY, contentW, rowH).stroke();

        // Líneas verticales divisorias
        [xDesc, xUM, xCant, xAct, xCCO].forEach(x => {
            doc.moveTo(x, curY).lineTo(x, curY + rowH).stroke();
        });

      const it = detalle[i];
      if (it) {
        const textY = curY + (rowH / 2) - 4; // Centrado vertical manual aproximado
        doc.text(String(it.Codigo || ""), xCodigo, textY, { width: wCodigo, align: "center" });
        doc.text(String(it.Descripcion || "").substring(0, 70), xDesc + 5, textY - 2, { width: wDesc - 10, align: "left" });
        doc.text(String(it.UnidadMedida || ""), xUM, textY, { width: wUM, align: "center" });
        doc.text(String(it.CantidadDespachada || ""), xCant, textY, { width: wCant, align: "center" });
        
        const act = (it.ActividadLinea || cab?.AreaNombre || "").substring(0, 45);
        doc.text(act, xAct + 2, textY - 2, { width: wAct - 4, align: "center" });
        
        const cco = it.CodigoCuentaLinea || cab?.CodigoCC || "";
        doc.text(String(cco), xCCO, textY, { width: wCCO, align: "center" });
      }
    }

    // --- 4) PIE DE PÁGINA (HORAS Y FIRMAS) ---
    const footerY = tableY + headerH + (rowsCount * rowH) + 15;
    
    // Observaciones
    doc.font("Helvetica").fontSize(9).fillColor("#000");
    doc.text("OBSERVACIONES:", left, footerY);
    const obsX = left + 90;
    doc.moveTo(obsX, footerY + 10).lineTo(right, footerY + 10).stroke();
    const obsTxt = String(cab?.Observaciones || "").trim();
    if (obsTxt) {
      doc.font("Helvetica").fontSize(8).fillColor("#000");
      doc.text(obsTxt.substring(0, 140), obsX + 3, footerY + 2, { width: right - (obsX + 3), align: "left" });
    }

    const signY = footerY + 80; // Más espacio para firmas
    const signW = 160;
    const gap = (contentW - (signW * 3)) / 2;

    // Firmas con la estructura solicitada
    doc.font("Helvetica").fontSize(8).fillColor("#000");
    
    // Entrega bodega
    doc.moveTo(left, signY).lineTo(left + signW, signY).stroke();
    doc.text("Entrega bodega\nNombre y firma", left, signY + 5, { width: signW, align: "center" });

    // Retirado por
    doc.moveTo(left + signW + gap, signY).lineTo(left + signW * 2 + gap, signY).stroke();
    doc.text("Retirado por\nNombre y firma", left + signW + gap, signY + 5, { width: signW, align: "center" });

    // Autorizado por / Nombre del Ingeniero
    doc.moveTo(right - signW, signY).lineTo(right, signY).stroke();
    doc.text("Autorizado por\nNombre del Ingeniero", right - signW, signY + 5, { width: signW, align: "center" });

    // Folio Number Red (evitar sobreposición con firmas; ubicar al pie derecho)
    const folioY = doc.page.height - 70;
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#000");
    doc.text("N°", right - 115, folioY + 2, { width: 30, align: "left" });
    doc.font("Helvetica").fontSize(22).fillColor("#D32F2F");
    const numFolio = String(cab?.IdDespacho ?? idDespacho).padStart(5, "0");
    doc.text(numFolio, right - 85, folioY, { width: 85, align: "right" });

    // FR-F-BD-025
    doc.font("Helvetica").fontSize(8).fillColor("#000");
    doc.text("FR-F-BD-025", left, footerY + 15);

  };

  // Dibujar copia única
  dibujarRequisa(20);

  doc.end();
  return stream;
}


/**
 * Dibuja un logo de respaldo (gota/hoja) si no se encuentra la imagen.
 */
function dibujarLogoPlaceholder(doc: any, x: number, y: number) {
  doc.save()
     .path(`M ${x + 30} ${y + 5} Q ${x + 50} ${y + 25} ${x + 30} ${y + 35} Q ${x + 10} ${y + 25} ${x + 30} ${y + 5} Z`)
     .fillAndStroke("#333", "#333")
     .restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
  doc.text("Extraceite", x, y + 40, { width: 60, align: "center" });
}
