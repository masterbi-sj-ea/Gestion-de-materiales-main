**Resumen: Control de acceso por Áreas**

Implementación base para controlar qué áreas y catálogos puede ver y usar cada usuario según su cobertura.

**Qué hicimos**
- **Diseño e implementación**: Se creó la arquitectura y la lógica en base de datos para gestionar coberturas de acceso (grupos de acceso que agrupan usuarios, áreas y catálogos).

**Qué creamos**
- **Nuevas tablas**: CatalogosSolicitud, CoberturasAcceso, CoberturaUsuarios, CoberturaAreas, CoberturaCatalogos.
- **Catálogo inicial**: Materiales y Repuestos; Materiales y Repuestos Mtto; Activos Fijos.
- **Stored procedures base**: sp_CrearCoberturaAcceso, sp_AgregarUsuarioCobertura, sp_AgregarAreaCobertura, sp_AgregarCatalogoCobertura, sp_ListarCoberturasAcceso, sp_ObtenerDetalleCobertura.
- **Stored procedures de seguridad**: sp_ListarAreasPermitidasPorUsuario, sp_UsuarioTieneAccesoArea.
- **Cobertura de prueba**: Cobertura Laboratorio y Despacho (usuarios, áreas y catálogo asignados y validados).

**Qué usamos**
- **En base de datos**: SQL Server, tablas relacionales con llaves foráneas, índices únicos y validaciones en SP.
- **Modelo de acceso**: Cobertura = grupo de acceso; Usuarios (quiénes), Áreas (dónde), Catálogos (qué); Tipo de alcance: GLOBAL o RESTRINGIDO.

**Cómo funciona ahora**
- **Asignación**: Un usuario se asocia a una o más coberturas vigentes.
- **Áreas de la cobertura**: Cada cobertura puede tener varias áreas asociadas (por IdArea, no por nombre).
- **Catálogo de la cobertura**: Define el tipo de materiales permitido para la cobertura.
- **Consulta de áreas permitidas**: sp_ListarAreasPermitidasPorUsuario devuelve las áreas según estado del usuario, coberturas vigentes y alcance (GLOBAL devuelve todo; RESTRINGIDO devuelve solo las áreas asignadas).
- **Validación por área**: sp_UsuarioTieneAccesoArea responde si un usuario puede operar en un área específica.

**Qué validamos exitosamente**
- **Estructura**: Tablas y relaciones creadas correctamente.
- **Catálogo**: Catálogos iniciales cargados.
- **Cobertura**: Cobertura de prueba creada y detallada correctamente.
- **Asignaciones**: Usuarios, áreas y catálogos asociados correctamente.
- **SPs**: sp_ListarAreasPermitidasPorUsuario y sp_UsuarioTieneAccesoArea devuelven resultados correctos en pruebas.

**Problemas encontrados y resueltos**
- **Nombres reales de columnas**: Ajustamos a NombreCompleto en dbo.Usuarios y Nombre en dbo.Areas (no usar NombreArea o Nombre duplicado).
- **Usuarios faltantes**: Paola y Jerry no existen en dbo.Usuarios y por eso no pudieron asignarse; lo documentamos.
- **Búsqueda por IdArea**: Evitamos buscar áreas por texto; usamos IdArea para estabilidad.
- **CTE y IF**: Evitamos error de sintaxis con IF después de WITH; reemplazamos por tabla variable para mayor robustez.

**Qué integramos en la app**
- **Backend de áreas**: Se agregó la consulta de áreas permitidas por usuario y el endpoint autenticado /api/areas/mis-areas-permitidas.
- **Validación al guardar**: Crear y actualizar solicitudes ahora valida cada IdArea involucrado con sp_UsuarioTieneAccesoArea antes de persistir.
- **Respuesta segura**: Si el usuario intenta operar sobre un área no autorizada, el backend responde 403 con el mensaje "No tienes autorización para crear solicitudes en esta área.".
- **Frontend Crear Solicitud**: El combo de áreas ahora consume solo las áreas permitidas del usuario autenticado.
- **UX sin cobertura**: Si el usuario no tiene áreas permitidas, el selector queda deshabilitado y muestra "No tienes áreas permitidas".
- **Módulo administrativo v1**: Se agregó la pantalla Coberturas de Acceso para listar coberturas, ver detalle y asignar usuarios, áreas y catálogos desde la app.
- **Registro del módulo**: El alta/actualización del módulo quedó integrado en `backend/sql/init_db.sql`, por lo que ya no depende de scripts de parche separados.

**Qué queda pendiente**
- **Migración**: Importar las coberturas reales desde el Excel (Laguna y Biodigestores, Báscula, Bodega, Nutrifibra, PKO y Harina, HSO, Mantenimiento Extractora, Oficinas y Administración, Proyectos, Activos Fijos Global, etc.).
- **UI administrativa**: Completar edición avanzada, activación/desactivación y remoción de asignaciones dentro del módulo de Coberturas de Acceso.
- **Prueba funcional final**: Validar en ambiente con datos reales que los SP devuelvan exactamente los parámetros y columnas esperados por la app.

**Resumen ejecutivo**
- **Logrado**: Arquitectura diseñada; tablas y SPs implementados; cobertura de prueba validada; integración backend/frontend realizada; validación segura al crear y actualizar solicitudes incorporada; módulo administrativo v1 añadido.
- **Pendiente**: Migración de coberturas reales, pruebas funcionales con datos reales y completar la administración avanzada.

**Siguiente paso recomendado**
- Cargar las coberturas reales desde Excel y luego construir el módulo administrativo para que el mantenimiento deje de depender de scripts manuales.

---
Documento generado para referencia interna y para guiar la siguiente fase de integración.
