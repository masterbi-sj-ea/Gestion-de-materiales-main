import { useRef, useState } from 'react';
import * as xlsx from 'xlsx';
import { UploadCloud, Loader2 } from 'lucide-react';
import { sileo as toast } from 'sileo';
import { apiFetch } from '../services/apiClient';
import { Button } from './ui/button';

interface Props {
  onSuccess: () => void;
}

interface FilaExcelImportacion {
  Fecha: string | null;
  CodigoCuenta: string | null;
  ValorAjustado: number | null;
}

interface ErrorImportacionApi {
  fila: number;
  codigoCuenta: string | null;
  motivo: string;
}

function normalizarEncabezado(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizarCodigoCuenta(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text || text === '-') {
    return null;
  }

  return text.replace(/\.0+$/, '').replace(/\s+/g, '');
}

function normalizarMonto(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  let text = String(value).trim();
  if (!text) {
    return null;
  }

  if (text === '-') {
    return 0;
  }

  text = text.replace(/\s+/g, '').replace(/\$/g, '');

  const commaIndex = text.lastIndexOf(',');
  const dotIndex = text.lastIndexOf('.');

  if (commaIndex >= 0 && dotIndex >= 0) {
    if (dotIndex > commaIndex) {
      text = text.replace(/,/g, '');
    } else {
      text = text.replace(/\./g, '').replace(',', '.');
    }
  } else if (commaIndex >= 0) {
    const decimalDigits = text.length - commaIndex - 1;
    text = decimalDigits <= 2 ? text.replace(',', '.') : text.replace(/,/g, '');
  }

  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

function normalizarFecha(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }

    const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    return date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const latinMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (latinMatch) {
    const [, day, month, year] = latinMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

function leerFilasExcel(sheet: xlsx.WorkSheet): FilaExcelImportacion[] {
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  return rows.map((row) => {
    const normalizedRow = Object.entries(row).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
      accumulator[normalizarEncabezado(key)] = value;
      return accumulator;
    }, {});

    return {
      Fecha: normalizarFecha(normalizedRow['FECHA']),
      CodigoCuenta: normalizarCodigoCuenta(normalizedRow['CODIGO DE CUENTA']),
      ValorAjustado: normalizarMonto(normalizedRow['VALOR AJUSTADO']),
    };
  });
}

function construirMensajeError(message: string, errors: ErrorImportacionApi[] | undefined): string {
  if (!errors?.length) {
    return message;
  }

  const firstError = errors[0];
  const codeLabel = firstError.codigoCuenta ? ` Cuenta ${firstError.codigoCuenta}.` : '';
  return `${message} Fila ${firstError.fila}.${codeLabel} ${firstError.motivo}`;
}

export function ImportadorExcelPresupuesto({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      setLoading(true);

      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, {
        type: 'array',
        cellDates: true,
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const filas = leerFilasExcel(sheet);

      if (filas.length === 0) {
        toast.error({
          title: 'Archivo vacio',
          description: 'El archivo Excel no contiene filas para importar.',
        });
        return;
      }

      const response = await apiFetch('/presupuestos/importar', {
        method: 'POST',
        body: JSON.stringify({ filas }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const errors = Array.isArray(payload?.errors) ? (payload.errors as ErrorImportacionApi[]) : undefined;
        if (errors?.length) {
          console.table(errors);
        }
        throw new Error(construirMensajeError(payload?.message || 'No se pudo importar el presupuesto.', errors));
      }

      toast.success({
        title: 'Importacion exitosa',
        description: `${payload?.filasAplicadas ?? 0} filas utiles consolidadas en ${payload?.procesados ?? 0} presupuesto(s).`,
      });
      onSuccess();
    } catch (error: any) {
      console.error('Error importando Excel:', error);
      toast.error({
        title: 'Error al importar',
        description: error?.message || 'Error al importar el archivo de presupuesto.',
      });
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <input
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={processFile}
      />
      <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
        Importar Excel
      </Button>
    </>
  );
}
