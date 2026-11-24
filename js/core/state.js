const DEV_MODE = true; // <-- INTERRUPTOR GLOBAL (Cambiar a false para producción)
const estadoInicialPorDefecto = {
  auth: { email: '', intentos: 0, bloqueadoHasta: 0 },
  empresa: { nombre: 'Construcciones García S.L.', nif: 'B41987654', direccion: 'Pol. Ind. El Pino, Nave 12 · 41016 Sevilla', iban: 'ES91 2100 0418 4502 0005 1332', serie: 'F2026', serieRectificativa: 'R2026', logo: '', frecuenciaRecordatorio: '7', fechaCreacionSistema: new Date().toISOString(), licenciaTipo: 'prueba', licenciaExpiracion: '', modoVerifactu: 'no_verifactu', updatedAt: Date.now() },
  unidades: ['ud', 'm²', 'ml', 'm³', 'h', 'pa', 'kg', 'día'],
  catalogoPrecios: [
    { id: 't1', capitulo: 'Revestimientos', concepto: 'Alicatado porcelánico baño/cocina', unidad: 'm²', precio: 32.00 },
    { id: 't2', capitulo: 'Albañilería', concepto: 'Enfoscado maestreado mortero cemento', unidad: 'm²', precio: 18.00 }
  ],
  clientes: [
    { id: 'c1', nombre: 'Promociones Aljarafe S.L.', nif: 'B91234567', direccion: 'Avda. de Europa 44', cp: '41927', poblacion: 'Mairena del Aljarafe (Sevilla)', telefono: '954000000', movil: '654321987', email: 'obras@aljarafe.es', observaciones: 'Forma de pago transferencia 30 días' },
    { id: 'c2', nombre: 'Manuel Fernández Ruiz', nif: '28765432M', direccion: 'C/ Real 18', cp: '41800', poblacion: 'Sanlúcar la Mayor (Sevilla)', telefono: '955000000', movil: '611223344', email: 'mfernandez@email.com', observaciones: 'Llamar antes de entregar' }
  ],
  documentos: [
    {
      id: 'd1', tipo: 'presupuesto', numero: 'P2026-001', clienteId: 'c2', obra: 'Reforma integral baño', fecha: '2026-11-05', iva: 10, estado: 'Aceptado',
      observaciones: 'Validez 15 días.', lineas: [{ concepto: 'Alicatado porcelánico baño/cocina', cantidad: 22, unidad: 'm²', precio: 32.00 }]
    }
  ],
  gastos: [],
  proveedores: [
    { id: 'prov1', nombre: 'Materiales de Construcción Sevilla S.A.', nif: 'A41122334', telefono: '954111222', contacto: 'Juan Pérez' },
    { id: 'prov2', nombre: 'Alquileres Maquinaria Andaluza', nif: 'B41555666', telefono: '955444333', contacto: 'Rafa Gómez' }
  ],
  ultimoHashVerifactu: '0000000000000000000000000000000000000000000000000000000000000000',
  verifactuLog: [],
  verifactuLogUpdatedAt: 0,
  contadoresVerifactu: {},
  contadoresVerifactuUpdatedAt: 0,
  verifactuConflictos: []
};
