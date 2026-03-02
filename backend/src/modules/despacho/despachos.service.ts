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
      dd.CantidadDespachada
    FROM DetalleDespachos dd
    JOIN Materiales m ON dd.IdMaterial = m.IdMaterial
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
    margins: { top: 20, bottom: 20, left: 30, right: 30 },
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  // --- 0) CONFIGURACIÓN GLOBAL ---
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

  // Función interna para dibujar una copia de la requisa
  const dibujarRequisa = (startY: number) => {
    // --- 1) TÍTULO ---
    doc.font("Times-Roman").fontSize(15).fillColor("black");
    doc.text("REQUISA SALIDA DE BODEGA  EXTRACEITE", left, startY, { characterSpacing: 0.5 });

    // --- 2) LOGO (DERECHA) ---
    const logoX = right - 70;
    const logoY = startY - 10;
    
    const posiblesRutas = [
      path.join(process.cwd(), "backend", "public", "logo.png"),
      path.join(process.cwd(), "public", "logo.png"),
      path.join(__dirname, "..", "..", "..", "public", "logo.png"),
      path.join(process.cwd(), "backend", "public", "ic_launcher.png"),
      path.join(process.cwd(), "public", "ic_launcher.png")
    ];

    let logoFinalPath = null;
    for (const ruta of posiblesRutas) {
      if (fs.existsSync(ruta)) {
        logoFinalPath = ruta;
        break;
      }
    }

    if (logoFinalPath) {
      try {
        doc.image(logoFinalPath, logoX , logoY, { width: 60 });
      } catch (err) {
        dibujarLogoPlaceholder(doc, logoX, logoY);
      }
    } else {
      dibujarLogoPlaceholder(doc, logoX, logoY);
    }

    // --- 3) CAJAS FECHA / SOLICITUD N° ---
    const boxY = startY + 25;
    const colLabelW = 75;
    const colValueW = 110;
    const rowHBox = 16;

    fillStrokeBox(left, boxY, colLabelW, rowHBox);
    strokeBox(left + colLabelW, boxY, colValueW, rowHBox);
    fillStrokeBox(left, boxY + rowHBox, colLabelW, rowHBox);
    strokeBox(left + colLabelW, boxY + rowHBox, colValueW, rowHBox);

    doc.font("Helvetica").fontSize(8).fillColor("#000");
    doc.text("FECHA", left + 5, boxY + 5);
    doc.text("SOLICITUD N°", left + 5, boxY + rowHBox + 5);

    doc.font("Helvetica").fontSize(9);
    doc.text(fmtDate(cab?.FechaDespacho), left + colLabelW + 5, boxY + 5);
    doc.text(String(cab?.CodigoSolicitud || ""), left + colLabelW + 5, boxY + rowHBox + 5);

    // --- 4) TABLA DE ITEMS ---
    const tableY = boxY + (rowHBox * 2) + 12;
    const headerH = 20;
    const rowHTable = 25;

    const wCodigo = 55;
    const wDesc = 205;
    const wUM = 50;
    const wCant = 50;
    const wAct = 100;
    const wCCO = contentW - (wCodigo + wDesc + wUM + wCant + wAct);

    const xCodigo = left;
    const xDesc = xCodigo + wCodigo;
    const xUM = xDesc + wDesc;
    const xCant = xUM + wUM;
    const xAct = xCant + wCant;
    const xCCO = xAct + wAct;

    fillStrokeBox(left, tableY, contentW, headerH);
    doc.font("Helvetica").fontSize(9).fillColor("#000");
    doc.text("CODIGO", xCodigo, tableY + 6, { width: wCodigo, align: "center" });
    doc.text("DESCRIPCION DEL MATERIAL", xDesc, tableY + 6, { width: wDesc, align: "center" });
    doc.text("U/MEDIDA", xUM, tableY + 6, { width: wUM, align: "center" });
    doc.text("CANTIDAD", xCant, tableY + 6, { width: wCant, align: "center" });
    doc.text("ACTIVIDAD", xAct, tableY + 6, { width: wAct, align: "center" });
    doc.text("CODIGO DE CUENTA", xCCO, tableY + 6, { width: wCCO, align: "center" });

    const rowsLimit = 10;
    const tableH = headerH + (rowsLimit * rowHTable);
    strokeBox(left, tableY, contentW, tableH);

    // Líneas Verticales
    [xDesc, xUM, xCant, xAct, xCCO].forEach(x => {
        doc.moveTo(x, tableY).lineTo(x, tableY + tableH).stroke();
    });

    // Líneas Horizontales y Datos
    doc.font("Helvetica").fontSize(9).fillColor("black");
    for (let i = 0; i < rowsLimit; i++) {
      const y = tableY + headerH + (i * rowHTable);
      doc.moveTo(left, y).lineTo(left + contentW, y).stroke();
      
      const it = detalle && detalle[i];
      if (it) {
        const rowTextY = y + 7;
        const itemCco = mapCco?.get(it.IdMaterial) || cab?.CodigoCuenta || '-';
        
        doc.text(String(it.Codigo || ""), xCodigo + 2, rowTextY, { width: wCodigo - 4, align: "center" });
        
        // REPARACIÓN DESCRIPCIÓN: Control de altura y elipsis para evitar desborde
        doc.text(String(it.Descripcion || ""), xDesc + 4, rowTextY - 2, { 
          width: wDesc - 8, 
          height: rowHTable - 4,
          ellipsis: true,
          align: "left",
          lineGap: -2
        });

        doc.text(String(it.UnidadMedida || ""), xUM + 2, rowTextY, { width: wUM - 4, align: "center" });
        doc.text(String(it.CantidadDespachada ?? ""), xCant + 2, rowTextY, { width: wCant - 4, align: "center" });
        
        const actividadText = String(cab?.AreaNombre || "").split(' - ').pop() || "";
        doc.text(actividadText, xAct + 2, rowTextY - 1, { width: wAct - 4, align: "center", lineGap: -2 });
        
        doc.text(String(itemCco), xCCO + 2, rowTextY, { width: wCCO - 4, align: "center" });
      }
    }

    // --- 5) OBSERVACIONES Y PIE ---
    const obsY = tableY + tableH + 10;
    doc.font("Helvetica").fontSize(9).fillColor("#000");
    doc.text("OBSERVACIONES: ", left, obsY);
    const lineObsStartX = left + 90;
    doc.moveTo(lineObsStartX, obsY + 10).lineTo(right, obsY + 10).stroke();
    if (cab?.Observaciones) {
      doc.text(String(cab.Observaciones), lineObsStartX + 5, obsY, { width: contentW - 95 });
    }

    const formCodeY = obsY + 15;
    doc.font("Helvetica").fontSize(7).fillColor("#555");
    doc.text("FR-F-BD-025", left, formCodeY);

    // --- 6) FIRMAS ---
    const signY = formCodeY + 45;
    const signW = 125;
    const sig1X = left + 10;
    const sig2X = left + (contentW / 2) - (signW / 2);
    const sig3X = right - signW - 75;

    [sig1X, sig2X, sig3X].forEach(x => {
        doc.moveTo(x, signY).lineTo(x + signW, signY).stroke();
    });

    doc.font("Helvetica").fontSize(8).fillColor("#333");
    doc.text("Entrega bodega\nNombre y firma", sig1X, signY + 5, { width: signW, align: "center" });
    doc.text("Retirado por\nNombre y firma", sig2X, signY + 5, { width: signW, align: "center" });
    doc.text("Autorizado por\nNombre del Ingeniero", sig3X, signY + 5, { width: signW, align: "center" });

    // Correlativo Rojo 
    const numX = right - 80;
    const numY = signY + 15;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("black");
    doc.text("N°", numX, numY);
    doc.font("Helvetica").fontSize(15).fillColor("#D32F2F");
    doc.text(String(cab?.IdDespacho ?? "").padStart(5, "0"), numX + 25, numY - 2);
  };

  // Dibujar única copia (Arriba)
  dibujarRequisa(10);

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
