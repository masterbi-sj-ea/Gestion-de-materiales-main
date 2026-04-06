import sql from 'mssql';
import { callSpMany, callSpOne } from '../../infra/spCaller';
import { getPool } from '../../config/db';
import { io } from '../../server';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';
import { listarPresupuestos, type Presupuesto } from '../presupuestos/presupuestos.service';

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
  FechaAprobacion?: string | null;
  EstadoAprobacion?: string | null;
  ComentarioAprobacion?: string | null;
  NombreAprobador?: string | null;
  PresupuestoArea?: number | null;
  ConsumoAcumulado?: number | null;
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

export interface SolicitudMeta {
  IdSolicitud: number;
  CodigoSolicitud: string;
  Estado: string;
  IdSolicitante: number;
  FechaAprobacion: string | null;
  EstadoAprobacion: string | null;
  ComentarioAprobacion: string | null;
  NombreAprobador: string | null;
}

interface SolicitudAprobacionReciente {
  IdSolicitud: number;
  FechaAprobacion: string | null;
  EstadoAprobacion: string | null;
  ComentarioAprobacion: string | null;
  NombreAprobador: string | null;
}

function seleccionarPresupuestoArea(presupuestos: Presupuesto[], idArea: number | null): Presupuesto | null {
  if (!idArea) {
    return null;
  }

  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;

  const candidatos = presupuestos.filter((presupuesto) => presupuesto.IdArea === idArea);
  if (candidatos.length === 0) {
    return null;
  }

  const rankPresupuesto = (presupuesto: Presupuesto) => {
    const isCurrentMonth = presupuesto.Anio === year && presupuesto.Mes === month;
    const isCurrentAnnual = presupuesto.Anio === year && presupuesto.Mes == null;
    const isCurrentYear = presupuesto.Anio === year;

    return [
      isCurrentMonth ? 1 : 0,
      isCurrentAnnual ? 1 : 0,
      isCurrentYear ? 1 : 0,
      presupuesto.Anio,
      presupuesto.Mes ?? 0,
      presupuesto.IdPresupuesto,
    ];
  };

  return candidatos.sort((left, right) => {
    const rankLeft = rankPresupuesto(left);
    const rankRight = rankPresupuesto(right);

    for (let index = 0; index < rankLeft.length; index += 1) {
      if (rankLeft[index] !== rankRight[index]) {
        return rankRight[index] - rankLeft[index];
      }
    }

    return 0;
  })[0];
}

async function obtenerAprobacionesRecientes(idsSolicitud: number[]): Promise<Map<number, SolicitudAprobacionReciente>> {
  if (idsSolicitud.length === 0) {
    return new Map();
  }

  const pool = await getPool();
  const request = pool.request();
  const placeholders = idsSolicitud.map((idSolicitud, index) => {
    const paramName = `IdSolicitud${index}`;
    request.input(paramName, sql.Int, idSolicitud);
    return `@${paramName}`;
  });

  const result = await request.query<SolicitudAprobacionReciente>(`
    WITH UltimaAprobacion AS (
      SELECT
        a.IdSolicitud,
        a.FechaAprobacion,
        a.Estado AS EstadoAprobacion,
        a.Comentario AS ComentarioAprobacion,
        a.IdAprobador,
        ROW_NUMBER() OVER (
          PARTITION BY a.IdSolicitud
          ORDER BY a.FechaAprobacion DESC, a.IdAprobacion DESC
        ) AS rn
      FROM dbo.Aprobaciones a
      WHERE a.IdSolicitud IN (${placeholders.join(', ')})
    )
    SELECT
      ua.IdSolicitud,
      ua.FechaAprobacion,
      ua.EstadoAprobacion,
      ua.ComentarioAprobacion,
      u.NombreCompleto AS NombreAprobador
    FROM UltimaAprobacion ua
    LEFT JOIN dbo.Usuarios u
      ON u.IdUsuario = ua.IdAprobador
    WHERE ua.rn = 1;
  `);

  return new Map(result.recordset.map((row) => [row.IdSolicitud, row]));
}

