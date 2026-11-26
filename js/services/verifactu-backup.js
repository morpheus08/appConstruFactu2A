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