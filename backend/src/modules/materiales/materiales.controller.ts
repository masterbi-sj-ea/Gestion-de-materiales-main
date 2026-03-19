import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../../middleware/auth';
import { env } from '../../config/env';
import {
  listarMateriales,
  listarMaterialesConStock,
  obtenerImagenMaterialPorNumeroArticulo,
  crearMaterial,
  actualizarMaterial,
  eliminarMaterial,
  importarMaterialesYStock,
  MaterialImportRow,
} from './materiales.service';
import { crearCorte as crearCorteStock } from '../cortes/cortes.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';
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
        UltimaFechaCompra: normalizeCellValue(ultimaFechaCompra) || null,
        UltimoPrecioCompra: parseImportNumber(ultimoPrecioRaw),
        UltimaMonedaCompra: normalizeCellValue(ultimaMonedaCompra) || null,
      } as MaterialImportRow;
    })
    .filter((x) => !!x.NumeroArticulo && !!x.DescripcionArticulo && !!x.UnidadMedida);
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

export async function listarMaterialesConStockController(_req: Request, res: Response) {
  try {
    const materiales = await listarMaterialesConStock();
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

    return res.sendFile(fullPath);
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
      return res.status(404).json({ message: 'Imagen no encontrada para el material' });
    }

    console.log('MATERIALES_IMG_ROOT = ', process.env.MATERIALES_IMG_ROOT);
    const root = process.env.MATERIALES_IMG_ROOT;
    if (!root) {
      return res.status(500).json({ message: 'Ruta de imágenes no configurada en el servidor' });
    }

    const filename = path.basename(data.RutaImagenFinal);
    const fullPath = path.join(root, filename);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'Archivo de imagen no encontrado en NAS' });
    }

    return res.sendFile(fullPath);
  } catch (error) {
    console.error('Error en obtenerArchivoImagenMaterialPorNumeroArticuloController', error);
    return res.status(500).json({ message: 'Error al obtener el archivo de imagen del material' });
  }
}

export async function verImagenMaterialController(req: Request, res: Response) {
  try {
    const ruta = String(req.query.ruta || '');

    if (!ruta) {
      return res.status(400).json({ message: 'Ruta de imagen no proporcionada' });
    }

    const root = env.MATERIALES_IMG_ROOT;
    const isAbsoluteWin = /^[a-zA-Z]:\\/.test(ruta);
    const isUnc = ruta.startsWith('\\\\') || ruta.startsWith('\\');

    // Normalizar: aceptamos ruta relativa (recomendada) o absoluta UNC/Windows.
    // Si hay ROOT configurado, forzamos que la ruta resuelva dentro del ROOT.
    let resolvedPath: string;
    if (root) {
      // Evitar path traversal: quitamos prefijos de separadores y resolvemos.
      const cleaned = ruta.replace(/^[\\/]+/, '').replace(/\.{2,}/g, '.');
      resolvedPath = path.resolve(root, cleaned);
      const rootResolved = path.resolve(root);
      if (!resolvedPath.toLowerCase().startsWith(rootResolved.toLowerCase() + path.sep) && resolvedPath.toLowerCase() !== rootResolved.toLowerCase()) {
        return res.status(400).json({ message: 'Ruta de imagen inválida' });
      }
    } else {
      // Sin ROOT: permitimos el comportamiento anterior (absoluto), pero bloqueamos relativas sospechosas.
      if (!isAbsoluteWin && !isUnc) {
        return res.status(400).json({ message: 'Configura MATERIALES_IMG_ROOT para usar rutas relativas' });
      }
      resolvedPath = ruta;
    }

    // Comprobar si el archivo existe
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'Imagen no encontrada en el almacenamiento' });
    }

    // Configurar encabezados básicos (pueder ser mejorado con mime-types según extensión)
    const ext = path.extname(resolvedPath).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.svg') contentType = 'image/svg+xml';

    res.setHeader('Content-Type', contentType);

    // Streamear el archivo desde el NAS/FileSystem al frontend
    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', (err) => {
      console.error('Error enviando la imagen:', err);
      res.status(500).end('Error al leer la imagen');
    });

    stream.pipe(res);
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

    await importarMaterialesYStock(datos, req.userId);

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
