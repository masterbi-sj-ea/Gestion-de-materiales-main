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
  // Incluimos DESPACHADA
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
    WHERE s.Estado = 'DESPACHADA'
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

  // Si no tenemos CodigoCentroCosto de cabecera, intentamos buscarlo en detalle (fallback)
  if (!cabecera.CodigoCentroCosto) {
      const detalleAreaResult = await pool.request()
      .input('Id', sql.Int, id)
      .query(`
        SELECT TOP 1 
          COALESCE(cc.Codigo, cc.Nombre) AS CodigoCentroCosto
        FROM DetalleSolicitudesMaterial d
        JOIN Areas a ON d.IdArea = a.IdArea
        JOIN CentrosCosto cc ON a.IdCentroCosto = cc.IdCentroCosto
        WHERE d.IdSolicitud = @Id AND d.IdArea IS NOT NULL
      `);
      if (detalleAreaResult.recordset.length > 0) {
        cabecera.CodigoCentroCosto = detalleAreaResult.recordset[0].CodigoCentroCosto;
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
    await transaction.begin();
    
    // 1. Update Solicitud Status using SP (or manual update if we want to be safe inside transaction)
    // The SP does NOT handle transactions if called from inside a transaction usually unless named transaction issue.
    // We will do direct updates to ensure atomicity in this transaction block.

    // A. Actualizar CantidadAprobada (que usaremos como despachada) en DetalleSolicitudesMaterial
    for (const item of input.detalle) {
      const request = new sql.Request(transaction);
      await request
        .input('Cant', sql.Decimal(18, 4), item.cantidadDespachada)
        .input('IdSolicitud', sql.Int, input.idSolicitud)
        .input('IdMaterial', sql.Int, item.idMaterial)
        .query(`
          UPDATE DetalleSolicitudesMaterial 
          SET CantidadAprobada = @Cant 
          WHERE IdSolicitud = @IdSolicitud AND IdMaterial = @IdMaterial
        `);

      // B. Actualizar Stock en StockActual (NO en Materiales)
      const reqStock = new sql.Request(transaction);
      await reqStock
        .input('Cant', sql.Decimal(18, 4), item.cantidadDespachada)
        .input('IdMaterial', sql.Int, item.idMaterial)
        .query(`
          UPDATE StockActual 
          SET EnStock = EnStock - @Cant 
          WHERE IdMaterial = @IdMaterial
        `);
    }

    // C. Actualizar Cabecera a DESPACHADA (o parcial si la lógica lo requiriera, pero asumimos total/final)
    const reqHeader = new sql.Request(transaction);
    await reqHeader
      .input('IdSolicitud', sql.Int, input.idSolicitud)
      .input('Comentario', sql.NVarChar, input.observaciones) // Guardar observación si cabe, o en otro lado? SolicitudesMaterial.Comentario podría ser.
      .query(`
        UPDATE SolicitudesMaterial 
        SET Estado = 'DESPACHADA' 
        WHERE IdSolicitud = @IdSolicitud
      `);
      // Note: Updating Comentario might overwrite solicitante's comment. Maybe append? skipping for now or use separate field if exists.

    await transaction.commit();

    // Construct response for frontend (Mock data for printing since we don't have Despachos table)
    const pool = await getPool();

    // Recuperar info cabecera (incluyendo centro costo) para devolver al imprimir
    const cabeceraResult = await pool.request()
      .input('Id', sql.Int, input.idSolicitud)
      .query(`
        SELECT 
           COALESCE(cc.Codigo, cc.Nombre) AS CodigoCentroCosto,
           s.IdArea AS IdAreaCabecera
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
       const detalleAreaResult = await pool.request()
        .input('Id', sql.Int, input.idSolicitud)
        .query(`
          SELECT TOP 1 
            COALESCE(cc.Codigo, cc.Nombre) AS CodigoCentroCosto
          FROM DetalleSolicitudesMaterial d
          JOIN Areas a ON d.IdArea = a.IdArea
          JOIN CentrosCosto cc ON a.IdCentroCosto = cc.IdCentroCosto
          WHERE d.IdSolicitud = @Id AND d.IdArea IS NOT NULL
        `);
       if (detalleAreaResult.recordset.length > 0) {
         codigoCCO = detalleAreaResult.recordset[0].CodigoCentroCosto;
       }
    }

    codigoCCO = codigoCCO || ''; // Default empty string

    // Get details for print
    const detallePrintResult = await pool.request()
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
        CodigoCentroCosto: codigoCCO
      },
      detalle: detallePrintResult.recordset
    };

  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}
