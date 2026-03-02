import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import {
  listarMateriales,
  listarMaterialesConStock,
  crearMaterial,
  actualizarMaterial,
  eliminarMaterial,
  importarMaterialesYStock,
  MaterialImportRow,
} from './materiales.service';
import { registrarAuditoria } from '../auditoria/auditoria.service';
import { parse as parseCsv } from 'csv-parse/sync';

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
    return res.status(500).json({ message: 'Error al listar materiales con stock' });
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
    return res.status(400).json({ message: 'Archivo CSV requerido (campo "file")' });
  }

  try {
    const content = file.buffer.toString('utf-8');

    // Detectar delimitador automáticamente según la primera línea
    const firstLine = content.split(/\r?\n/)[0] ?? '';
    let delimiter: string = ';';
    if (firstLine.includes(';') && !firstLine.includes(',')) {
      delimiter = ';';
    } else if (firstLine.includes(',') && !firstLine.includes(';')) {
      delimiter = ',';
    } else if (firstLine.includes(';') && firstLine.includes(',')) {
      // Si tiene ambos, priorizamos ';' por defecto
      delimiter = ';';
    }

    const records: any[] = parseCsv(content, {
      columns: true,
      skip_empty_lines: true,
      delimiter,
      trim: true,
    });

    const datos: MaterialImportRow[] = records
      .map((r) => {
        // Normalizar nombres de columnas (lowercase, trim, sin BOM)
        const normalize = (s: string) => s.replace(/^\uFEFF/, '').trim().toLowerCase();
        const keyMap: Record<string, string> = {};
        for (const key of Object.keys(r)) {
          keyMap[normalize(key)] = key;
        }

        const getField = (names: string[]): any => {
          for (const name of names) {
            const normalized = name.toLowerCase();
            const realKey = keyMap[normalized];
            if (realKey !== undefined) {
              return r[realKey];
            }
          }
          return undefined;
        };

        const numeroArticulo = getField(['numeroarticulo', 'numeroartic']);
        const descripcionArticulo = getField(['descripcionarticulo', 'descripcion']);
        const unidadMedida = getField(['unidadmedida', 'unidadmedi']);
        const enStockRaw = getField(['enstock']);
        const grupoArticulos = getField(['grupoarticulos', 'grupoarticu']);
        const ultimaFechaCompra = getField(['ultimafechacompra', 'ultimafecha']);
        const ultimoPrecioRaw = getField(['ultimopreciocompra', 'ultimopreci']);
        const ultimaMonedaCompra = getField(['ultimamonedacompra', 'ultimamone']);

        const parseNumber = (value: any): number | null => {
          if (value === null || value === undefined || value === '') return null;
          if (typeof value === 'number') return value;
          const str = String(value).trim();
          // Reemplazamos separador de miles "," y dejamos punto como decimal
          const normalized = str.replace(/"/g, '').replace(/\./g, '.').replace(/,/g, '');
          const n = Number(normalized);
          return Number.isNaN(n) ? null : n;
        };

        return {
          NumeroArticulo: numeroArticulo,
          DescripcionArticulo: descripcionArticulo,
          EnStock: parseNumber(enStockRaw) ?? 0,
          UnidadMedida: unidadMedida,
          GrupoArticulos: grupoArticulos ?? null,
          UltimaFechaCompra: ultimaFechaCompra ?? null,
          UltimoPrecioCompra: parseNumber(ultimoPrecioRaw),
          UltimaMonedaCompra: ultimaMonedaCompra ?? null,
        } as MaterialImportRow;
      })
      .filter((x) => !!x.NumeroArticulo && !!x.DescripcionArticulo && !!x.UnidadMedida);

    if (!datos.length) {
      return res.status(400).json({ message: 'El CSV no contiene filas válidas de materiales' });
    }

    await importarMaterialesYStock(datos, req.userId);

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

    return res.status(200).json({ message: 'Importación realizada correctamente', filas: datos.length });
  } catch (error: any) {
    console.error('Error en importarMaterialesController', error);
    return res.status(500).json({ message: 'Error al importar materiales desde CSV' });
  }
}
