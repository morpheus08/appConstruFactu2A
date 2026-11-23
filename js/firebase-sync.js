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
        }
        return codigo;
    }

    // 4. MOTOR DE FUSIÓN INTELIGENTE (El corazón del sistema)
    function fusionarArrays(locales, remotos) {
        const mapa = new Map();
        
        // 1º Metemos todos los locales en el mapa
        (locales || []).forEach(item => mapa.set(item.id, item));

        // 2º Evaluamos los remotos
        (remotos || []).forEach(remoto => {
            const local = mapa.get(remoto.id);
            if (!local) {
                // Si solo está en la nube, lo añadimos
                mapa.set(remoto.id, remoto);
            } else {
                // Si está en ambos, gana el más reciente (updatedAt)
                const tLocal = Number(local.updatedAt) || 0;
                const tRemoto = Number(remoto.updatedAt) || 0;
                if (tRemoto > tLocal) {
                    mapa.set(remoto.id, remoto);
                }
                // En caso de empate, el elemento local se conserva por no reemplazarlo.
            }
        });

        return Array.from(mapa.values());
    }

    // 5. Sincronizar (Pull + Merge + Push)
    async function sincronizar() {
        const estadoLocal = ConstruFactu.Store.state;
        const syncCode = obtenerCodigoNube();
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
        let datosNube = { clientes: [], documentos: [], gastos: [], catalogoPrecios: [] };

        if (docSnap.exists) {
            datosNube = docSnap.data();
        }

        // --- FASE 2: MERGE (Fusión) ---
        const clientesLocales = (estadoLocal.clientes || []).length;
        const documentosLocales = (estadoLocal.documentos || []).length;
        const gastosLocales = (estadoLocal.gastos || []).length;
        const clientesNube = (datosNube.clientes || []).length;
        const documentosNube = (datosNube.documentos || []).length;
        const gastosNube = (datosNube.gastos || []).length;

        estadoLocal.clientes = fusionarArrays(estadoLocal.clientes, datosNube.clientes);
        estadoLocal.documentos = fusionarArrays(estadoLocal.documentos, datosNube.documentos);
        estadoLocal.gastos = fusionarArrays(estadoLocal.gastos, datosNube.gastos);

        console.log(
            `Clientes locales: ${clientesLocales}, Clientes nube: ${clientesNube}, Clientes finales: ${estadoLocal.clientes.length}; ` +
            `Documentos locales: ${documentosLocales}, Documentos nube: ${documentosNube}, Documentos finales: ${estadoLocal.documentos.length}; ` +
            `Gastos locales: ${gastosLocales}, Gastos nube: ${gastosNube}, Gastos finales: ${estadoLocal.gastos.length}`
        );

        // El tarifario no suele tener updatedAt, así que si hay local, gana local.
        if (datosNube.catalogoPrecios && estadoLocal.catalogoPrecios.length === 0) {
            estadoLocal.catalogoPrecios = datosNube.catalogoPrecios;
        }

        // Guardamos el resultado fusionado en IndexedDB
        await ConstruFactu.Store.save();

        // --- FASE 3: PUSH (Enviar a la nube) ---
        // Subimos el estado fusionado. (Nota: excluimos el logo temporalmente para evitar saturar si fuera muy grande)
        const estadoParaNube = {
            clientes: estadoLocal.clientes,
            documentos: estadoLocal.documentos,
            gastos: estadoLocal.gastos,
            catalogoPrecios: estadoLocal.catalogoPrecios,
            _lastSync: Date.now()
        };
        await docRef.set(estadoParaNube, { merge: true });

        return true;
    }

    // 6. UI: Inyectar botón y modal
        // 6. UI: Inyectar tarjeta en la vista de Ajustes (Configuración)
    function montarUI() {
        // 1. LIMPIEZA: Borrar botones duplicados que hayan podido quedar en el menú principal
        document.querySelectorAll('#btn-sync-cloud').forEach(el => el.remove());
        // Borrar también el modal viejo si existe para no duplicarlo
        const modalViejo = document.getElementById('modal-sync-cloud');
        if (modalViejo) modalViejo.remove();

        const vistaConfig = document.getElementById('view-config');
        if (!vistaConfig) return;

        // 2. Creamos la tarjeta visual
        const htmlTarjeta = `
            <div id="cf-sync-card" class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mt-4 mb-4">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-extrabold text-sm text-slate-900">SINCRONIZACIÓN EN LA NUBE</h3>
                    <span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">Firebase</span>
                </div>
                <p class="text-xs text-slate-600 mb-4">Comparte clientes y facturas entre tu móvil y tu ordenador de forma segura.</p>
                <button id="btn-sync-cloud" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-extrabold shadow-md flex items-center justify-center gap-2 hover:bg-indigo-700 transition">
                    ☁️ Abrir Sincronización
                </button>
            </div>
        `;

        // 3. Buscamos el bloque de "Copia de Seguridad" para insertar justo encima
        let targetNode = null;
        const elementos = vistaConfig.querySelectorAll('div');
        for (let el of elementos) {
            // Buscamos el texto en minúsculas para evitar fallos de mayúsculas
            if (el.textContent.toLowerCase().includes('copia de seguridad') && el.children.length > 0) {
                targetNode = el;
                break;
            }
        }

        // 4. Inserción
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
        
        document.getElementById('btn-cerrar-sync').onclick = () => document.getElementById('modal-sync-cloud').classList.add('hidden');
        
        document.getElementById('btn-link-code').onclick = () => {
            const nuevoCodigo = document.getElementById('sync-code-input').value.trim().toUpperCase();
            const status = document.getElementById('sync-status');
            if (nuevoCodigo && nuevoCodigo.length >= 12) {
                localStorage.setItem('construfactu_sync_code', nuevoCodigo);
                document.getElementById('sync-code-display').textContent = nuevoCodigo;
                status.textContent = '✅ Código vinculado. Pulsa "Sincronizar ahora".';
                status.className = 'text-xs font-bold text-center text-emerald-600 block p-2 bg-emerald-50 rounded-lg';
            } else {
                status.textContent = '❌ El código debe tener al menos 12 caracteres.';
                status.className = 'text-xs font-bold text-center text-rose-600 block p-2 bg-rose-50 rounded-lg';
            }
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

                await inicializarFirebase();
                
                await sincronizar();

                status.textContent = '✅ Sincronización completada.';
                status.className = 'text-xs font-bold text-center text-emerald-600 block p-2 bg-emerald-50 rounded-lg';
                
                if (typeof renderClientes === 'function') renderClientes();
                if (typeof renderGastos === 'function') renderGastos();
                
            } catch (err) {
                console.error(err);
                const mensajeError = err && typeof err.message === 'string' ? err.message : 'Error al sincronizar.';
                status.textContent = mensajeError.startsWith('❌') ? mensajeError : '❌ ' + mensajeError;
                status.className = 'text-xs font-bold text-center text-rose-600 block p-2 bg-rose-50 rounded-lg';
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

    // Inicializar la UI cuando el DOM esté listo
    document.addEventListener('DOMContentLoaded', () => {
        // Un pequeño timeout para asegurar que el menú ya se ha pintado
        setTimeout(montarUI, 500);
    });

})(window.ConstruFactu = window.ConstruFactu || {});