async function enriquecerSolicitudes(solicitudes: SolicitudResumen[]): Promise<SolicitudResumen[]> {
  if (solicitudes.length === 0) {
    return solicitudes;
  }

  const idsSolicitud = solicitudes.map((solicitud) => solicitud.IdSolicitud);
  const [aprobacionesRecientes, presupuestos] = await Promise.all([
    obtenerAprobacionesRecientes(idsSolicitud),
    listarPresupuestos().catch((error) => {
      console.error('No se pudo obtener el presupuesto para enriquecer solicitudes', error);
      return [] as Presupuesto[];
    }),
  ]);

  return solicitudes.map((solicitud) => {
    const aprobacion = aprobacionesRecientes.get(solicitud.IdSolicitud);
    const presupuesto = seleccionarPresupuestoArea(presupuestos, solicitud.IdArea ?? null);

    return {
      ...solicitud,
      FechaAprobacion: aprobacion?.FechaAprobacion ?? null,
      EstadoAprobacion: aprobacion?.EstadoAprobacion ?? null,
      ComentarioAprobacion: aprobacion?.ComentarioAprobacion ?? null,
      NombreAprobador: aprobacion?.NombreAprobador ?? null,
      PresupuestoArea: presupuesto ? Number(presupuesto.Presupuesto ?? 0) : null,
      ConsumoAcumulado: presupuesto ? Number(presupuesto.Consumo ?? 0) : null,
    };
  });
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
  ot?: string | null;
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
  ot?: string | null;
  detalle: CrearSolicitudDetalleInput[];
}

