import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { AuthRequest } from '../../middleware/auth';
import { env } from '../../config/env';
import {
  listarMateriales,
  listarMaterialesConStock,
  listarMaterialesPermitidosPorUsuarioArea,
  obtenerImagenMaterialPorNumeroArticulo,
  crearMaterial,
  actualizarMaterial,
  eliminarMaterial,
  reactivarMaterial,
  importarMaterialesYStock,
  MaterialImportRow,
} from './materiales.service';
import { crearCorte as crearCorteStock } from '../cortes/cortes.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';
import { usuarioTieneAccesoArea } from '../areas/areas.service';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

function stripAccents(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildDateFromParts(day: number, month: number, year: number): string | null {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function parseBooleanish(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'si' || normalized === 'sí';
}

function resolveSqlBusinessMessage(error: any): string | null {
  const candidates = [
    error?.message,
    error?.originalError?.info?.message,
    error?.precedingErrors?.[0]?.message,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate ?? '').trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

function inferSnapshotDateFromFilename(filename: string): string | null {
  const name = stripAccents(String(filename || '')).toUpperCase();

  // Patrones típicos: "AL 13 DE FEBRERO 2026" o "13 DE FEBRERO 2026"
  const match = name.match(/(?:\bAL\b\s*)?(\d{1,2})\s+DE\s+([A-ZÑ]+)\s+(\d{4})/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2];
  const year = Number(match[3]);

  const months: Record<string, number> = {
    ENERO: 1,
    FEBRERO: 2,
    MARZO: 3,
    ABRIL: 4,
    MAYO: 5,
    JUNIO: 6,
    JULIO: 7,
    AGOSTO: 8,
    SEPTIEMBRE: 9,
    SETIEMBRE: 9,
    OCTUBRE: 10,
    NOVIEMBRE: 11,
    DICIEMBRE: 12,
  };

  const month = months[monthName];
  if (!month) return null;

  return buildDateFromParts(day, month, year);
}

function buildCorteDescripcionForImport(filename: string, snapshotDate?: string | null): string {
  const base = snapshotDate ? `Carga stock ${snapshotDate}` : 'Carga stock';
  const raw = `${base} - ${String(filename || '').trim()}`.trim();
  // La BD usa NVARCHAR(200) para descripcion
  return raw.length > 200 ? raw.slice(0, 200) : raw;
}

function normalizeHeaderForImport(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeCellValue(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseImportNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  let str = String(value).trim();
  if (!str) return null;

  // Limpiar comillas y espacios
  str = str.replace(/"/g, '').replace(/\s+/g, '');

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    // Detectar separador decimal por la última aparición
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';

    str = str.split(thousandSep).join('');
    if (decimalSep === ',') {
      str = str.replace(',', '.');
    }
  } else if (hasComma && !hasDot) {
    // Asumimos coma decimal
    str = str.replace(/\./g, '');
    str = str.replace(',', '.');
  } else {
    // Punto decimal (o sin decimales): remover comas como separador de miles
    str = str.replace(/,/g, '');
  }

  const n = Number(str);
  return Number.isNaN(n) ? null : n;
}

function normalizeImportDateValue(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return buildDateFromParts(parsed.d, parsed.m, parsed.y);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return buildDateFromParts(value.getDate(), value.getMonth() + 1, value.getFullYear());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return buildDateFromParts(Number(isoMatch[3]), Number(isoMatch[2]), Number(isoMatch[1]));
  }

  const slashParts = raw.split('/').map((part) => part.trim());
  if (slashParts.length === 3) {
    const first = Number(slashParts[0]);
    const second = Number(slashParts[1]);
    const third = Number(slashParts[2]);

    if (Number.isFinite(first) && Number.isFinite(second) && Number.isFinite(third)) {
      if (slashParts[2].length <= 2) {
        return buildDateFromParts(second, first, 2000 + third);
      }

      return buildDateFromParts(first, second, third);
    }
  }

  const dashParts = raw.split('-').map((part) => part.trim());
  if (dashParts.length === 3) {
    const first = Number(dashParts[0]);
    const second = Number(dashParts[1]);
    const third = Number(dashParts[2]);

    if (Number.isFinite(first) && Number.isFinite(second) && Number.isFinite(third)) {
      if (dashParts[0].length === 4) {
        return buildDateFromParts(third, second, first);
      }

      return buildDateFromParts(first, second, third);
    }
  }

  const numericCandidate = Number(raw);
  if (Number.isFinite(numericCandidate)) {
    const parsed = XLSX.SSF.parse_date_code(numericCandidate);
    if (!parsed) return null;
    return buildDateFromParts(parsed.d, parsed.m, parsed.y);
  }

  return null;
}

function buildImportRows(records: any[]): MaterialImportRow[] {
  return (records || [])
    .map((r) => {
      const keyMap: Record<string, string> = {};
      for (const key of Object.keys(r || {})) {
        keyMap[normalizeHeaderForImport(key)] = key;
      }

      const getField = (names: string[]): any => {
        for (const name of names) {
          const normalized = normalizeHeaderForImport(name);
          const realKey = keyMap[normalized];
          if (realKey !== undefined) {
            return (r as any)[realKey];
          }
        }
        return undefined;
      };

      // Variantes comunes de Excel / conversiones manuales
      const numeroArticulo = getField(['numeroarticulo', 'numerodearticulo', 'numeroartic', 'numerodeartic']);
      const descripcionArticulo = getField([
        'descripcionarticulo',
        'descripciondelarticulo',
        'descripcion',
      ]);
      const unidadMedida = getField(['unidadmedida', 'unidaddemedida', 'unidadmedi']);
      const enStockRaw = getField(['enstock']);
      const grupoArticulos = getField(['grupoarticulos', 'grupodearticulos', 'grupoarticu']);
      const ultimaFechaCompra = getField(['ultimafechacompra', 'ultimafechadecompra', 'ultimafecha']);
      const ultimoPrecioRaw = getField(['ultimopreciocompra', 'ultimopreciodecompra', 'ultimopreci']);
      const ultimaMonedaCompra = getField(['ultimamonedacompra', 'ultimamonedadecompra', 'ultimamone']);

      return {
        NumeroArticulo: normalizeCellValue(numeroArticulo),
        DescripcionArticulo: normalizeCellValue(descripcionArticulo),
        EnStock: parseImportNumber(enStockRaw) ?? 0,
        UnidadMedida: normalizeCellValue(unidadMedida),
        GrupoArticulos: normalizeCellValue(grupoArticulos) || null,
        UltimaFechaCompra: normalizeImportDateValue(ultimaFechaCompra),
        UltimoPrecioCompra: parseImportNumber(ultimoPrecioRaw),
        UltimaMonedaCompra: normalizeCellValue(ultimaMonedaCompra) || null,
      } as MaterialImportRow;
    })
    .filter((x) => !!x.NumeroArticulo && !!x.DescripcionArticulo && !!x.UnidadMedida);
}

function parsePositiveIntParam(value: any, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const int = Math.trunc(n);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}

function normalizeOutputFormat(value: any, originalExt?: string): 'jpeg' | 'png' | 'webp' | 'original' {
  const raw = String(value || '').trim().toLowerCase();

  if (!raw || raw === 'auto') return 'webp';
  if (raw === 'jpg' || raw === 'jpeg') return 'jpeg';
  if (raw === 'png') return 'png';
  if (raw === 'webp') return 'webp';
  if (raw === 'original') return 'original';

  const ext = String(originalExt || '').toLowerCase();
  if (ext === '.png') return 'png';
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
  if (ext === '.webp') return 'webp';

  return 'webp';
}

function getContentTypeForFormat(format: 'jpeg' | 'png' | 'webp', originalExt?: string): string {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';

  const ext = String(originalExt || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function isPathInsideBase(basePath: string, targetPath: string): boolean {
  const baseResolved = path.resolve(basePath);
  const targetResolved = path.resolve(targetPath);

  const relative = path.relative(baseResolved, targetResolved);

  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function resolveMaterialImagePath(ruta: string): string | null {
  const raw = String(ruta || '').trim();
  if (!raw) return null;

  const root = env.MATERIALES_IMG_ROOT?.trim() || null;
  const isAbsoluteWin = /^[a-zA-Z]:[\\/]/.test(raw);
  const isUnc = raw.startsWith('\\\\');

  if (root) {
    const rootResolved = path.resolve(root);

    // Si BD trae una ruta absoluta, solo se permite si cae dentro del ROOT configurado
    if (isAbsoluteWin || isUnc) {
      const absoluteResolved = path.resolve(raw);
      return isPathInsideBase(rootResolved, absoluteResolved) ? absoluteResolved : null;
    }

    // Si BD trae una ruta relativa, la resolvemos dentro del ROOT
    const cleaned = raw
      .replace(/^[/\\]+/, '')
      .replace(/\.\.(?=[/\\]|$)/g, '.');

    const combined = path.resolve(rootResolved, cleaned);
    return isPathInsideBase(rootResolved, combined) ? combined : null;
  }

  // Sin ROOT configurado: solo se aceptan rutas absolutas Windows/UNC
  if (!isAbsoluteWin && !isUnc) {
    return null;
  }

  return path.resolve(raw);
}

async function enviarImagenOptimizada(
  req: Request,
  res: Response,
  filePath: string
): Promise<Response | void> {
  const ext = path.extname(filePath).toLowerCase();

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Imagen no encontrada en el almacenamiento' });
  }

  const stats = await fs.promises.stat(filePath);

  const width = parsePositiveIntParam(req.query.w ?? req.query.width, 50, 2400);
  const height = parsePositiveIntParam(req.query.h ?? req.query.height, 50, 2400);
  const quality = parsePositiveIntParam(req.query.q ?? req.query.quality, 40, 95) ?? 72;
  const format = normalizeOutputFormat(req.query.format, ext);

  const etag = `W/"${stats.size}-${Math.trunc(stats.mtimeMs)}-${width ?? 0}-${height ?? 0}-${quality}-${format}"`;

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', stats.mtime.toUTCString());

  if (ext === '.svg' || ext === '.gif') {
    const contentType =
      ext === '.svg' ? 'image/svg+xml' :
      ext === '.gif' ? 'image/gif' :
      'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    return res.sendFile(filePath);
  }

  const outputFormat: 'jpeg' | 'png' | 'webp' =
    format === 'original'
      ? (ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : 'jpeg')
      : format;

  const outputExt =
    outputFormat === 'jpeg' ? 'jpg' :
    outputFormat === 'png' ? 'png' :
    'webp';

  const cacheRoot = process.env.MATERIALES_IMG_CACHE?.trim();
  const cacheKey = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        filePath,
        size: stats.size,
        mtime: Math.trunc(stats.mtimeMs),
        width: width ?? 0,
        height: height ?? 0,
        quality,
        format: outputFormat,
      })
    )
    .digest('hex');

  const cacheFilePath = cacheRoot
    ? path.resolve(cacheRoot, `${cacheKey}.${outputExt}`)
    : null;

  if (cacheFilePath && fs.existsSync(cacheFilePath)) {
    res.setHeader('Content-Type', getContentTypeForFormat(outputFormat, ext));
    return res.sendFile(cacheFilePath);
  }

  let pipeline = sharp(filePath, { failOn: 'none' }).rotate();

  if (width || height) {
    pipeline = pipeline.resize({
      width: width ?? undefined,
      height: height ?? undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  if (outputFormat === 'jpeg') {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  } else if (outputFormat === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.webp({ quality });
  }

  if (cacheFilePath) {
    await fs.promises.mkdir(path.dirname(cacheFilePath), { recursive: true });
    await pipeline.toFile(cacheFilePath);

    res.setHeader('Content-Type', getContentTypeForFormat(outputFormat, ext));
    return res.sendFile(cacheFilePath);
  }

  const buffer = await pipeline.toBuffer();

  res.setHeader('Content-Type', getContentTypeForFormat(outputFormat, ext));
  res.setHeader('Content-Length', String(buffer.length));

  return res.end(buffer);
}

export async function listarMaterialesController(_req: Request, res: Response) {
  try {
    const materiales = await listarMateriales();
    return res.json(materiales);
  } catch (error: any) {
    console.error('Error en listarMaterialesController', error);
    return res.status(500).json({ message: 'Error al listar materiales' });
  }
}

export async function listarMaterialesConStockController(req: Request, res: Response) {
  try {
    const incluirInactivos = parseBooleanish(req.query?.incluirInactivos ?? req.query?.includeInactive);
    const materiales = await listarMaterialesConStock({ incluirInactivos });
    return res.json(materiales);
  } catch (error: any) {
    console.error('Error en listarMaterialesConStockController', error);
    const isTimeout =
      error?.code === 'ETIMEOUT' ||
      error?.originalError?.code === 'ETIMEOUT' ||
      String(error?.message || '').toLowerCase().includes('timeout');
    return res.status(500).json({
      message: isTimeout
        ? 'Timeout al listar materiales con stock (la consulta está tardando demasiado en SQL Server)'
        : 'Error al listar materiales con stock',
    });
  }
}

export async function listarMaterialesPermitidosController(req: AuthRequest, res: Response) {
  const idArea = Number(req.query?.areaId ?? req.query?.idArea);
  const catalogoRaw = req.query?.catalogoId ?? req.query?.idCatalogoSolicitud;
  const idCatalogoSolicitud = catalogoRaw == null || catalogoRaw === '' ? null : Number(catalogoRaw);

  if (!Number.isInteger(idArea) || idArea <= 0) {
    return res.status(400).json({ message: 'areaId es requerido' });
  }

  if (idCatalogoSolicitud != null && (!Number.isInteger(idCatalogoSolicitud) || idCatalogoSolicitud <= 0)) {
    return res.status(400).json({ message: 'catalogoId es inválido' });
  }

  if (!req.userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  try {
    const autorizado = await usuarioTieneAccesoArea(req.userId, idArea);
    if (!autorizado) {
      return res.status(403).json({ message: 'No tienes autorización para operar en esta área.' });
    }

    const payload = await listarMaterialesPermitidosPorUsuarioArea(req.userId, idArea, idCatalogoSolicitud);
    return res.json(payload);
  } catch (error: any) {
    console.error('Error en listarMaterialesPermitidosController', error);
    return res.status(500).json({ message: 'Error al listar materiales permitidos' });
  }
}

export async function obtenerImagenMaterialPorNumeroArticuloController(req: Request, res: Response) {
  try {
    const { numeroArticulo } = req.params;

    if (!numeroArticulo) {
      return res.status(400).json({ message: 'Número de artículo requerido' });
    }

    const data = await obtenerImagenMaterialPorNumeroArticulo(numeroArticulo);

    if (!data) {
      return res.status(404).json({ message: 'Material no encontrado' });
    }

    return res.json(data);
  } catch (error: any) {
    console.error('Error en obtenerImagenMaterialPorNumeroArticuloController', error);
    return res.status(500).json({
      message: 'Error al obtener la imagen del material',
    });
  }
}

export async function obtenerArchivoImagenMaterialController(req: Request, res: Response) {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({ message: 'Nombre de archivo requerido' });
    }

    const root = process.env.MATERIALES_IMG_ROOT;
    if (!root) {
      return res.status(500).json({ message: 'Ruta de imágenes no configurada en el servidor' });
    }

    const safeFilename = path.basename(filename);
    const fullPath = path.join(root, safeFilename);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }

    return await enviarImagenOptimizada(req, res, fullPath);
  } catch (error) {
    console.error('Error en obtenerArchivoImagenMaterialController', error);
    return res.status(500).json({ message: 'Error al servir la imagen del material' });
  }
}

export async function obtenerArchivoImagenMaterialPorNumeroArticuloController(req: Request, res: Response) {
  try {
    const { numeroArticulo } = req.params;

    if (!numeroArticulo) {
      return res.status(400).json({ message: 'Número de artículo requerido' });
    }

    const data = await obtenerImagenMaterialPorNumeroArticulo(numeroArticulo);

    if (!data || !data.RutaImagenFinal) {
      return res.status(204).end();
    }

    const resolvedPath = resolveMaterialImagePath(data.RutaImagenFinal);

    if (!resolvedPath) {
      console.warn('Ruta de imagen inválida para material', {
        numeroArticulo,
        rutaImagenFinal: data.RutaImagenFinal,
      });
      return res.status(204).end();
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(204).end();
    }

    return await enviarImagenOptimizada(req, res, resolvedPath);
  } catch (error) {
    console.error('Error en obtenerArchivoImagenMaterialPorNumeroArticuloController', error);
    return res.status(500).json({ message: 'Error al obtener el archivo de imagen del material' });
  }
}

export async function verImagenMaterialController(req: Request, res: Response) {
  try {
    const ruta = String(req.query.ruta || '').trim();

    if (!ruta) {
      return res.status(400).json({ message: 'Ruta de imagen no proporcionada' });
    }

    const resolvedPath = resolveMaterialImagePath(ruta);

    if (!resolvedPath) {
      return res.status(400).json({ message: 'Ruta de imagen inválida o fuera del directorio permitido' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'Imagen no encontrada en el almacenamiento' });
    }

    return await enviarImagenOptimizada(req, res, resolvedPath);
  } catch (error) {
    console.error('Error en verImagenMaterialController:', error);
    return res.status(500).json({ message: 'Error interno del servidor al procesar la imagen' });
  }
}

export async function crearMaterialController(req: AuthRequest, res: Response) {
  const { numeroArticulo, descripcionArticulo, unidadMedida, grupoArticulos } = req.body || {};

  if (!numeroArticulo || !descripcionArticulo || !unidadMedida) {
    return res.status(400).json({ message: 'numeroArticulo, descripcionArticulo y unidadMedida son requeridos' });
  }

  try {
    const idMaterial = await crearMaterial({
      NumeroArticulo: numeroArticulo,
      DescripcionArticulo: descripcionArticulo,
      UnidadMedida: unidadMedida,
      GrupoArticulos: grupoArticulos,
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'CREAR_MATERIAL', {
        modulo: 'Materiales',
        entidad: `Material #${idMaterial}`,
        idMaterial,
        numeroArticulo,
        descripcionArticulo,
        unidadMedida,
        grupoArticulos,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría CREAR_MATERIAL', auditError);
    }

    return res.status(201).json({ idMaterial });
  } catch (error: any) {
    console.error('Error en crearMaterialController', error);
    return res.status(500).json({ message: 'Error al crear material' });
  }
}

export async function actualizarMaterialController(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  const { numeroArticulo, descripcionArticulo, unidadMedida, grupoArticulos } = req.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de material inválido' });
  }

  if (!numeroArticulo || !descripcionArticulo || !unidadMedida) {
    return res.status(400).json({ message: 'numeroArticulo, descripcionArticulo y unidadMedida son requeridos' });
  }

  try {
    await actualizarMaterial(id, {
      NumeroArticulo: numeroArticulo,
      DescripcionArticulo: descripcionArticulo,
      UnidadMedida: unidadMedida,
      GrupoArticulos: grupoArticulos,
    });

    try {
      await registrarAuditoria(req.userId ?? null, 'ACTUALIZAR_MATERIAL', {
        modulo: 'Materiales',
        entidad: `Material #${id}`,
        idMaterial: id,
        numeroArticulo,
        descripcionArticulo,
        unidadMedida,
        grupoArticulos,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ACTUALIZAR_MATERIAL', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en actualizarMaterialController', error);
    return res.status(500).json({ message: 'Error al actualizar material' });
  }
}

export async function eliminarMaterialController(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de material inválido' });
  }

  try {
    await eliminarMaterial(id);

    try {
      await registrarAuditoria(req.userId ?? null, 'ELIMINAR_MATERIAL', {
        modulo: 'Materiales',
        entidad: `Material #${id}`,
        idMaterial: id,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría ELIMINAR_MATERIAL', auditError);
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error en eliminarMaterialController', error);
    return res.status(500).json({ message: 'Error al eliminar material' });
  }
}

export async function reactivarMaterialController(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Id de material inválido' });
  }

  try {
    const resultado = await reactivarMaterial(id);

    try {
      await registrarAuditoria(req.userId ?? null, 'REACTIVAR_MATERIAL', {
        modulo: 'Materiales',
        entidad: `Material #${id}`,
        resultado: resultado?.Resultado ?? 'REACTIVADO',
        idMaterial: id,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría REACTIVAR_MATERIAL', auditError);
    }

    return res.status(200).json(resultado ?? { IdMaterial: id, Resultado: 'REACTIVADO' });
  } catch (error: any) {
    console.error('Error en reactivarMaterialController', error);
    const businessMessage = resolveSqlBusinessMessage(error);
    const lowerMessage = String(businessMessage ?? '').toLowerCase();

    if (businessMessage) {
      const status = lowerMessage.includes('ya existe otro material activo') ? 409 : 400;
      return res.status(status).json({ message: businessMessage });
    }

    return res.status(500).json({ message: 'Error al reactivar material' });
  }
}

export async function importarMaterialesController(req: AuthRequest, res: Response) {
  const file = (req as any).file as any | undefined;

  if (!file) {
    return res.status(400).json({ message: 'Archivo requerido (campo "file")' });
  }

  const originalName = String(file.originalname || '').toLowerCase();
  const isCsv = originalName.endsWith('.csv');
  const isXlsx = originalName.endsWith('.xlsx');
  if (!isCsv && !isXlsx) {
    return res.status(400).json({ message: 'Formato inválido. Debe ser un archivo .csv o .xlsx' });
  }

  try {
    let records: any[] = [];

    if (isXlsx) {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({ message: 'El archivo Excel no contiene hojas' });
      }
      const sheet = workbook.Sheets[sheetName];
      records = XLSX.utils.sheet_to_json(sheet, {
        defval: '',
        raw: false,
        dateNF: 'yyyy-mm-dd',
      }) as any[];
    } else {
      // Excel a veces exporta CSV en ANSI/Latin1; si lo leemos como UTF-8 puede aparecer mojibake ("N�mero", "Descripci�n").
      const utf8 = file.buffer.toString('utf-8');
      const firstUtf8Line = (utf8.split(/\r?\n/)[0] ?? '').slice(0, 300);
      const looksMojibake = firstUtf8Line.includes('\uFFFD') || /N\ufffdmero|Descripci\ufffdn/i.test(firstUtf8Line);
      const content = looksMojibake ? file.buffer.toString('latin1') : utf8;

      // Detectar delimitador automáticamente según la primera línea
      const firstLine = content.split(/\r?\n/)[0] ?? '';
      let delimiter: string = ';';
      if (firstLine.includes(';') && !firstLine.includes(',')) {
        delimiter = ';';
      } else if (firstLine.includes(',') && !firstLine.includes(';')) {
        delimiter = ',';
      } else if (firstLine.includes(';') && firstLine.includes(',')) {
        delimiter = ';';
      }

      records = parseCsv(content, {
        columns: true,
        skip_empty_lines: true,
        delimiter,
        trim: true,
      }) as any[];
    }

    const datos: MaterialImportRow[] = buildImportRows(records);

    if (!datos.length) {
      return res.status(400).json({ message: 'El archivo no contiene filas válidas de materiales' });
    }

    const modoRaw = String(req.body?.modo || 'ACTUALIZAR').trim().toUpperCase();
    const modo: 'ACTUALIZAR' | 'REEMPLAZAR' =
      modoRaw === 'REEMPLAZAR' ? 'REEMPLAZAR' : 'ACTUALIZAR';

    await importarMaterialesYStock(datos, req.userId, modo);

    // Crear automáticamente un corte STOCK vigente asociado a la carga (mejora trazabilidad).
    let idCorteCreado: number | null = null;
    let corteError: string | null = null;
    try {
      const snapshotDate = inferSnapshotDateFromFilename(file.originalname);
      const descripcionCorte = buildCorteDescripcionForImport(file.originalname, snapshotDate);
      const idCorte = await crearCorteStock({
        descripcion: descripcionCorte,
        fechaInicio: snapshotDate ?? null,
        fechaFin: null,
        ambito: 'STOCK',
        esMaximo: true,
      });
      idCorteCreado = idCorte || null;

      try {
        await registrarAuditoria(req.userId ?? null, 'CREAR_CORTE_STOCK_AUTO', {
          modulo: 'Cortes de Stock',
          entidad: `Corte #${idCorteCreado}`,
          idCorte: idCorteCreado,
          descripcion: descripcionCorte,
          ambito: 'STOCK',
          esMaximo: true,
          origen: 'IMPORTAR_MATERIALES_STOCK',
          nombreArchivo: file.originalname,
          filas: datos.length,
        });
      } catch (auditError) {
        console.error('Error al registrar auditoría CREAR_CORTE_STOCK_AUTO', auditError);
      }
    } catch (err: any) {
      corteError = err?.message ? String(err.message) : 'Error desconocido al crear corte';
      console.error('No se pudo crear corte automático para importación', err);
    }

    try {
      await registrarAuditoria(req.userId ?? null, 'IMPORTAR_MATERIALES_STOCK', {
        modulo: 'Materiales',
        entidad: 'Importación masiva de materiales y stock',
        filas: datos.length,
        nombreArchivo: file.originalname,
        modo,
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría IMPORTAR_MATERIALES_STOCK', auditError);
    }

    const baseMessage = 'Importación realizada correctamente';
    const message = corteError
      ? `${baseMessage}. Aviso: no se pudo crear el corte automático (${corteError}).`
      : baseMessage;

    const snapshotDate = inferSnapshotDateFromFilename(file.originalname);

    return res.status(200).json({
      message,
      filas: datos.length,
      formato: isXlsx ? 'xlsx' : 'csv',
      modo,
      idCorte: idCorteCreado,
      stats: {
        totalProcesados: datos.length,
        filename: file.originalname,
        snapshotDate
      }
    });
  } catch (error: any) {
    console.error('Error en importarMaterialesController', error);
    return res.status(500).json({ message: 'Error al importar materiales desde archivo' });
  }
}
