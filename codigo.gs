// =============================================
// === CONFIGURACIÓN DE HOJAS DE CÁLCULO =======
// =============================================
const SPREADSHEET_ID = '1vW1xLbOV6jIJ4j03-Py9jJqxE4y3Ahxj4uQzMVt5RDM';

const SHEET_MODELOS = "Modelos_Productos"; // Nivel 3
const SHEET_RECETAS = "Recetas";           // Nivel 2 (La Maestra)
const SHEET_RECETAS_DETALLE = "Recetas_Maestra"; // Nivel 1 (El Escandallo)
const SHEET_INSUMOS = "Ingredientes";      // Nivel 0

/**
 * ¡NO EJECUTAR ESTA FUNCIÓN MANUALMENTE!
 * Esta función es llamada por el navegador.
 * Causa el error "no mostró ningún valor" si se ejecuta desde el editor.
 */
function doGet(e) {
  let page = e.parameter.page;
  let template;
  let title = 'Gestión de Producción';

  if (page === 'recetas' && e.parameter.id_model) {
    template = HtmlService.createTemplateFromFile('recetas');
    template.idModelo = e.parameter.id_model;
    title = 'Seleccionar Receta';
  } else if (page === 'detalle' && e.parameter.id_receta) {
    template = HtmlService.createTemplateFromFile('detalle');
    template.idReceta = e.parameter.id_receta;
    title = 'Detalle de Costeo';
  } else {
    // 'produccion' o la página principal por defecto
    template = HtmlService.createTemplateFromFile('produccion');
    title = 'Lista de Modelos';
  }
  
  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * HELPER: Obtiene la hoja de cálculo por su nombre.
 */
function getSheetByName(name) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      throw new Error(`No se encontró la pestaña "${name}".`);
    }
    return sheet;
  } catch (e) {
    console.error(`Error abriendo SPREADSHEET_ID. ¿Es correcto? ${SPREADSHEET_ID}. Error: ${e.message}`);
    throw new Error(`Error fatal de configuración: ${e.message}`);
  }
}

/**
 * HELPER: Convierte un rango de Google Sheets a un Array de Objetos.
 */
function convertRangeToObjects(data) {
  const headers = data[0].map(String);
  const rows = data.slice(1);
  return rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

// =============================================
// === APIs DEL MÓDULO DE PRODUCCIÓN (NUEVO) ===
// =============================================

/**
 * (API - Nivel 3) Obtiene la lista de todos los Modelos.
 * Esta función SÍ se puede ejecutar manualmente para probar permisos.
 */
function getModelos() {
  try {
    const sheet = getSheetByName(SHEET_MODELOS);
    // Guardia de corrección
    if (sheet.getLastRow() < 2) {
      Logger.log("getModelos: La hoja 'Modelos_Productos' no tiene datos.");
      return []; 
    }
    
    const data = sheet.getDataRange().getValues();
    const objects = convertRangeToObjects(data);
    Logger.log(`getModelos: Encontrados ${objects.length} modelos.`);
    return objects;

  } catch (error) {
    console.error('Error en getModelos:', error);
    throw new Error(`Error al obtener Modelos: ${error.message}`);
  }
}

/**
 * (API - Nivel 2) Obtiene las Recetas para un Modelo específico.
 */
function getRecetasPorModelo(idModelo) {
  try {
    const sheet = getSheetByName(SHEET_RECETAS);
    // Guardia de corrección
    if (sheet.getLastRow() < 2) {
      Logger.log(`getRecetasPorModelo: La hoja 'Recetas' no tiene datos.`);
      return []; 
    }
    
    const data = convertRangeToObjects(sheet.getDataRange().getValues());
    Logger.log(`getRecetasPorModelo: Se leyeron ${data.length} recetas. Filtrando por ID_Model: ${idModelo}`);
    
    if (data.length > 0 && !data[0].hasOwnProperty('ID_Model')) {
      Logger.log(`¡ADVERTENCIA! La cabecera 'ID_Model' no se encontró en 'Recetas'. Cabeceras encontradas: ${Object.keys(data[0]).join(', ')}`);
    }

    const recetas = data.filter(receta => receta.ID_Model == idModelo);
    Logger.log(`getRecetasPorModelo: Encontradas ${recetas.length} recetas para este modelo.`);
    return recetas;

  } catch (error) {
    console.error('Error en getRecetasPorModelo:', error);
    throw new Error(`Error al obtener Recetas: ${error.message}`);
  }
}


/**
 * (API - Nivel 1 y 0) "Explota" una Receta para obtener su costo detallado.
 */
function getRecetaDetalle(idReceta) {
  try {
    // Guardias de corrección
    const insumosSheet = getSheetByName(SHEET_INSUMOS);
    if (insumosSheet.getLastRow() < 2) throw new Error("La hoja 'Ingredientes' está vacía o solo tiene cabecera.");
    
    const recetasSheet = getSheetByName(SHEET_RECETAS);
    if (recetasSheet.getLastRow() < 2) throw new Error("La hoja 'Recetas' está vacía o solo tiene cabecera.");

    const detalleSheet = getSheetByName(SHEET_RECETAS_DETALLE);
    if (detalleSheet.getLastRow() < 2) throw new Error("La hoja 'Recetas_Maestra' (detalle) está vacía o solo tiene cabecera.");

    // Nivel 0: Insumos (Mapa de Precios)
    const insumosData = insumosSheet.getDataRange().getValues();
    const insumosMap = new Map();
    convertRangeToObjects(insumosData).forEach(insumo => {
      insumosMap.set(insumo.Cod_Ingrediente, {
        nombre: insumo.Nombre,
        precioGramado: parseFloat(insumo.PrecioGramado) || 0
      });
    });

    // Nivel 2: Info de la Receta Maestra
    const recetasData = convertRangeToObjects(recetasSheet.getDataRange().getValues());
    const recetaInfo = recetasData.find(r => r.ID_Receta == idReceta);
    if (!recetaInfo) throw new Error("Receta no encontrada en la hoja 'Recetas'.");

    const rendimientoGramos = parseFloat(recetaInfo.Peso_del_Producto_en_gramos) || 1;

    // Nivel 1: El Escandallo
    const detalleData = convertRangeToObjects(detalleSheet.getDataRange().getValues());
    const insumosDeLaReceta = detalleData.filter(item => item.ID_Receta == idReceta);

    // ... (Cálculo sin cambios) ...
    let costoTotalReceta = 0;
    let insumosCalculados = [];

    for (const item of insumosDeLaReceta) {
      const idInsumo = item.Cod_Ingrediente;
      const cantidadGramos = parseFloat(item.Cantidad_del_Ingrediente) || 0;
      const infoInsumo = insumosMap.get(idInsumo);

      if (infoInsumo) {
        const subtotal = cantidadGramos * infoInsumo.precioGramado;
        costoTotalReceta += subtotal;
        
        insumosCalculados.push({
          nombre: infoInsumo.nombre,
          cantidad: cantidadGramos,
          precioGramado: infoInsumo.precioGramado,
          subtotal: subtotal
        });
      }
    } 

    return {
      recetaInfo: recetaInfo,
      costoTotal: costoTotalReceta,
      costoPorGramo: costoTotalReceta / rendimientoGramos,
      rendimiento: rendimientoGramos,
      insumos: insumosCalculados
    };

  } catch (error) {
    console.error(`Error en getRecetaDetalle (${idReceta}):`, error);
    throw new Error(`Error al calcular detalle: ${error.message}.`);
  }
}
