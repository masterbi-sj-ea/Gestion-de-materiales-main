import sql from 'mssql';
import { getPool } from '../../config/db';
import { callSpOne } from '../../infra/spCaller';

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
      CASE WHEN s.Estado = 'APROBADA' THEN 'LISTA_PARA_DESPACHO' ELSE 'NO_LISTA' END AS EstadoDespacho,
      CASE WHEN s.Estado = 'APROBADA' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS ListaParaDespachar,
      CASE WHEN s.Estado = 'APROBADA' THEN 'Aprobada y lista para despacho' ELSE 'No lista para despacho' END AS EstadoDespachoLabel,
      (SELECT COUNT(*) FROM DetalleSolicitudesMaterial d WHERE d.IdSolicitud = s.IdSolicitud) AS ItemsTotal
    FROM SolicitudesMaterial s
    JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
    LEFT JOIN Areas a ON s.IdArea = a.IdArea
    WHERE s.Estado = 'APROBADA'
    ORDER BY s.FechaSolicitud DESC
  `;
  
  const result = await pool.request().query(query);
  return result.recordset;
}

export async function listarSolicitudesDespachadas(): Promise<DespachoPendiente[]> {
  const pool = await getPool();
  // Historial: incluye DESPACHADA y DESPACHADA_PARCIAL
  const query = `
    SELECT 
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.FechaSolicitud,
      u.NombreCompleto AS NombreSolicitante,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      s.Estado,
      (SELECT COUNT(*) FROM DetalleSolicitudesMaterial d WHERE d.IdSolicitud = s.IdSolicitud) AS ItemsTotal
    FROM SolicitudesMaterial s
    JOIN Usuarios u ON s.IdSolicitante = u.IdUsuario
    LEFT JOIN Areas a ON s.IdArea = a.IdArea
    WHERE s.Estado IN ('DESPACHADA', 'DESPACHADA_PARCIAL')
    ORDER BY s.FechaSolicitud DESC
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
      d.CantidadAprobada,
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
  detalle: { idMaterial: number; cantidadDespachada: number }[];
}) {
  const transaction = new sql.Transaction(await getPool());
  
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
      idMaterial: Number(d.idMaterial),
      cantidadDespachada: Number(d.cantidadDespachada),
    }));

    for (const d of normalizado) {
      if (!Number.isFinite(d.idMaterial) || d.idMaterial <= 0) {
        const e: any = new Error('IdMaterial inválido');
        e.statusCode = 400;
        throw e;
      }
      if (!Number.isFinite(d.cantidadDespachada) || d.cantidadDespachada <= 0) {
        const e: any = new Error('La cantidad a despachar debe ser mayor que cero');
        e.statusCode = 400;
        throw e;
      }
    }

    // Evitar IDs duplicados en el payload
    const ids = normalizado.map((d) => d.idMaterial);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      const e: any = new Error('El detalle contiene materiales duplicados');
      e.statusCode = 400;
      throw e;
    }

    // Validación de negocio contra BD (antes de la transacción)
    const pool = await getPool();
    const detalleDbResult = await pool.request()
      .input('IdSolicitud', sql.Int, input.idSolicitud)
      .query(`
        SELECT 
          d.IdMaterial,
          d.CantidadSolicitada,
          ISNULL(d.CantidadAprobada, 0) AS CantidadAprobada,
          ISNULL(sa.EnStock, 0) AS EnStock
        FROM DetalleSolicitudesMaterial d
        LEFT JOIN StockActual sa ON d.IdMaterial = sa.IdMaterial
        WHERE d.IdSolicitud = @IdSolicitud
      `);

    const detalleDb: Array<{ IdMaterial: number; CantidadSolicitada: number; CantidadAprobada: number; EnStock: number }> = detalleDbResult.recordset;
    const mapDb = new Map<number, { solicitada: number; aprobada: number; enStock: number }>();
    for (const row of detalleDb) {
      mapDb.set(row.IdMaterial, {
        solicitada: Number(row.CantidadSolicitada ?? 0),
        aprobada: Number(row.CantidadAprobada ?? 0),
        enStock: Number(row.EnStock ?? 0),
      });
    }

    // 1) Todos los materiales del payload deben pertenecer a la solicitud
    for (const d of normalizado) {
      if (!mapDb.has(d.idMaterial)) {
        const e: any = new Error(`El material ${d.idMaterial} no pertenece a la solicitud ${input.idSolicitud}`);
        e.statusCode = 400;
        throw e;
      }
    }

    // 2) No debe exceder cantidad solicitada
    for (const d of normalizado) {
      const row = mapDb.get(d.idMaterial)!;
      const solicitada = row.solicitada;
      if (d.cantidadDespachada > solicitada) {
        const e: any = new Error(`Cantidad a despachar excede lo solicitado para el material ${d.idMaterial}`);
        e.statusCode = 409;
        throw e;
      }
    }

    await transaction.begin();
    
    // 1. Update Solicitud Status using SP (or manual update if we want to be safe inside transaction)
    // The SP does NOT handle transactions if called from inside a transaction usually unless named transaction issue.
    // We will do direct updates to ensure atomicity in this transaction block.

    // A. Actualizar CantidadAprobada (que usaremos como despachada) en DetalleSolicitudesMaterial
    for (const item of normalizado) {
      const request = new sql.Request(transaction);
      const updateDetalle = await request
        .input('Cant', sql.Decimal(18, 4), item.cantidadDespachada)
        .input('IdSolicitud', sql.Int, input.idSolicitud)
        .input('IdMaterial', sql.Int, item.idMaterial)
        .query(`
          UPDATE DetalleSolicitudesMaterial 
          SET CantidadAprobada = @Cant 
          WHERE IdSolicitud = @IdSolicitud AND IdMaterial = @IdMaterial
        `);

      if ((updateDetalle.rowsAffected?.[0] ?? 0) === 0) {
        const e: any = new Error(`No se encontró detalle de solicitud para material ${item.idMaterial}`);
        e.statusCode = 400;
        throw e;
      }

      // B. Actualizar Stock en StockActual (NO en Materiales)
      const reqStock = new sql.Request(transaction);
      const updateStock = await reqStock
        .input('Cant', sql.Decimal(18, 4), item.cantidadDespachada)
        .input('IdMaterial', sql.Int, item.idMaterial)
        .query(`
          UPDATE StockActual 
          SET EnStock = EnStock - @Cant 
          WHERE IdMaterial = @IdMaterial
            AND EnStock >= @Cant
        `);

      // Si no afectó filas, o no existía stockactual o no había stock suficiente
      const affected = updateStock.rowsAffected?.[0] ?? 0;
      if (affected === 0) {
        const e: any = new Error(`Stock insuficiente para el material ${item.idMaterial}`);
        e.statusCode = 409;
        throw e;
      }
    }

    // C. Calcular estado final (parcial/total) según cantidades despachadas vs solicitadas
    const dbAfterResult = await new sql.Request(transaction)
      .input('IdSolicitud', sql.Int, input.idSolicitud)
      .query(`
        SELECT 
          SUM(ISNULL(CantidadSolicitada,0)) AS TotalSolicitado,
          SUM(ISNULL(CantidadAprobada,0)) AS TotalDespachado
        FROM DetalleSolicitudesMaterial
        WHERE IdSolicitud = @IdSolicitud
      `);
    const totalSolicitado = Number(dbAfterResult.recordset?.[0]?.TotalSolicitado ?? 0);
    const totalDespachado = Number(dbAfterResult.recordset?.[0]?.TotalDespachado ?? 0);

    const nuevoEstado = (totalSolicitado > 0 && totalDespachado >= totalSolicitado)
      ? 'DESPACHADA'
      : 'DESPACHADA_PARCIAL';

    // D. Actualizar Cabecera
    const reqHeader = new sql.Request(transaction);
    await reqHeader
      .input('IdSolicitud', sql.Int, input.idSolicitud)
      .input('Estado', sql.VarChar(50), nuevoEstado)
      .input('Comentario', sql.NVarChar, input.observaciones) // Guardar observación si cabe, o en otro lado? SolicitudesMaterial.Comentario podría ser.
      .query(`
        UPDATE SolicitudesMaterial 
        SET Estado = @Estado 
        WHERE IdSolicitud = @IdSolicitud
      `);
      // Note: Updating Comentario might overwrite solicitante's comment. Maybe append? skipping for now or use separate field if exists.

    await transaction.commit();

    // Construct response for frontend (Mock data for printing since we don't have Despachos table)
  const pool2 = await getPool();

    // Recuperar info cabecera (incluyendo centro costo) para devolver al imprimir
    // Nota: en distintos entornos el CCO puede venir por IdCentroCosto directo o por vínculo a Área.
    const cabeceraResult = await pool2.request()
      .input('Id', sql.Int, input.idSolicitud)
      .query(`
        SELECT 
           s.IdCentroCosto,
           cc.Codigo AS CodigoCentroCosto,
           s.IdArea AS IdAreaCabecera,
           s.Area AS AreaTexto
        FROM SolicitudesMaterial s
        LEFT JOIN Areas a ON (s.IdArea IS NOT NULL AND s.IdArea = a.IdArea) OR (s.IdArea IS NULL AND s.Area = a.Nombre)
        LEFT JOIN CentrosCosto cc ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
        WHERE s.IdSolicitud = @Id
      `);
    
    // Logica de CCO:
    // 1. Si la cabecera tiene CCO (vía IdArea), usar ese.
    // 2. Si no, buscar si el PRIMER item del detalle tiene IdArea, y usar ese CCO.
    
  let codigoCCO = cabeceraResult.recordset[0]?.CodigoCentroCosto;

    // Si no encontramos CCO en cabecera, intentamos buscar por el IdArea del primer item del detalle
    // (A veces el IdArea se guarda en el detalle y no en la cabecera en sistemas legado/híbridos)
    if (!codigoCCO) {
  const detalleAreaResult = await pool2.request()
        .input('Id', sql.Int, input.idSolicitud)
        .query(`
          SELECT TOP 1 
            cc.Codigo AS CodigoCentroCosto
          FROM DetalleSolicitudesMaterial d
          JOIN Areas a ON d.IdArea = a.IdArea
          JOIN CentrosCosto cc ON a.IdCentroCosto = cc.IdCentroCosto
          WHERE d.IdSolicitud = @Id AND d.IdArea IS NOT NULL
        `);
       if (detalleAreaResult.recordset.length > 0) {
         codigoCCO = detalleAreaResult.recordset[0].CodigoCentroCosto;
       }
    }

    // Fallback adicional: si hay IdCentroCosto directo en cabecera, resolver por CentrosCosto
    if (!codigoCCO) {
      const idCentroCosto = cabeceraResult.recordset[0]?.IdCentroCosto;
      if (idCentroCosto) {
        const ccById = await pool2.request()
          .input('IdCC', sql.Int, idCentroCosto)
          .query(`SELECT Codigo FROM CentrosCosto WHERE IdCentroCosto = @IdCC`);
        const codigo = ccById.recordset?.[0]?.Codigo;
        if (codigo) codigoCCO = codigo;
      }
    }

    codigoCCO = codigoCCO || ''; // Default empty string

    // Get details for print
    const detallePrintResult = await pool2.request()
      .input('Id', sql.Int, input.idSolicitud)
      .query(`
        SELECT 
          m.NumeroArticulo AS Codigo,
          m.DescripcionArticulo AS Descripcion,
          m.UnidadMedida,
          d.CantidadAprobada AS CantidadDespachada
        FROM DetalleSolicitudesMaterial d
        JOIN Materiales m ON d.IdMaterial = m.IdMaterial
        WHERE d.IdSolicitud = @Id
      `);

    return {
      despacho: {
        CodigoDespacho: `DESP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${input.idSolicitud}`,
        FechaDespacho: new Date().toISOString(),
        CodigoCentroCosto: codigoCCO,
        // Alias útil para impresión (mismos datos)
        CodigoCuenta: codigoCCO,
        Estado: nuevoEstado
      },
      detalle: detallePrintResult.recordset
    };

  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

// Métrica: contar despachos registrados hoy usando Auditoría
export async function contarDespachosHoy(): Promise<number> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT COUNT(*) AS Conteo
    FROM AuditoriaAcciones
    WHERE CONVERT(date, FechaAccion) = CONVERT(date, GETDATE())
      AND TipoAccion IN ('REGISTRAR_DESPACHO', 'REGISTRAR_DESPACHO_SOLICITUD')
  `);
  return result.recordset[0]?.Conteo ?? 0;
}