export async function crearSolicitud(input: CrearSolicitudInput): Promise<{ IdSolicitud: number; CodigoSolicitud: string }> {
  if (!input.detalle || input.detalle.length === 0) {
    throw new Error('La solicitud debe tener al menos una línea de detalle');
  }

  if (input.detalle.length > 9) {
    throw new Error('Solo se permiten un máximo de 9 materiales por solicitud para ajustarse al formato de impresión.');
  }

  const pool = await getPool();

  // Construir TVP para dbo.TDetalleSolicitudMaterial
  const tvp = new sql.Table('dbo.TDetalleSolicitudMaterial');
  tvp.columns.add('IdMaterial', sql.Int);
  tvp.columns.add('CantidadSolicitada', sql.Decimal(18, 4));
  tvp.columns.add('UnidadMedida', sql.NVarChar(100));
  tvp.columns.add('ComentarioLinea', sql.NVarChar(510));
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
  request.input('OT', sql.NVarChar(100), input.ot ?? null);
  request.input('Detalle', tvp as any);

  // Log temporal para depuración: muestra la cabecera que se enviará al SP
  try {
    console.log('[BACK] crearSolicitud cabecera:', {
      idSolicitante: input.idSolicitante,
      area: input.area,
      comentario: input.comentario,
      idArea: input.idArea,
      idCentroCosto: input.idCentroCosto,
      ot: input.ot,
    });
  } catch (e) {
    console.error('[BACK] error log crearSolicitud cabecera', e);
  }

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

  if (input.detalle.length > 9) {
    throw new Error('Solo se permiten un máximo de 9 materiales por solicitud para ajustarse al formato de impresión.');
  }

  const pool = await getPool();

  const tvp = new sql.Table('dbo.TDetalleSolicitudMaterial');
  tvp.columns.add('IdMaterial', sql.Int);
  tvp.columns.add('CantidadSolicitada', sql.Decimal(18, 4));
  tvp.columns.add('UnidadMedida', sql.NVarChar(100));
  tvp.columns.add('ComentarioLinea', sql.NVarChar(510));
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
request.input('NuevoEstado', sql.NVarChar(30), input.nuevoEstado ?? null);
request.input('Area', sql.NVarChar(100), input.area ?? null);
request.input('Comentario', sql.NVarChar(500), input.comentario ?? null);
request.input('IdArea', sql.Int, input.idArea ?? null);
request.input('IdCentroCosto', sql.Int, input.idCentroCosto ?? null);
request.input('OT', sql.NVarChar(100), input.ot ?? null);
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
  const solicitudes = await callSpMany<SolicitudResumen>('sp_ListarSolicitudesMaterial', {
    IdSolicitante: params.idSolicitante ?? null,
    Estado: params.estado ?? null,
    IdArea: params.idArea ?? null,
    FechaDesde: params.fechaDesde ?? null,
    FechaHasta: params.fechaHasta ?? null,
  });

  return enriquecerSolicitudes(solicitudes);
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

export async function obtenerSolicitudMeta(idSolicitud: number): Promise<SolicitudMeta | null> {
  const pool = await getPool();
  const request = pool.request();
  request.input('IdSolicitud', sql.Int, idSolicitud);

  const result = await request.query<SolicitudMeta>(`
    SELECT
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.Estado,
      s.IdSolicitante,
      ap.FechaAprobacion,
      ap.EstadoAprobacion,
      ap.ComentarioAprobacion,
      ap.NombreAprobador
    FROM dbo.SolicitudesMaterial s
    OUTER APPLY (
      SELECT TOP 1
        a.FechaAprobacion,
        a.Estado AS EstadoAprobacion,
        a.Comentario AS ComentarioAprobacion,
        u.NombreCompleto AS NombreAprobador
      FROM dbo.Aprobaciones a
      LEFT JOIN dbo.Usuarios u
        ON u.IdUsuario = a.IdAprobador
      WHERE a.IdSolicitud = s.IdSolicitud
      ORDER BY a.FechaAprobacion DESC, a.IdAprobacion DESC
    ) ap
    WHERE s.IdSolicitud = @IdSolicitud;
  `);

  return result.recordset[0] ?? null;
}

export async function registrarAprobacionSolicitud(input: {
  idSolicitud: number;
  idAprobador: number;
  estado: 'APROBADA' | 'RECHAZADA';
  comentario?: string | null;
}): Promise<void> {
  const comentarioNormalizado = typeof input.comentario === 'string' ? input.comentario.trim() : '';
  const comentarioFinal = comentarioNormalizado.length > 0 ? comentarioNormalizado : null;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let transactionOpen = false;
  let solicitudBloqueada: Pick<SolicitudMeta, 'CodigoSolicitud' | 'Estado' | 'IdSolicitante'> | null = null;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionOpen = true;

    const lockRequest = new sql.Request(transaction);
    lockRequest.input('IdSolicitud', sql.Int, input.idSolicitud);
    const lockResult = await lockRequest.query<Pick<SolicitudMeta, 'CodigoSolicitud' | 'Estado' | 'IdSolicitante'>>(`
      SELECT
        s.CodigoSolicitud,
        s.Estado,
        s.IdSolicitante
      FROM dbo.SolicitudesMaterial s WITH (UPDLOCK, HOLDLOCK)
      WHERE s.IdSolicitud = @IdSolicitud;
    `);

    solicitudBloqueada = lockResult.recordset[0] ?? null;

    if (!solicitudBloqueada) {
      throw new Error('Solicitud no encontrada');
    }

    if (String(solicitudBloqueada.Estado || '').trim().toUpperCase() !== 'PENDIENTE') {
      throw new Error(`La solicitud ${solicitudBloqueada.CodigoSolicitud} ya no está pendiente y no puede procesarse nuevamente.`);
    }

    const writeRequest = new sql.Request(transaction);
    writeRequest.input('IdSolicitud', sql.Int, input.idSolicitud);
    writeRequest.input('IdAprobador', sql.Int, input.idAprobador);
    writeRequest.input('Estado', sql.NVarChar(30), input.estado);
    writeRequest.input('Comentario', sql.NVarChar(500), comentarioFinal);
    await writeRequest.query(`
      INSERT INTO dbo.Aprobaciones (
        IdSolicitud,
        IdAprobador,
        FechaAprobacion,
        Estado,
        Comentario
      )
      VALUES (
        @IdSolicitud,
        @IdAprobador,
        SYSDATETIME(),
        @Estado,
        @Comentario
      );

      UPDATE dbo.SolicitudesMaterial
      SET Estado = @Estado
      WHERE IdSolicitud = @IdSolicitud;
    `);

    await transaction.commit();
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Error al revertir transacción de aprobación', rollbackError);
      }
    }
    throw error;
  }

  if (input.estado === 'APROBADA' && solicitudBloqueada?.IdSolicitante) {
    try {
      io.to(`user:${solicitudBloqueada.IdSolicitante}`).emit('solicitud_aprobada', {
        id: input.idSolicitud,
        codigo: solicitudBloqueada.CodigoSolicitud || `#${input.idSolicitud}`,
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
  idUsuarioDespacho: number;
  nuevoEstado?: string;
  detalle: { idMaterial: number; cantidadAprobada: number; comentarioLinea?: string | null }[];
}): Promise<void> {
  await callSpOne('sp_RegistrarDespachoSolicitud', {
    IdSolicitud: input.idSolicitud,
    IdUsuarioDespacho: input.idUsuarioDespacho,
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
  doc.text("Extraceite", x, y + 40, { width: 40, align: "center" });
}

type SolicitudPdfCabecera = {
  IdSolicitud: number;
  CodigoSolicitud: string;
  FechaSolicitud: string;
  FechaSolicitudTexto: string;
  NumeroSolicitudCorta: string;
  Estado: string;
  NombreSolicitante: string;
  AreaNombre: string | null;
  CodigoCC: string | null;
  IdArea: number | null;
  OT?: string | null;
  NombreAprobador: string | null;
};

export async function generarPdfSolicitud(idSolicitud: number): Promise<PassThrough> {
  const pool = await getPool();

  // 1. Obtener datos de la solicitud
 const query = `
    SELECT 
      s.IdSolicitud,
      s.CodigoSolicitud,
      s.FechaSolicitud,
      s.OT AS OT,
      CONVERT(VARCHAR(10), CAST(s.FechaSolicitud AS DATE), 103) AS FechaSolicitudTexto,
      RIGHT('000000' + CAST(s.IdSolicitud AS VARCHAR(6)), 6) AS NumeroSolicitudCorta,
      s.Estado,
      u.NombreCompleto AS NombreSolicitante,
      COALESCE(a.Nombre, s.Area) AS AreaNombre,
      COALESCE(
        cc.Codigo, 
        a.Codigo,
        (SELECT TOP 1 arc.CodigoCuenta 
         FROM AreaRecursoCuenta arc 
         WHERE arc.IdArea = s.IdArea 
           AND arc.IdRecurso = 1 
           AND ISNULL(arc.Activo, 1) = 1)
      ) AS CodigoCC,
      s.IdArea,
      ap.NombreAprobador
    FROM SolicitudesMaterial s
    JOIN Usuarios u 
      ON s.IdSolicitante = u.IdUsuario
    LEFT JOIN Areas a 
      ON s.IdArea = a.IdArea
    LEFT JOIN CentrosCosto cc 
      ON cc.IdCentroCosto = COALESCE(s.IdCentroCosto, a.IdCentroCosto)
    OUTER APPLY (
  SELECT TOP 1 
    uap.NombreCompleto AS NombreAprobador
  FROM dbo.Aprobaciones ap
  INNER JOIN dbo.Usuarios uap
    ON uap.IdUsuario = ap.IdAprobador
  INNER JOIN dbo.UsuariosRoles ur
    ON ur.IdUsuario = uap.IdUsuario
  INNER JOIN dbo.Roles r
    ON r.IdRol = ur.IdRol
  WHERE ap.IdSolicitud = s.IdSolicitud
    AND ap.Estado = 'APROBADA'
    AND r.Nombre = 'Jefe de Producción'
  ORDER BY ap.FechaAprobacion DESC, ap.IdAprobacion DESC
) ap
    WHERE s.IdSolicitud = @id
  `;

  const cabeceraResult = await pool.request()
    .input('id', sql.Int, idSolicitud)
    .query(query);

  if (cabeceraResult.recordset.length === 0) {
    throw new Error('Solicitud no encontrada');
  }

  const cab = cabeceraResult.recordset[0] as SolicitudPdfCabecera;

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
    margins: { top: 20, bottom: 20, left: 15, right: 15 },
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  doc.lineWidth(0.5);
  const left = 15;
  const right = doc.page.width - 15;
  const contentW = right - left;

  const strokeBox = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).stroke();
  const fillStrokeBox = (x: number, y: number, w: number, h: number, color = "#E8E8E8") => {
    doc.save().fillColor(color).rect(x, y, w, h).fill().restore();
    doc.rect(x, y, w, h).stroke();
  };
  const fmtDate = (texto: any) => texto ? String(texto) : "";

  const drawRequisa = (startY: number) => {
    // Elevamos todo substancialmente reduciendo el startY aquí
    const adjustedStartY = startY - 30; // Lo subimos 20 puntos adicionales (de -15 a -35)

    // Título igual al físico
    const titleY = adjustedStartY + 10; // Bajamos el titulo para que asimile mejor el espacio del logo

    // Logo o placeholder
    const logoX = left - 5;
    const logoY = adjustedStartY + 2; // Bajamos solo un poco más el logo

    // Aquí evitamos que el logo y el texto queden superpuestos ajustando X en el titulo
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
      // Reducimos un poco mas el logo sin alterar el resto del layout
      try { doc.image(logoFinalPath, logoX, logoY, { width: 52 }); }
      catch (err) { dibujarLogoPlaceholder(doc, logoX, logoY); }
    } else {
      dibujarLogoPlaceholder(doc, logoX, logoY);
    }

    doc.font("Helvetica").fontSize(12).fillColor("black");
    doc.text("SOLICITUD DE PEDIDO A BODEGA EXTRACEITE, S.A.", left + 60, titleY, { align: 'center', width: contentW - 140 });
    
    // N° Number in Red / Dark Pink
    const numeroSolicitud = cab.NumeroSolicitudCorta || '000000';
doc.font("Helvetica").fontSize(14).fillColor("#a13854");
doc.text(`N°  ${numeroSolicitud}`, right - 110, titleY, { align: 'right', width: 110 });

doc.fillColor("black");

const headerTextY = titleY + 45;

// FECHA
doc.font("Helvetica").fontSize(9);
doc.text("FECHA:", left, headerTextY);
doc.text(fmtDate(cab.FechaSolicitudTexto), left + 45, headerTextY - 2);
doc.moveTo(left + 35, headerTextY + 10).lineTo(left + 220, headerTextY + 10).stroke();

// ESTADO
doc.text("ESTADO:", right - 220, headerTextY);
doc.text(String(cab.Estado || "PENDIENTE"), right - 150, headerTextY - 2);
doc.moveTo(right - 155, headerTextY + 10).lineTo(right, headerTextY + 10).stroke();

    const tableY = headerTextY + 15; // Reducido algo de espacio aquí también
    const headerH = 22;
    const rowHTable = 22; // Reducido un poquito (de 24 a 22) para que las 9 filas suban juntas
    const rowsLimit = 9;

    const cellPadY = 4;
    const cellH = rowHTable - (cellPadY * 2);
    const baseFontSize = 9; // Subimos el tamaño por defecto de la tabla a 9
    const minFontSize = 5; // Permitimos que, si el texto es excesivamente largo, se reduzca hasta tamaño 5 para que siempre quepa completo
    const drawCellTextFit = (
      text: any,
      x: number,
      y: number,
      w: number,
      align: 'left' | 'center' | 'right' = 'left',
      fit: boolean = false,
      baseSizeOverride?: number,
      minSizeOverride?: number,
    ) => {
      const value = text == null ? '' : String(text);
      const measureOpts = { width: w, lineBreak: true } as const;

      const localBase = baseSizeOverride ?? baseFontSize;
      const localMin = minSizeOverride ?? minFontSize;

      let fontSize = localBase;
      if (fit && value) {
        for (let fs = localBase; fs >= localMin; fs -= 0.5) { // Vamos decreciendo de a 0.5 puntos para el un ajuste más suave
          doc.fontSize(fs);
          const h = doc.heightOfString(value, measureOpts as any);
          if (h <= cellH) {
            fontSize = fs;
            break;
          }
          fontSize = fs;
        }
      }

      doc.fontSize(fontSize);
      const fits = !value ? true : doc.heightOfString(value, measureOpts as any) <= cellH;

      // Un cálculo simple para centrar verticalmente según el tamaño de fuente final
      const textH = doc.heightOfString(value, measureOpts as any);
      const offsetY = Math.max(0, (cellH - textH) / 2);

      doc.text(value, x, y + cellPadY + offsetY, { // Sumamos ese offsetY para que si el texto es chiquito, quede en el medio vertical de la celda
        width: w,
        height: cellH,
        align,
        lineBreak: true,
        ellipsis: !fits, // Si a pesar de bajar a 5pt sigue sin caber, pone puntos suspensivos (aunque es casi imposible en ese tamaño)
      });

      doc.fontSize(baseFontSize);
    };

    const wCodigo = 55;
    const wDesc = 255; // Le damos a DESCRIPCIÓN los puntos adicionales
    const wUM = 60;
    const wCant = 50;
    const wAct = 75;
    const wCCO = contentW - (wCodigo + wDesc + wUM + wCant + wAct); // Ahora CCO será más delgado

    fillStrokeBox(left, tableY, contentW, headerH);
    doc.font("Helvetica").fontSize(9);
    doc.text("CÓDIGO", left, tableY + 6, { width: wCodigo, align: 'center' });
    doc.text("DESCRIPCIÓN MATERIAL", left + wCodigo, tableY + 6, { width: wDesc, align: 'center' });
    doc.text("U/MEDIDA", left + wCodigo + wDesc, tableY + 6, { width: wUM, align: 'center' });
    doc.text("CANTIDAD", left + wCodigo + wDesc + wUM, tableY + 6, { width: wCant, align: 'center' });
    doc.text("ACTIVIDAD", left + wCodigo + wDesc + wUM + wCant, tableY + 6, { width: wAct, align: 'center' });
    doc.text("C.CUENTA", left + wCodigo + wDesc + wUM + wCant + wAct, tableY + 6, { width: wCCO, align: 'center' });

    for (let i = 0; i < rowsLimit; i++) {
      const y = tableY + headerH + (i * rowHTable);
      doc.moveTo(left, y).lineTo(right, y).stroke();
      const it = detalle[i];
      if (it) {
        doc.font("Helvetica").fontSize(8);
        drawCellTextFit(it.Codigo, left, y, wCodigo, 'center');
        drawCellTextFit(it.Descripcion, left + wCodigo + 5, y, wDesc - 10, 'left', true);
        drawCellTextFit(it.UnidadMedida, left + wCodigo + wDesc, y, wUM, 'center');
        drawCellTextFit(String(it.CantidadSolicitada), left + wCodigo + wDesc + wUM, y, wCant, 'center');
        // Mostrar OT en ACTIVIDAD si existe y no es vacío; si no, usar la actividad del detalle o el nombre del área
        const actividadValor = (cab.OT && String(cab.OT).trim() !== '') ? String(cab.OT) : (it.Actividad || cab.AreaNombre || '');
        drawCellTextFit(
          actividadValor,
          left + wCodigo + wDesc + wUM + wCant + 2,
          y,
          wAct - 4,
          'center',
          true,
          8.5,
          4.5,
        );
        drawCellTextFit(
          it.CodigoCuenta || cab.CodigoCC || '',
          left + wCodigo + wDesc + wUM + wCant + wAct + 2,
          y,
          wCCO - 4,
          'center',
          true,
          8.5,
          5,
        );
      }
    }
    
    // Lazo de cierre inferior
    const yLineBottom = tableY + headerH + (rowsLimit * rowHTable);
    doc.moveTo(left, yLineBottom).lineTo(right, yLineBottom).stroke();

    // Lineas verticales
    let curX = left;
    [wCodigo, wDesc, wUM, wCant, wAct].forEach(w => {
        curX += w;
        doc.moveTo(curX, tableY).lineTo(curX, tableY + headerH + (rowsLimit * rowHTable)).stroke();
    });
    // Borde exterior completo
    strokeBox(left, tableY, contentW, headerH + (rowsLimit * rowHTable));

    const tableBottomY = tableY + headerH + (rowsLimit * rowHTable);

    // Etiqueta FR-F-BD-022
    doc.font("Helvetica").fontSize(8).fillColor("black");
    doc.text("FR-F-BD-022", left + 2, tableBottomY + 3);

    const sigY = tableBottomY + 45;
    doc.font("Helvetica").fontSize(9);
    
    const nombreAprobador = String(cab.NombreAprobador || 'PENDIENTE DE APROBACIÓN');

doc.moveTo(left + 25, sigY).lineTo(left + 200, sigY).stroke();
doc.font("Helvetica").fontSize(9);
doc.text(nombreAprobador, left + 25, sigY - 12, { width: 175, align: 'center' });
doc.text("Autorizado por", left + 25, sigY + 5, { width: 175, align: 'center' });
doc.text("Jefe de Producción", left + 25, sigY + 15, { width: 175, align: 'center' });

doc.moveTo(right - 200, sigY).lineTo(right - 25, sigY).stroke();
doc.text("Retirado por", right - 200, sigY + 5, { width: 175, align: 'center' });
doc.text("Nombre y firma", right - 200, sigY + 15, { width: 175, align: 'center' });

  };

  drawRequisa(40);
  doc.end();
  return stream;
}
