
import fs from 'fs';
import path from 'path';
import * as solicitudesService from './src/modules/solicitudes/solicitudes.service';
import { getPool } from './src/config/db';

function streamToFile(stream: NodeJS.ReadableStream, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const out = fs.createWriteStream(filePath);
        stream.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        stream.on('error', reject);
    });
}

async function test_solicitud_pro() {
    console.log('--- INICIANDO PRUEBA DE SOLICITUD PRO (ÁREAS MIXTAS) ---');
    
    try {
                const pool = await getPool();

                // Buscar IDs reales por códigos conocidos (si no existen, caer a los primeros encontrados)
                const areaCodes = ['CPKO', 'APP.COMPOST'];
                const materialCodes = ['AC1101', 'AC1166'];

                const areasRes = await pool.request().query(`
                    SELECT TOP 10 IdArea, Codigo, Nombre
                    FROM Areas
                    WHERE Codigo IN ('${areaCodes.join("','")}')
                    ORDER BY CASE WHEN Codigo = 'CPKO' THEN 0 ELSE 1 END, IdArea;
                `);
                const areas = areasRes.recordset as { IdArea: number; Codigo: string; Nombre: string }[];
                if (areas.length < 2) {
                    const fallbackRes = await pool.request().query(`SELECT TOP 2 IdArea, Codigo, Nombre FROM Areas ORDER BY IdArea;`);
                    areas.push(...(fallbackRes.recordset as any[]));
                }

                const materialesRes = await pool.request().query(`
                    SELECT TOP 10 IdMaterial, NumeroArticulo, DescripcionArticulo
                    FROM Materiales
                    WHERE NumeroArticulo IN ('${materialCodes.join("','")}')
                    ORDER BY CASE WHEN NumeroArticulo = 'AC1101' THEN 0 ELSE 1 END, IdMaterial;
                `);
                const mats = materialesRes.recordset as { IdMaterial: number; NumeroArticulo: string; DescripcionArticulo: string }[];
                if (mats.length < 2) {
                    throw new Error('No se encontraron materiales AC1101/AC1166 en la tabla Materiales.');
                }

                const area1 = areas[0];
                const area2 = areas[1];
                const mat1 = mats.find(m => m.NumeroArticulo === 'AC1101') ?? mats[0];
                const mat2 = mats.find(m => m.NumeroArticulo === 'AC1166') ?? mats[1];

                console.log('Áreas usadas:', area1, area2);
                console.log('Materiales usados:', mat1, mat2);

                // 1) Crear solicitud con 2 líneas y áreas distintas
                const mockInput = {
                    idSolicitante: 1,
                    fechaSolicitud: new Date().toISOString(),
                    idArea: area1.IdArea,
                    comentario: 'PRUEBA AUTOMATIZADA: ÁREAS MIXTAS POR LÍNEA',
                    detalle: [
                        {
                            idMaterial: mat1.IdMaterial,
                            cantidadSolicitada: 2,
                            unidadMedida: 'UNIDAD',
                            idArea: area1.IdArea,
                        },
                        {
                            idMaterial: mat2.IdMaterial,
                            cantidadSolicitada: 5,
                            unidadMedida: 'UNIDAD',
                            idArea: area2.IdArea,
                        },
                    ],
                };

        console.log('Enviando solicitud al service...');
        // @ts-ignore (evitar quejas de tipos si falta algún campo opcional)
        const result = await solicitudesService.crearSolicitud(mockInput);
        console.log('✅ Solicitud creada con Código:', result.CodigoSolicitud);

                // 2) Verificar qué se guardó en DetalleSolicitudesMaterial (IdArea por línea)
                const detalleGuardado = await pool.request().query(`
                    SELECT d.IdDetalleSolicitud, d.IdMaterial, d.CantidadSolicitada, d.IdArea
                    FROM DetalleSolicitudesMaterial d
                    WHERE d.IdSolicitud = ${result.IdSolicitud}
                    ORDER BY d.IdDetalleSolicitud;
                `);
                console.log('[DB] Detalle guardado (IdArea por línea):', detalleGuardado.recordset);

        // 2. Simular generación de PDF para ver los logs de queryDetalle
        console.log('Simulando generación de PDF para verificar SQL...');
        const pdfStream = await solicitudesService.generarPdfSolicitud(result.IdSolicitud);
        const outPath = path.join(process.cwd(), `Solicitud_TEST_${result.IdSolicitud}.pdf`);
        await streamToFile(pdfStream, outPath);
        console.log('✅ PDF generado en:', outPath);
        
        console.log('--- PRUEBA FINALIZADA CON ÉXITO ---');
        process.exit(0);

    } catch (error) {
        console.error('❌ ERROR EN LA PRUEBA:', error);
        process.exit(1);
    }
}

test_solicitud_pro();
