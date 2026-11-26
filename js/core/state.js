const DEV_MODE = false; // <-- INTERRUPTOR GLOBAL (Cambiar a false para producción)
const estadoInicialPorDefecto = {
  VERIFACTU_ENABLED: true, // <-- Interruptor Verifactu (desactivado por defecto)
  auth: { email: '', intentos: 0, bloqueadoHasta: 0 },
  empresa: { nombre: '', nif: '', direccion: '', iban: '', serie: 'F2026', serieRectificativa: 'R2026', logo: '', frecuenciaRecordatorio: '7', fechaCreacionSistema: new Date().toISOString(), licenciaTipo: 'prueba', licenciaExpiracion: '', modoVerifactu: 'no_verifactu', updatedAt: Date.now() },
  unidades: ['ud', 'm²', 'ml', 'm³', 'h', 'pa', 'kg', 'día'],
  catalogoPrecios: [],
  clientes: [],
  documentos: [],
  gastos: [],
  proveedores: [],
  ultimoHashVerifactu: '0000000000000000000000000000000000000000000000000000000000000000',
  verifactuLog: [],
  verifactuLogUpdatedAt: 0,
  contadoresVerifactu: {},
  contadoresVerifactuUpdatedAt: 0,
  verifactuConflictos: [],
  
  // --- Verifactu (Paso C) ---
  dispositivoRol: null,          // 'maestro' | 'satelite' | null (pendiente de elegir)
  rolAceptadoEn: null,           // ISO timestamp de la aceptación de responsabilidad
  backupConfig: {
    ultimoExportEn: null,        // ISO timestamp del último backup exitoso
    ultimoHashExportado: null,   // Hash del último registro incluido en el backup
    exportObligatorioAntesDeEmitir: true, // Exigir backup antes de la 1ª factura oficial
    frecuenciaAvisoDias: 30      // Días para avisar de que toca nuevo backup
  }
};