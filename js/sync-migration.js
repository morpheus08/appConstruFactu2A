/**
 * ConstruFactu - Migración para Sincronización
 * Añade updatedAt y deletedAt a clientes, documentos y gastos.
 */
(function (CF) {
    'use strict';

    CF.SyncMigration = CF.SyncMigration || {};

    CF.SyncMigration.run = function () {
        return new Promise((resolve, reject) => {
            // Abrimos tu base de datos ConstruFactuDB_v0928
            const request = indexedDB.open('ConstruFactuDB_v0928');

            request.onerror = (e) => {
                console.error("Error abriendo IndexedDB:", e);
                reject(e);
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('state_store')) {
                    console.warn("No se encontró state_store. Abortando migración.");
                    return resolve(false);
                }

                const tx = db.transaction('state_store', 'readwrite');
                const store = tx.objectStore('state_store');

                // 👇 CORREGIDO: Usamos la llave correcta de tu app
                const getReq = store.get('construfactu_data'); 

                getReq.onsuccess = (e) => {
                    const stateStr = e.target.result;
                    if (!stateStr) {
                        console.warn("No hay datos guardados aún. Omitiendo.");
                        return resolve(false);
                    }

                    let stateData;
                    try {
                        stateData = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
                    } catch (err) {
                        console.error("Error parseando el JSON de state_store:", err);
                        return reject(err);
                    }

                    let modificados = 0;
                    const ahora = Date.now();

                    const migrarArray = (arr) => {
                        if (!Array.isArray(arr)) return arr;
                        return arr.map(item => {
                            let changed = false;
                            // Si por lo que sea un elemento no tiene ID, se lo creamos
                            if (!item.id) {
                                item.id = 'local_' + ahora + '_' + Math.random().toString(36).substr(2, 9);
                                changed = true;
                            }
                            if (!item.updatedAt) {
                                item.updatedAt = ahora;
                                changed = true;
                            }
                            if (item.deletedAt === undefined) {
                                item.deletedAt = null;
                                changed = true;
                            }
                            if (changed) modificados++;
                            return item;
                        });
                    };

                    if (stateData.clientes) stateData.clientes = migrarArray(stateData.clientes);
                    if (stateData.documentos) stateData.documentos = migrarArray(stateData.documentos);
                    if (stateData.gastos) stateData.gastos = migrarArray(stateData.gastos);

                    if (modificados === 0) {
                        console.log("✅ Base de datos ya estaba actualizada. Nada que migrar.");
                        return resolve(true);
                    }

                    // 👇 CORREGIDO: Guardamos con la llave correcta
                    const putReq = store.put(JSON.stringify(stateData), 'construfactu_data');
                    
                    putReq.onsuccess = () => {
                        console.log(`✅ Migración completada. Se actualizaron ${modificados} elementos.`);
                        resolve(true);
                    };
                    
                    putReq.onerror = (err) => {
                        console.error("Error guardando los datos migrados:", err);
                        reject(err);
                    };
                };

                getReq.onerror = (err) => reject(err);
            };
        });
    };

})(window.ConstruFactu = window.ConstruFactu || {});