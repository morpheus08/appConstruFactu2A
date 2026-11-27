// js/services/verifactu-backup.js
// Export/Import de backup para conservación de registros Verifactu.
(function (CF) {
  'use strict';
  if (!CF) return;

  CF.VerifactuBackup = {
    init: function () {
      var estado = window.ConstruFactu.Store.state;
      if (!estado || !estado.VERIFACTU_ENABLED) return; 
      // TODO: Inicialización de UI de backup en ajustes
    },

    exportarCierreEmpresa: async function (informarProgreso) {
      if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('Este navegador no permite verificar de forma segura la escritura de los archivos. Usa una versión reciente de Chrome o Edge para cerrar la empresa.');
      }
      if (!window.JSZip) throw new Error('No se pudo cargar JSZip para crear el archivo de facturas.');
      if (typeof window.generarPDFVectorial !== 'function') throw new Error('No se pudo cargar el generador de PDF.');

      const directorio = await window.showDirectoryPicker({ mode: 'readwrite' });
      const estado = JSON.parse(JSON.stringify(window.ConstruFactu.Store.state));
      const documentos = estado.documentos || [];
      const backupVerifactu = {
        verifactuLog: estado.verifactuLog || [],
        contadoresVerifactu: estado.contadoresVerifactu || {},
        ultimoHashVerifactu: Object.prototype.hasOwnProperty.call(estado, 'ultimoHashVerifactu')
          ? estado.ultimoHashVerifactu
          : null
      };
      const backupGeneral = { ...estado };
      backupGeneral.documentos = documentos.filter(doc => doc.estado !== 'Oficial');
      delete backupGeneral.verifactuLog;
      delete backupGeneral.contadoresVerifactu;
      delete backupGeneral.ultimoHashVerifactu;

      const facturasOficiales = documentos.filter(doc =>
        (doc.tipo === 'factura' || doc.tipo === 'rectificativa') &&
        doc.estado === 'Oficial'
      );
      const zipFacturas = new window.JSZip();
      const nombresPDF = new Set();
      const informar = mensaje => {
        if (typeof informarProgreso === 'function') informarProgreso(mensaje);
      };

      for (let indice = 0; indice < facturasOficiales.length; indice += 1) {
        const doc = facturasOficiales[indice];
        informar(`Generando PDF oficial ${indice + 1} de ${facturasOficiales.length}...`);
        const pdf = await window.generarPDFVectorial(doc.id, estado);
        const blob = pdf.output('blob');
        if (!blob || !blob.size) throw new Error(`El PDF de ${doc.numero || doc.id} está vacío.`);

        const nombreBase = String(doc.numero || doc.id || `factura-${indice + 1}`)
          .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
          .trim() || `factura-${indice + 1}`;
        let nombre = `${nombreBase}.pdf`;
        let repetido = 2;
        while (nombresPDF.has(nombre.toLowerCase())) {
          nombre = `${nombreBase} (${repetido}).pdf`;
          repetido += 1;
        }
        nombresPDF.add(nombre.toLowerCase());
        zipFacturas.file(nombre, blob, { compression: 'STORE' });
      }

      informar('Empaquetando los PDFs oficiales...');
      const facturasZipBlob = await zipFacturas.generateAsync({ type: 'blob', compression: 'STORE' });
      const marcaTiempo = new Date().toISOString().replace(/[:.]/g, '-');
      const carpetaNombre = `ConstruFactu_Seguridad_${marcaTiempo}`;
      const carpetaBackup = await directorio.getDirectoryHandle(carpetaNombre, { create: true });
      const archivos = [
        { nombre: 'backup_verifactu.json', contenido: new Blob([JSON.stringify(backupVerifactu, null, 2)], { type: 'application/json' }) },
        { nombre: 'backup_general.json', contenido: new Blob([JSON.stringify(backupGeneral, null, 2)], { type: 'application/json' }) },
        { nombre: 'facturas_pdf.zip', contenido: facturasZipBlob }
      ];

      for (let indice = 0; indice < archivos.length; indice += 1) {
        const archivo = archivos[indice];
        informar(`Guardando ${archivo.nombre} (${indice + 1} de ${archivos.length})...`);
        const handle = await carpetaBackup.getFileHandle(archivo.nombre, { create: true });
        const writable = await handle.createWritable();
        try {
          await writable.write(archivo.contenido);
          await writable.close();
        } catch (error) {
          try {
            await writable.abort();
          } catch (abortError) {
            console.error('[copia cierre] No se pudo cancelar una escritura incompleta:', abortError);
          }
          throw error;
        }
      }

      return carpetaNombre;
    },

    exportar: async function () {
      try {
        const estado = window.ConstruFactu.Store.state;
        
        // 1. Filtrar solo los datos necesarios
        const dataExport = {
          documentos: estado.documentos.filter(d => d.estado === 'Oficial'),
          verifactuLog: estado.verifactuLog || [],
          contadoresVerifactu: estado.contadoresVerifactu || {},
          ultimoHashVerifactu: estado.ultimoHashVerifactu,
          empresa: estado.empresa,
          clientes: estado.clientes,
          backupConfig: estado.backupConfig
        };

        // 2. Calcular firma (Hash SHA-256 del JSON)
        const payloadString = JSON.stringify(dataExport);
        let firma = '';
        
        if (window.ConstruFactu.Verifactu && window.ConstruFactu.Verifactu.sha256) {
          firma = await window.ConstruFactu.Verifactu.sha256(payloadString);
        } else {
          // Fallback usando WebCrypto directo
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadString));
          firma = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // 3. Empaquetar
        const backupData = {
          meta: {
            version: '1.0',
            fechaExport: new Date().toISOString(),
            firma: firma
          },
          payload: dataExport
        };

        const jsonString = JSON.stringify(backupData, null, 2);
        const filename = `construfactu-backup-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.cfvbackup`;

        // 4. Guardar archivo
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: filename,
              types: [{ description: 'ConstruFactu Backup', accept: { 'application/json': ['.cfvbackup'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(jsonString);
            await writable.close();
          } catch (err) {
            if (err.name !== 'AbortError') throw err;
            return; // Usuario canceló
          }
        } else {
          // Fallback descarga clásica
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        // 5. Actualizar estado interno
        estado.backupConfig.ultimoExportEn = new Date().toISOString();
        estado.backupConfig.ultimoHashExportado = estado.ultimoHashVerifactu;
        
        // Añadir al log
        if (!estado.verifactuLog) estado.verifactuLog = [];
        estado.verifactuLog.push({
          tipo: 'export',
          fecha: new Date().toISOString(),
          ultimoHashExportado: estado.ultimoHashVerifactu
        });

        window.ConstruFactu.Store.save();
        console.log('✅ Backup exportado correctamente.');
        return true;

      } catch (error) {
        console.error('Error al exportar backup:', error);
        alert('Error al exportar: ' + error.message);
        return false;
      }
    },

    importar: async function (file) {
      try {
        const text = await file.text();
        const backupData = JSON.parse(text);

        // 1. Verificar estructura básica
        if (!backupData.meta || !backupData.meta.firma || !backupData.payload) {
          throw new Error('El archivo no tiene el formato de backup de ConstruFactu.');
        }

        // 2. Verificar firma
        const payloadString = JSON.stringify(backupData.payload);
        let firmaCalculada = '';
        
        if (window.ConstruFactu.Verifactu && window.ConstruFactu.Verifactu.sha256) {
          firmaCalculada = await window.ConstruFactu.Verifactu.sha256(payloadString);
        } else {
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadString));
          firmaCalculada = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        if (firmaCalculada !== backupData.meta.firma) {
          throw new Error('La firma del archivo no es válida. El archivo ha sido manipulado o está corrupto.');
        }

        // 3. (Opcional) Aquí se podría llamar a window.ConstruFactu.Verifactu.verificarCadena() 
        // pasándole el payload antes de importarlo para máxima seguridad.

        // 4. Restaurar datos
        const estado = window.ConstruFactu.Store.state;
        estado.documentos = estado.documentos.filter(d => d.estado !== 'Oficial'); // Mantenemos los locales
        estado.documentos = estado.documentos.concat(backupData.payload.documentos); // Añadimos los oficiales
        
        estado.verifactuLog = backupData.payload.verifactuLog;
        estado.contadoresVerifactu = backupData.payload.contadoresVerifactu;
        estado.ultimoHashVerifactu = backupData.payload.ultimoHashVerifactu;
        estado.empresa = backupData.payload.empresa;
        estado.clientes = backupData.payload.clientes;
        estado.backupConfig = backupData.payload.backupConfig;
        
        // Marcar dispositivo como maestro
        estado.dispositivoRol = 'maestro';

        window.ConstruFactu.Store.save();
        console.log('✅ Backup restaurado correctamente.');
        return true;

      } catch (error) {
        console.error('Error al importar backup:', error);
        alert('Error al importar: ' + error.message);
        return false;
      }
    }
  };
})(window.ConstruFactu);