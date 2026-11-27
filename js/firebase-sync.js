/**
 * ConstruFactu - Motor de Sincronización en la Nube (Firebase)
 */
(function (CF) {
    'use strict';

    CF.FirebaseSync = CF.FirebaseSync || {};

    const firebaseConfig = {
        apiKey: "AIzaSyBe54VJ5tuK3rsazBRGb4IHAx46OBwbQ88",
        authDomain: "construfactu-sync.firebaseapp.com",
        projectId: "construfactu-sync",
        storageBucket: "construfactu-sync.firebasestorage.app",
        messagingSenderId: "259087095685",
        appId: "1:259087095685:web:6e698fda24dd43997956ec"
    };

    let fbApp = null;
    let fbAuth = null;
    let fbDb = null;
    let sdkCargado = false;
    let cancelarEscucha = null;
    let codigoEscuchado = null;
    let colaSnapshots = Promise.resolve();
    let generacionConexion = 0;
    let temporizadorSubida = null;
    let subidaEnCurso = false;
    let subidaPendiente = false;
    let revisionSubida = 0;
    const clienteSyncId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    let estadoConexion = { texto: 'Sin conexión', tipo: 'inactivo' };

    // 1. Cargar el SDK de Firebase dinámicamente
        // 1. Comprobar el SDK de Firebase (ahora se carga desde index.html)
    function cargarSDK() {
        return new Promise((resolve, reject) => {
            // Si 'firebase' ya está definido en el window, genial.
            if (typeof firebase !== 'undefined') {
                return resolve();
            }
            // Si no está, le damos 3 segundos máximo por si la red va lenta
            let intentos = 0;
            const intervalo = setInterval(() => {
                if (typeof firebase !== 'undefined') {
                    clearInterval(intervalo);
                    resolve();
                } else if (intentos >= 30) { // 30 * 100ms = 3 seg
                    clearInterval(intervalo);
                    reject(new Error('No se pudo cargar Firebase. Comprueba tu conexión o desactiva AdBlock.'));
                }
                intentos++;
            }, 100);
        });
    }

    // 2. Inicializar Firebase y Autenticar Anónimamente
    async function inicializarFirebase() {
        if (!navigator.onLine) throw new Error('Sin conexión a internet. Conéctate y vuelve a intentarlo.');
        
        await cargarSDK();
        
        if (!fbApp) {
            fbApp = firebase.initializeApp(firebaseConfig);
            fbAuth = firebase.auth();
            fbDb = firebase.firestore();
        }

        // Autenticación anónima
        if (!fbAuth.currentUser) {
            await fbAuth.signInAnonymously();
        }
    }

    // 3. Obtener o Generar el Código Nube
    function obtenerCodigoNube() {
        let codigo = localStorage.getItem('construfactu_sync_code');
        if (!codigo) {
            // Genera un código tipo XXXX-XXXX-XXXX
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const gen = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
            codigo = `${gen()}-${gen()}-${gen()}`;
            localStorage.setItem('construfactu_sync_code', codigo);
            localStorage.removeItem('construfactu_sync_joined');
        }
        return codigo;
    }

    // 4. MOTOR DE FUSIÓN INTELIGENTE (El corazón del sistema)
    function fusionarArrays(locales, remotos) {
        const mapa = new Map();

        const incorporar = item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return;
            const id = item.id === undefined || item.id === null || item.id === ''
                ? Symbol('sin-id')
                : item.id;
            const existente = mapa.get(id);
            if (!existente) {
                mapa.set(id, item);
                return;
            }

            const tiempoExistente = tiempoActualizado(existente.updatedAt) || tiempoActualizado(existente.deletedAt);
            const tiempoNuevo = tiempoActualizado(item.updatedAt) || tiempoActualizado(item.deletedAt);
            const nuevoEsBorradoEnEmpate = tiempoNuevo === tiempoExistente && item.deletedAt && !existente.deletedAt;
            if (tiempoNuevo > tiempoExistente || nuevoEsBorradoEnEmpate) mapa.set(id, item);
        };

        (locales || []).forEach(incorporar);
        (remotos || []).forEach(incorporar);
        return Array.from(mapa.values());
    }

    function tiempoActualizado(valor) {
        if (typeof valor === 'number') return valor;
        if (typeof valor === 'string') {
            const numero = Number(valor);
            if (Number.isFinite(numero) && numero > 0) return numero;
            const fecha = Date.parse(valor);
            if (!Number.isNaN(fecha)) return fecha;
        }
        return 0;
    }

    function fusionarEmpresa(local, remota) {
        if (!remota) return { empresa: local, cambio: false };
        if (!local) return { empresa: remota, cambio: true };

        const tiempoLocal = tiempoActualizado(local.updatedAt);
        const tiempoRemoto = tiempoActualizado(remota.updatedAt);
        if (!tiempoLocal || !Object.prototype.hasOwnProperty.call(remota, 'updatedAt') || tiempoRemoto > tiempoLocal) {
            return { empresa: remota, cambio: true };
        }
        return { empresa: local, cambio: false };
    }

    function copiarObjeto(valor) {
        return valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...valor } : {};
    }

    function limpiarUndefined(valor) {
        if (valor === undefined) return null;
        if (valor === null || typeof valor !== 'object' || valor instanceof Date) return valor;
        if (Array.isArray(valor)) return valor.map(item => limpiarUndefined(item));

        const constructor = valor.constructor;
        if (typeof constructor === 'function' && constructor.name !== 'Object') return valor;

        const limpio = {};
        Object.keys(valor).forEach(clave => {
            if (valor[clave] !== undefined) limpio[clave] = limpiarUndefined(valor[clave]);
        });
        return limpio;
    }

    function timestampDeLog(log, actualizadoEn) {
        return tiempoActualizado(actualizadoEn) ||
            (Array.isArray(log) && log.length ? tiempoActualizado(log[log.length - 1].fechaHoraRegistro) : 0);
    }

    function logsCompatibles(logLocal, logRemoto) {
        const longitudComun = Math.min(logLocal.length, logRemoto.length);
        for (let i = 0; i < longitudComun; i++) {
            if (logLocal[i].huella !== logRemoto[i].huella || logLocal[i].docId !== logRemoto[i].docId) return false;
        }
        return true;
    }

    function fusionarConflictosVerifactu(locales, remotos) {
        const conflictos = new Map();
        [...(Array.isArray(locales) ? locales : []), ...(Array.isArray(remotos) ? remotos : [])].forEach(conflicto => {
            if (conflicto && conflicto.id) conflictos.set(conflicto.id, conflicto);
        });
        return Array.from(conflictos.values());
    }

    function fusionarLogVerifactu(estadoLocal, datosNube, reemplazarLocal) {
        const local = Array.isArray(estadoLocal.verifactuLog) ? estadoLocal.verifactuLog : [];
        const remoto = Array.isArray(datosNube.verifactuLog) ? datosNube.verifactuLog : [];
        let elegido = local;
        let timestampElegido = timestampDeLog(local, estadoLocal.verifactuLogUpdatedAt);
        let conflicto = false;

        if (reemplazarLocal) {
            elegido = remoto;
            timestampElegido = timestampDeLog(remoto, datosNube.verifactuLogUpdatedAt);
        } else if (logsCompatibles(local, remoto)) {
            if (remoto.length > local.length) {
                elegido = remoto;
                timestampElegido = timestampDeLog(remoto, datosNube.verifactuLogUpdatedAt);
            } else if (local.length > remoto.length) {
                timestampElegido = timestampDeLog(local, estadoLocal.verifactuLogUpdatedAt);
            } else {
                timestampElegido = Math.max(
                    timestampElegido,
                    timestampDeLog(remoto, datosNube.verifactuLogUpdatedAt)
                );
            }
        } else {
            conflicto = true;
            const timestampRemoto = timestampDeLog(remoto, datosNube.verifactuLogUpdatedAt);
            const longitudComun = (() => {
                let i = 0;
                while (i < local.length && i < remoto.length &&
                    local[i].huella === remoto[i].huella && local[i].docId === remoto[i].docId) i++;
                return i;
            })();
            const puntaLocal = local.length ? local[local.length - 1].huella : 'vacio';
            const puntaRemota = remoto.length ? remoto[remoto.length - 1].huella : 'vacio';
            const puntas = [puntaLocal, puntaRemota].sort();
            const ramaLocal = local.slice(longitudComun);
            const ramaRemota = remoto.slice(longitudComun);
            const conflictoNuevo = {
                id: `vf-${puntas[0]}-${puntas[1]}`,
                detectadoAt: Math.max(timestampElegido, timestampRemoto),
                longitudComun,
                ramaA: puntaLocal <= puntaRemota ? ramaLocal : ramaRemota,
                ramaB: puntaLocal <= puntaRemota ? ramaRemota : ramaLocal
            };
            estadoLocal.verifactuConflictos = fusionarConflictosVerifactu(
                estadoLocal.verifactuConflictos,
                [...(datosNube.verifactuConflictos || []), conflictoNuevo]
            );
            if (timestampRemoto > timestampElegido) {
                elegido = remoto;
                timestampElegido = timestampRemoto;
            }
            console.error('[FirebaseSync] Conflicto en la cadena VeriFactu: dos dispositivos han generado ramas distintas. Se conserva la rama más reciente y ambas ramas quedan registradas para revisión.');
        }

        estadoLocal.verifactuLog = elegido;
        estadoLocal.verifactuLogUpdatedAt = timestampElegido;
        estadoLocal.ultimoHashVerifactu = elegido.length
            ? elegido[elegido.length - 1].huella
            : (reemplazarLocal ? (datosNube.ultimoHashVerifactu || '0'.repeat(64)) : estadoLocal.ultimoHashVerifactu);
        if (reemplazarLocal) {
            estadoLocal.verifactuConflictos = fusionarConflictosVerifactu(
                [],
                datosNube.verifactuConflictos
            );
        } else {
            estadoLocal.verifactuConflictos = fusionarConflictosVerifactu(
                estadoLocal.verifactuConflictos,
                datosNube.verifactuConflictos
            );
        }
        return conflicto;
    }

    function fusionarContadoresVerifactu(estadoLocal, datosNube, reemplazarLocal) {
        const local = copiarObjeto(estadoLocal.contadoresVerifactu);
        const remoto = copiarObjeto(datosNube.contadoresVerifactu);
        if (reemplazarLocal) {
            estadoLocal.contadoresVerifactu = remoto;
            estadoLocal.contadoresVerifactuUpdatedAt = tiempoActualizado(datosNube.contadoresVerifactuUpdatedAt);
            return;
        }

        const fusionados = { ...local };
        Object.keys(remoto).forEach(serie => {
            const numeroLocal = Number(local[serie]);
            const numeroRemoto = Number(remoto[serie]);
            const validoLocal = Number.isFinite(numeroLocal) ? numeroLocal : 0;
            const validoRemoto = Number.isFinite(numeroRemoto) ? numeroRemoto : 0;
            fusionados[serie] = Math.max(validoLocal, validoRemoto);
        });
        estadoLocal.contadoresVerifactu = fusionados;
        estadoLocal.contadoresVerifactuUpdatedAt = Math.max(
            tiempoActualizado(estadoLocal.contadoresVerifactuUpdatedAt),
            tiempoActualizado(datosNube.contadoresVerifactuUpdatedAt)
        );
    }

    function construirPayloadNube(estado) {
        const tarifario = estado.catalogoPrecios || estado.tarifario || [];
        return {
            clientes: estado.clientes || [],
            documentos: estado.documentos || [],
            gastos: estado.gastos || [],
            catalogoPrecios: tarifario,
            tarifario,
            empresa: estado.empresa || {},
            contadoresVerifactu: estado.contadoresVerifactu || {},
            contadoresVerifactuUpdatedAt: estado.contadoresVerifactuUpdatedAt || 0,
            verifactuLog: estado.verifactuLog || [],
            verifactuLogUpdatedAt: estado.verifactuLogUpdatedAt || 0,
            ultimoHashVerifactu: estado.ultimoHashVerifactu || '',
            verifactuConflictos: estado.verifactuConflictos || []
        };
    }

    function normalizarParaComparar(valor) {
        if (Array.isArray(valor)) return valor.map(normalizarParaComparar);
        if (!valor || typeof valor !== 'object') return valor;
        return Object.keys(valor).sort().reduce((obj, clave) => {
            obj[clave] = normalizarParaComparar(valor[clave]);
            return obj;
        }, {});
    }

    function proyeccionSincronizada(datos) {
        const tarifario = Array.isArray(datos.catalogoPrecios)
            ? datos.catalogoPrecios
            : (Array.isArray(datos.tarifario) ? datos.tarifario : []);
        const porId = lista => (Array.isArray(lista) ? lista.slice() : [])
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        return {
            clientes: porId(datos.clientes),
            documentos: porId(datos.documentos),
            gastos: porId(datos.gastos),
            catalogoPrecios: porId(tarifario),
            empresa: datos.empresa || null,
            contadoresVerifactu: datos.contadoresVerifactu || {},
            contadoresVerifactuUpdatedAt: datos.contadoresVerifactuUpdatedAt || 0,
            verifactuLog: Array.isArray(datos.verifactuLog) ? datos.verifactuLog : [],
            verifactuLogUpdatedAt: datos.verifactuLogUpdatedAt || 0,
            ultimoHashVerifactu: datos.ultimoHashVerifactu || '',
            verifactuConflictos: Array.isArray(datos.verifactuConflictos) ? datos.verifactuConflictos : []
        };
    }

    function estadoLocalDifiereDeNube(estado, datosNube) {
        const local = normalizarParaComparar(proyeccionSincronizada(construirPayloadNube(estado)));
        const remoto = normalizarParaComparar(proyeccionSincronizada(datosNube));
        remoto.verifactuConflictos.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        local.verifactuConflictos.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        return JSON.stringify(local) !== JSON.stringify(remoto);
    }

    function cancelarSubidaProgramada() {
        if (temporizadorSubida) clearTimeout(temporizadorSubida);
        temporizadorSubida = null;
    }

    async function ejecutarSubidaBackground() {
        const revisionAlIniciar = revisionSubida;
        const syncCode = localStorage.getItem('construfactu_sync_code');
        if (!syncCode || syncCode !== codigoEscuchado || !fbDb) {
            console.warn('[SYNC] Subida omitida: no hay un espacio de sincronización activo.');
            return;
        }
        if (!navigator.onLine) {
            console.warn('[SYNC] Subida pendiente: el dispositivo está sin conexión.');
            subidaPendiente = true;
            return;
        }
        if (subidaEnCurso) {
            console.log('[SYNC] Ya hay una subida en curso; se repetirá al terminar.');
            subidaPendiente = true;
            return;
        }

        subidaEnCurso = true;
        let errorFirestoreRegistrado = false;
        try {
            const estado = ConstruFactu.Store.state;
            const payload = limpiarUndefined({
                ...construirPayloadNube(estado),
                _lastSyncBy: clienteSyncId,
                _lastSync: Date.now()
            });
            await fbDb.collection('syncSpaces').doc(syncCode)
                .set(payload, { merge: true })
                .then(() => console.log('✅ [SYNC] Subida completada con éxito'))
                .catch(error => {
                    errorFirestoreRegistrado = true;
                    console.error('❌ [SYNC] Error en la subida:', error);
                    throw error;
                });
            subidaPendiente = revisionSubida !== revisionAlIniciar;
        } catch (error) {
            subidaPendiente = true;
            if (!errorFirestoreRegistrado) {
                console.error('[FirebaseSync] Error al preparar la subida en segundo plano:', error);
            }
        } finally {
            subidaEnCurso = false;
            if (subidaPendiente && navigator.onLine && revisionSubida !== revisionAlIniciar && !temporizadorSubida) {
                subirCambiosBackground();
            }
        }
    }

    function subirCambiosBackground() {
        const syncCode = localStorage.getItem('construfactu_sync_code');
        if (!syncCode || syncCode !== codigoEscuchado) {
            console.warn('[SYNC] No se programa la subida: no hay una escucha activa para este código.');
            return;
        }
        console.log('🚀 [SYNC] Iniciando subida a Firestore...', limpiarUndefined(construirPayloadNube(ConstruFactu.Store.state)));
        revisionSubida++;
        cancelarSubidaProgramada();
        temporizadorSubida = setTimeout(() => {
            temporizadorSubida = null;
            ejecutarSubidaBackground();
        }, 2000);
    }

    window.addEventListener('online', () => {
        if (codigoEscuchado && localStorage.getItem('construfactu_sync_code') === codigoEscuchado) {
            actualizarEstadoConexion(`Conectado · ${codigoEscuchado}`, 'conectado');
        }
        if (subidaPendiente || codigoEscuchado) subirCambiosBackground();
    });
    window.addEventListener('offline', () => {
        actualizarEstadoConexion('Sin conexión a internet', 'inactivo');
    });

    function actualizarEstadoConexion(texto, tipo) {
        estadoConexion = { texto, tipo };
        const indicador = document.getElementById('cf-sync-connection-state');
        if (indicador) {
            const estilos = {
                conectado: 'text-emerald-700 bg-emerald-50',
                sincronizando: 'text-indigo-700 bg-indigo-50',
                error: 'text-rose-700 bg-rose-50',
                inactivo: 'text-slate-500 bg-slate-100'
            };
            indicador.textContent = texto;
            indicador.className = `text-[10px] font-bold px-2 py-1 rounded ${estilos[tipo] || estilos.inactivo}`;
        }
        if (CF.UI && typeof CF.UI.actualizarBadgeSincronizacion === 'function') {
            CF.UI.actualizarBadgeSincronizacion();
        }
    }

    function desconectarEscucha() {
        generacionConexion++;
        if (cancelarEscucha) cancelarEscucha();
        cancelarEscucha = null;
        codigoEscuchado = null;
    }

    function notificarDatosActualizados(detalle) {
        window.dispatchEvent(new CustomEvent('construfactu:datosActualizados', {
            detail: detalle || { source: 'firebase' }
        }));
    }

    function esperarEscriturasLocales() {
        return new Promise(resolve => {
            const revisar = () => {
                if (!window.__construfactu_local_write_pending) {
                    resolve();
                    return;
                }
                setTimeout(revisar, 25);
            };
            revisar();
        });
    }

    function aplicarDatosNube(estadoLocal, datosNube, reemplazarLocal) {
        const tarifarioRemoto = Array.isArray(datosNube.tarifario)
            ? datosNube.tarifario
            : (Array.isArray(datosNube.catalogoPrecios) ? datosNube.catalogoPrecios : []);
        let empresaCambiada = false;

        if (reemplazarLocal) {
            estadoLocal.clientes = Array.isArray(datosNube.clientes) ? datosNube.clientes : [];
            estadoLocal.documentos = Array.isArray(datosNube.documentos) ? datosNube.documentos : [];
            estadoLocal.gastos = Array.isArray(datosNube.gastos) ? datosNube.gastos : [];
            estadoLocal.catalogoPrecios = tarifarioRemoto;
            estadoLocal.tarifario = tarifarioRemoto;
            if (datosNube.empresa && typeof datosNube.empresa === 'object' && !Array.isArray(datosNube.empresa)) {
                estadoLocal.empresa = datosNube.empresa;
                empresaCambiada = true;
            }
            fusionarContadoresVerifactu(estadoLocal, datosNube, true);
        } else {
            estadoLocal.clientes = fusionarArrays(estadoLocal.clientes, datosNube.clientes);
            estadoLocal.documentos = fusionarArrays(estadoLocal.documentos, datosNube.documentos);
            estadoLocal.gastos = fusionarArrays(estadoLocal.gastos, datosNube.gastos);
            const tarifarioFinal = fusionarArrays(
                estadoLocal.catalogoPrecios || estadoLocal.tarifario || [],
                tarifarioRemoto
            );
            estadoLocal.catalogoPrecios = tarifarioFinal;
            estadoLocal.tarifario = tarifarioFinal;

            if (!estadoLocal.empresa) estadoLocal.empresa = {};
            const resultadoEmpresa = fusionarEmpresa(estadoLocal.empresa, datosNube.empresa);
            if (resultadoEmpresa.cambio) {
                estadoLocal.empresa = resultadoEmpresa.empresa;
                empresaCambiada = true;
            }
            fusionarContadoresVerifactu(estadoLocal, datosNube, false);
        }

        const conflictoVerifactu = fusionarLogVerifactu(estadoLocal, datosNube, reemplazarLocal);
        if (!estadoLocal.empresa) estadoLocal.empresa = {};
        if (!estadoLocal.empresa.updatedAt) {
            estadoLocal.empresa.updatedAt = Date.now();
        }
        return { empresaCambiada, conflictoVerifactu };
    }

    function iniciarEscucha(syncCode) {
        if (cancelarEscucha && codigoEscuchado === syncCode) return;
        desconectarEscucha();
        codigoEscuchado = syncCode;
        const docRef = fbDb.collection('syncSpaces').doc(syncCode);
        cancelarEscucha = docRef.onSnapshot(snapshot => {
            if (codigoEscuchado !== syncCode || !snapshot.exists) return;
            const datosNube = snapshot.data() || {};
            console.log('📥 [SYNC] ¡Cambio detectado en la nube!', datosNube);
            if (snapshot.metadata && snapshot.metadata.hasPendingWrites) {
                console.log('[SYNC] Snapshot ignorado: todavía tiene escrituras locales pendientes.');
                return;
            }
            if (datosNube._lastSyncBy === clienteSyncId) {
                console.log('[SYNC] Snapshot propio ignorado para evitar un bucle.');
                return;
            }

            colaSnapshots = colaSnapshots.then(async () => {
                if (codigoEscuchado !== syncCode) return;
                if (window.__construfactu_local_write_pending) {
                    console.log('[SYNC] Snapshot aplazado mientras termina un guardado local.');
                }
                await esperarEscriturasLocales();
                if (codigoEscuchado !== syncCode) return;
                const estadoLocal = ConstruFactu.Store.state;
                const resultado = aplicarDatosNube(estadoLocal, datosNube, false);
                const requierePropagar = estadoLocalDifiereDeNube(estadoLocal, datosNube);
                console.log('[SYNC] Fusión recibida; guardando en IndexedDB sin programar otra subida.');
                if (!(await ConstruFactu.Store.save({ skipCloudSync: true }))) {
                    throw new Error('No se pudieron guardar los cambios recibidos en el almacenamiento local.');
                }
                notificarDatosActualizados({
                    source: 'firebase',
                    syncCode,
                    empresaCambiada: resultado.empresaCambiada
                });
                console.log('[SYNC] Datos guardados localmente y evento de refresco emitido.');
                if (resultado.conflictoVerifactu || (estadoLocal.verifactuConflictos || []).length) {
                    actualizarEstadoConexion('Conflicto en cadena VeriFactu · revisar', 'error');
                } else {
                    if ((ConstruFactu.Store.state.verifactuConflictos || []).length) {
                        actualizarEstadoConexion('Conflicto en cadena VeriFactu · revisar', 'error');
                    } else {
                        actualizarEstadoConexion(`Conectado · ${syncCode}`, 'conectado');
                    }
                }
                if (requierePropagar) subirCambiosBackground();
            }).catch(error => {
                console.error('[FirebaseSync] Error al aplicar cambios en tiempo real:', error);
                actualizarEstadoConexion('Error al guardar cambios recibidos', 'error');
            });
        }, error => {
            console.error('[FirebaseSync] Error en la escucha en tiempo real:', error);
            desconectarEscucha();
            actualizarEstadoConexion('Error de conexión', 'error');
        });
        actualizarEstadoConexion(`Conectado · ${syncCode}`, 'conectado');
    }

    // Sincronización manual y conexión inicial de un dispositivo vinculado
    async function sincronizar(opciones) {
        opciones = opciones || {};
        const estadoLocal = ConstruFactu.Store.state;
        const syncCode = opciones.syncCode || obtenerCodigoNube();
        if (codigoEscuchado && codigoEscuchado !== syncCode) desconectarEscucha();
        const generacionActual = generacionConexion;
        const docRef = fbDb.collection('syncSpaces').doc(syncCode);

        // --- FASE 1: PULL (Traer de la nube) ---
        let docSnap;
        try {
            docSnap = await docRef.get();
        } catch (err) {
            const mensaje = err && typeof err.message === 'string' ? err.message : String(err);
            const mensajeNormalizado = mensaje.toLowerCase();
            if (['offline', 'unavailable', 'network'].some(palabra => mensajeNormalizado.includes(palabra))) {
                throw new Error('❌ Sin conexión a internet o red bloqueada. Revisa tu WiFi y vuelve a intentarlo.');
            }
            throw err;
        }
        if (generacionActual !== generacionConexion) return false;
        let datosNube = {
            clientes: [], documentos: [], gastos: [], catalogoPrecios: [], tarifario: [], empresa: null,
            contadoresVerifactu: {}, verifactuLog: [], verifactuConflictos: []
        };

        if (docSnap.exists) {
            datosNube = docSnap.data();
        } else if (opciones.soloSiExiste) {
            throw new Error('No se encontró un espacio con ese Código Nube. Comprueba el código e inténtalo de nuevo.');
        }

        const estadoGuardado = !!(estadoLocal._meta && estadoLocal._meta.savedAt);
        const resultadoMerge = aplicarDatosNube(
            estadoLocal,
            datosNube,
            !!(docSnap.exists && opciones.reemplazarLocalSiNuevo && !estadoGuardado)
        );

        // Guardamos el resultado fusionado en IndexedDB
        if (!(await ConstruFactu.Store.save({ skipCloudSync: true }))) {
            throw new Error('No se pudieron guardar los cambios de sincronización en el almacenamiento local.');
        }
        if (generacionActual !== generacionConexion) return false;

        // --- FASE 3: PUSH (Enviar a la nube) ---
        // Subimos el estado fusionado, incluida la configuración y el logo de la empresa.
        const estadoParaNube = limpiarUndefined({
            ...construirPayloadNube(estadoLocal),
            _lastSyncBy: clienteSyncId,
            _lastSync: Date.now()
        });
        if (generacionActual !== generacionConexion) return false;
        await docRef.set(estadoParaNube, { merge: true });
        if (generacionActual !== generacionConexion) return false;

        if (opciones.marcarVinculado) {
            localStorage.setItem('construfactu_sync_joined', '1');
        }
        iniciarEscucha(syncCode);
        if (resultadoMerge.conflictoVerifactu || (estadoLocal.verifactuConflictos || []).length) {
            actualizarEstadoConexion('Conflicto en cadena VeriFactu · revisar', 'error');
        } else {
            actualizarEstadoConexion(`Conectado · ${syncCode}`, 'conectado');
        }
        notificarDatosActualizados({
            source: 'firebase',
            syncCode,
            empresaCambiada: resultadoMerge.empresaCambiada
        });
        return true;
    }

    async function autoConectar() {
        const syncCode = localStorage.getItem('construfactu_sync_code');
        if (!syncCode) return false;
        actualizarEstadoConexion('Conectando...', 'sincronizando');
        try {
            await inicializarFirebase();
            return await sincronizar({
                syncCode,
                soloSiExiste: true,
                reemplazarLocalSiNuevo: true,
                marcarVinculado: true
            });
        } catch (error) {
            actualizarEstadoConexion('No se pudo conectar a la nube', 'error');
            throw error;
        }
    }

    function desvincular() {
        cancelarSubidaProgramada();
        subidaPendiente = false;
        desconectarEscucha();
        localStorage.removeItem('construfactu_sync_code');
        localStorage.removeItem('construfactu_sync_joined');
        actualizarEstadoConexion('Dispositivo desvinculado', 'inactivo');
    }

    // 6. UI: Inyectar botón y modal
        // 6. UI: Inyectar tarjeta en la vista de Ajustes (Configuración)
    function montarUI() {
        // 1. LIMPIEZA: Borrar botones duplicados que hayan podido quedar en el menú principal
        document.querySelectorAll('#btn-sync-cloud').forEach(el => el.remove());
        document.querySelectorAll('#cf-sync-card').forEach(el => el.remove());
        // Borrar también el modal viejo si existe para no duplicarlo
        const modalViejo = document.getElementById('modal-sync-cloud');
        if (modalViejo) modalViejo.remove();

        const vistaConfig = document.getElementById('view-config');
        if (!vistaConfig) return;

        // 2. Creamos la tarjeta visual
        const htmlTarjeta = `
            <details id="cf-sync-card" class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary class="flex cursor-pointer list-none select-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
                    <span class="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-800"><span>☁️</span> Sincronización en la Nube</span>
                    <span class="flex shrink-0 items-center gap-2">
                        <span class="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">Firebase</span>
                        <svg class="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
                    </span>
                </summary>
                <div class="space-y-3 border-t border-slate-100 px-4 pb-5 pt-4 sm:px-5">
                    <p class="text-xs text-slate-600">Comparte clientes y facturas entre tu móvil y tu ordenador de forma segura.</p>
                    <p id="cf-sync-connection-state" class="mb-1 inline-flex rounded px-2 py-1 text-[10px] font-bold">Sin conexión</p>
                    <button id="btn-sync-cloud" class="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-extrabold text-white shadow-md transition hover:bg-indigo-700">
                        ☁️ Abrir Sincronización
                    </button>
                </div>
            </details>
        `;

        // 3. Insertamos el acordeón de sincronización antes de las copias de seguridad
        const targetNode = document.getElementById('cfg-backup-accordion');
        if (targetNode && targetNode.parentNode) {
            targetNode.insertAdjacentHTML('beforebegin', htmlTarjeta);
        } else {
            vistaConfig.insertAdjacentHTML('beforeend', htmlTarjeta);
        }

        // 5. Creamos el Modal
        const htmlModal = `
            <div id="modal-sync-cloud" class="fixed inset-0 z-[150] bg-slate-900/60 flex items-center justify-center p-4 hidden">
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                    <h2 class="font-extrabold text-lg text-slate-900">Sincronización en la Nube</h2>
                    <p class="text-xs text-slate-600">Este es tu <strong>Código Nube</strong>. Úsalo en tu otro dispositivo (móvil/PC) para compartir los datos.</p>
                    <p class="text-[10px] text-slate-400 mt-1">💡 Consejo: Asegúrate de tener internet. Si falla, comprueba que no tienes un bloqueador de anuncios activado.</p>
                    
                    <div id="sync-code-display" class="font-mono text-xl font-extrabold text-center bg-slate-50 border border-slate-200 rounded-xl p-3 tracking-widest select-all text-indigo-700"></div>
                    
                    <div class="pt-3 border-t border-slate-100">
                        <label class="block text-xs font-bold text-slate-700 mb-1">Vincular con otro código</label>
                        <input type="text" id="sync-code-input" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm mb-2" placeholder="Ej: ABCD-EFGH-IJKL">
                        <button id="btn-link-code" class="w-full py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition">Vincular este dispositivo</button>
                        <button id="btn-unlink-code" class="w-full py-2 mt-2 text-rose-700 bg-rose-50 rounded-xl text-xs font-bold hover:bg-rose-100 transition">Desvincular este dispositivo</button>
                    </div>

                    <div id="sync-status" class="text-xs font-bold text-center hidden"></div>

                    <div class="flex gap-2 pt-2">
                        <button id="btn-cerrar-sync" class="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs">Cerrar</button>
                        <button id="btn-ejecutar-sync" class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs">Sincronizar ahora</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', htmlModal);

        // 6. Eventos
        document.getElementById('btn-sync-cloud').onclick = () => {
            const codigo = obtenerCodigoNube();
            document.getElementById('sync-code-display').textContent = codigo;
            document.getElementById('sync-code-input').value = '';
            document.getElementById('sync-status').classList.add('hidden');
            document.getElementById('modal-sync-cloud').classList.remove('hidden');
        };
        actualizarEstadoConexion(estadoConexion.texto, estadoConexion.tipo);
        
        document.getElementById('btn-cerrar-sync').onclick = () => document.getElementById('modal-sync-cloud').classList.add('hidden');
        
        document.getElementById('btn-link-code').onclick = async () => {
            const nuevoCodigo = document.getElementById('sync-code-input').value.trim().toUpperCase();
            const status = document.getElementById('sync-status');
            if (nuevoCodigo && nuevoCodigo.length >= 12) {
                const botonVincular = document.getElementById('btn-link-code');
                try {
                    botonVincular.disabled = true;
                    localStorage.setItem('construfactu_sync_code', nuevoCodigo);
                    localStorage.setItem('construfactu_sync_joined', '1');
                    desconectarEscucha();
                    document.getElementById('sync-code-display').textContent = nuevoCodigo;
                    status.textContent = 'Conectando y descargando los datos...';
                    status.className = 'text-xs font-bold text-center text-indigo-700 block p-2 bg-indigo-50 rounded-lg';
                    actualizarEstadoConexion('Conectando...', 'sincronizando');
                    await inicializarFirebase();
                    const conectado = await sincronizar({
                        syncCode: nuevoCodigo,
                        soloSiExiste: true,
                        reemplazarLocalSiNuevo: true,
                        marcarVinculado: true
                    });
                    if (!conectado) return;
                    status.textContent = '✅ Dispositivo vinculado y sincronizado.';
                    status.className = 'text-xs font-bold text-center text-emerald-600 block p-2 bg-emerald-50 rounded-lg';
                } catch (err) {
                    console.error('[FirebaseSync] Error al vincular dispositivo:', err);
                    const mensajeError = err && typeof err.message === 'string' ? err.message : 'Error al vincular el dispositivo.';
                    status.textContent = mensajeError.startsWith('❌') ? mensajeError : '❌ ' + mensajeError;
                    status.className = 'text-xs font-bold text-center text-rose-600 block p-2 bg-rose-50 rounded-lg';
                    actualizarEstadoConexion('No se pudo conectar a la nube', 'error');
                } finally {
                    botonVincular.disabled = false;
                }
            } else {
                status.textContent = '❌ El código debe tener al menos 12 caracteres.';
                status.className = 'text-xs font-bold text-center text-rose-600 block p-2 bg-rose-50 rounded-lg';
            }
        };

        document.getElementById('btn-unlink-code').onclick = () => {
            desvincular();
            document.getElementById('sync-code-display').textContent = 'Sin vincular';
            const status = document.getElementById('sync-status');
            status.textContent = 'Dispositivo desvinculado. La escucha en tiempo real se ha detenido.';
            status.className = 'text-xs font-bold text-center text-slate-600 block p-2 bg-slate-100 rounded-lg';
        };

        document.getElementById('btn-ejecutar-sync').onclick = async () => {
            const btnSync = document.getElementById('btn-ejecutar-sync');
            const btnCerrar = document.getElementById('btn-cerrar-sync');
            const status = document.getElementById('sync-status');

            if (!navigator.onLine) {
                status.textContent = '❌ Sin conexión a internet. Conéctate y vuelve a intentarlo.';
                status.className = 'text-xs font-bold text-center text-rose-600 block p-2 bg-rose-50 rounded-lg';
                return;
            }
            
            try {
                btnSync.disabled = true;
                btnCerrar.disabled = true;
                btnSync.textContent = 'Sincronizando...';
                btnSync.classList.add('animate-pulse');
                status.classList.add('hidden');
                actualizarEstadoConexion('Sincronizando...', 'sincronizando');

                await inicializarFirebase();
                const codigoGuardado = localStorage.getItem('construfactu_sync_code');
                const syncCode = codigoGuardado || obtenerCodigoNube();
                const unido = localStorage.getItem('construfactu_sync_joined') === '1';
                const sincronizado = await sincronizar({
                    syncCode,
                    soloSiExiste: unido,
                    reemplazarLocalSiNuevo: true,
                    marcarVinculado: unido
                });
                if (!sincronizado) {
                    status.textContent = 'Dispositivo desvinculado antes de completar la sincronización.';
                    status.className = 'text-xs font-bold text-center text-slate-600 block p-2 bg-slate-100 rounded-lg';
                    return;
                }

                status.textContent = '✅ Sincronización completada.';
                status.className = 'text-xs font-bold text-center text-emerald-600 block p-2 bg-emerald-50 rounded-lg';
                
                if (typeof renderClientes === 'function') renderClientes();
                if (typeof renderGastos === 'function') renderGastos();
                
            } catch (err) {
                console.error(err);
                const mensajeError = err && typeof err.message === 'string' ? err.message : 'Error al sincronizar.';
                status.textContent = mensajeError.startsWith('❌') ? mensajeError : '❌ ' + mensajeError;
                status.className = 'text-xs font-bold text-center text-rose-600 block p-2 bg-rose-50 rounded-lg';
                actualizarEstadoConexion('Error de sincronización', 'error');
            } finally {
                btnSync.disabled = false;
                btnSync.textContent = 'Sincronizar ahora';
                btnSync.classList.remove('animate-pulse');
                btnCerrar.disabled = false;
            }
        };
    }

    function abrirModalSync() {
        const codigo = obtenerCodigoNube();
        document.getElementById('sync-code-display').textContent = codigo;
        document.getElementById('sync-code-input').value = '';
        document.getElementById('sync-status').classList.add('hidden');
        document.getElementById('modal-sync-cloud').classList.remove('hidden');
    }

    CF.FirebaseSync.autoConectar = autoConectar;
    CF.FirebaseSync.desvincular = desvincular;
    CF.FirebaseSync.subirCambiosBackground = subirCambiosBackground;
    CF.FirebaseSync.estaConectado = () => {
        const syncCode = localStorage.getItem('construfactu_sync_code');
        return !!(
            syncCode &&
            syncCode === codigoEscuchado &&
            typeof cancelarEscucha === 'function' &&
            navigator.onLine
        );
    };

    // Inicializar la UI cuando el DOM esté listo
    document.addEventListener('DOMContentLoaded', () => {
        // Un pequeño timeout para asegurar que el menú ya se ha pintado
        setTimeout(montarUI, 500);
    });

})(window.ConstruFactu = window.ConstruFactu || {});