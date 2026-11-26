
    // ==========================================
    // CONSTRUFACTU v0.9.45 - MÓDULO ESTABLE UNIFICADO
    // ==========================================
    const ConstruFactu = window.ConstruFactu;
    Object.assign(ConstruFactu, {
      DB_NAME: 'ConstruFactuDB_v0928',
      STORE_NAME: 'state_store',
      
      UI: {
        ocultarTodas() {
          ['view-login', 'view-menu', 'view-clientes', 'view-cliente-form', 'view-docs', 'view-doc-editor', 'view-gastos', 'view-gasto-form', 'view-tarifario', 'view-tarifario-form', 'view-estado', 'view-config', 'view-ayuda'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
          });
        },
        sesionActiva: false, vistaActual: 'login',
        irA(destino, esPopState = false) {
          this.ocultarTodas();
          if (destino === 'login') {
            document.getElementById('view-login').classList.remove('hidden');
          } else if (destino === 'menu') {
            this.actualizarBadgesMenu();
            document.getElementById('view-menu').classList.remove('hidden');
          } else if (destino === 'clientes') {
            renderClientes();
            document.getElementById('view-clientes').classList.remove('hidden');
          } else if (destino === 'presupuestos' || destino === 'albaranes' || destino === 'facturas') {
            abrirListadoDocs(destino);
            document.getElementById('view-docs').classList.remove('hidden');
          } else if (destino === 'gastos') {
            renderGastos();
            document.getElementById('view-gastos').classList.remove('hidden');
          } else if (destino === 'tarifario') {
            renderTarifario();
            document.getElementById('view-tarifario').classList.remove('hidden');
          } else if (destino === 'estado') {
            renderEstado();
            document.getElementById('view-estado').classList.remove('hidden');
          } else if (destino === 'config') {
            cargarVistaConfig();
            document.getElementById('view-config').classList.remove('hidden');
          } else if (destino === 'ayuda') {
            window.renderizarManual('empresa');
            document.getElementById('view-ayuda').classList.remove('hidden');
          }
          window.scrollTo(0, 0);
          setTimeout(this.actualizarBotonScroll, 80);
          const previa = this.vistaActual;
          this.sesionActiva = destino !== 'login'; this.vistaActual = destino;
          if (!esPopState && destino !== previa) {
            try {
              const estado = { vista: destino };
              if (destino === 'menu' && previa === 'login') {
                history.replaceState(estado, '', '#' + destino);
              } else {
                history.pushState(estado, '', '#' + destino);
              }
            } catch (error) {
              console.error('[navegación] No se pudo actualizar el historial:', error);
            }
          }
        },
        actualizarBadgesMenu() {
          const state = ConstruFactu.Store.state;
          document.getElementById('menu-empresa-nombre').textContent = state.empresa.nombre;
          document.getElementById('menu-empresa-nif').textContent = `NIF: ${state.empresa.nif}`;
          this.actualizarBadgeSincronizacion();
          
          const lic = ConstruFactu.Licensing.obtenerEstado();
          const menuBadge = document.querySelector('#view-menu .bg-amber-100');
          if (menuBadge) {
            menuBadge.textContent = lic.texto;
            menuBadge.className = `text-[10px] font-extrabold px-2 py-0.5 rounded ${lic.badgeClass}`;
          }
          const documentosActivos = (state.documentos || []).filter(d => !d.deletedAt);
          const clientesActivos = (state.clientes || []).filter(c => !c.deletedAt);
          const gastosActivos = (state.gastos || []).filter(g => !g.deletedAt);
          const tarifarioActivo = (state.catalogoPrecios || []).filter(p => !p.deletedAt);
          document.getElementById('badge-presupuestos').textContent = documentosActivos.filter(d => d.tipo === 'presupuesto').length;
          document.getElementById('badge-albaranes').textContent = documentosActivos.filter(d => d.tipo === 'albaran').length;
          document.getElementById('badge-facturas').textContent = documentosActivos.filter(d => d.tipo === 'factura' || d.tipo === 'rectificativa').length;
          document.getElementById('badge-clientes').textContent = `${clientesActivos.length} registrados`;
          document.getElementById('badge-gastos').textContent = `${gastosActivos.length} gastos`;
          document.getElementById('badge-tarifario').textContent = `${tarifarioActivo.length} partidas`;
          
          const logoBox = document.getElementById('menu-logo-box');
          if (state.empresa.logo) {
            logoBox.innerHTML = `<img src="${/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(state.empresa.logo) ? state.empresa.logo : ''}" class="w-full h-full object-cover">`;
          } else {
            logoBox.textContent = 'CF';
          }
        },
        actualizarBadgeSincronizacion() {
          const badge = document.getElementById('dashboard-sync-status');
          if (!badge) return;
          const sincronizado = !!(
            ConstruFactu.FirebaseSync &&
            typeof ConstruFactu.FirebaseSync.estaConectado === 'function' &&
            ConstruFactu.FirebaseSync.estaConectado()
          );
          badge.textContent = sincronizado ? '☁️ Conectado' : '☁️ Sin conexión';
          badge.className = sincronizado
            ? 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800'
            : 'text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600';
        },
        refrescarVistaActual() {
          if (document.getElementById('view-pdf') && !document.getElementById('view-pdf').classList.contains('hidden')) return;
          const visible = id => {
            const elemento = document.getElementById(id);
            return elemento && !elemento.classList.contains('hidden');
          };

          if (this.vistaActual === 'login' && typeof window.renderLogoEmpresaLogin === 'function') {
            window.renderLogoEmpresaLogin();
          } else if (this.vistaActual === 'menu' && visible('view-menu')) {
            this.actualizarBadgesMenu();
          } else if (this.vistaActual === 'clientes' && visible('view-clientes') && typeof window.renderClientes === 'function') {
            window.renderClientes();
          } else if (['presupuestos', 'albaranes', 'facturas'].includes(this.vistaActual) && visible('view-docs') && typeof window.renderListadoDocs === 'function') {
            window.renderListadoDocs();
          } else if (this.vistaActual === 'gastos' && visible('view-gastos') && typeof window.renderGastos === 'function') {
            window.renderGastos();
          } else if (this.vistaActual === 'tarifario' && visible('view-tarifario') && typeof window.renderTarifario === 'function') {
            window.renderTarifario();
          } else if (this.vistaActual === 'estado' && visible('view-estado') && typeof window.renderEstado === 'function') {
            window.renderEstado();
          } else if (this.vistaActual === 'config' && visible('view-config') && typeof window.cargarVistaConfig === 'function') {
            window.cargarVistaConfig();
          }
        },
        actualizarBotonScroll() {
          const btn = document.getElementById('btn-scroll-float');
          if (!btn) return;
          if (document.documentElement.scrollHeight > window.innerHeight + 90) btn.classList.remove('hidden');
          else btn.classList.add('hidden');
        }
      }
    });

    const capituloAjustes = { numero: 1, titulo: 'Ajustes de Empresa' };
    const capitulosManual = {
      empresa: capituloAjustes,
      ajustes: capituloAjustes,
      presupuestos: { numero: 2, titulo: 'Presupuestos' },
      facturacion: { numero: 3, titulo: 'Facturación' },
      gastos: { numero: 4, titulo: 'Gastos' },
      tarifario: { numero: 5, titulo: 'Tarifario' },
      sincronizacion: { numero: 6, titulo: 'Sincronización' },
      copias: { numero: 7, titulo: 'Copias de Seguridad' },
      borrado: { numero: 8, titulo: 'Borrado y Cierre' },
      estado: { numero: 9, titulo: 'Mi Estado y Trimestres' }
    };

    window.renderizarManual = function renderizarManual(capituloId) {
      const id = Object.prototype.hasOwnProperty.call(capitulosManual, capituloId) ? capituloId : 'empresa';
      const capitulo = capitulosManual[id];
      const numero = document.getElementById('manual-numero');
      const titulo = document.getElementById('manual-titulo');
      const texto = document.getElementById('manual-texto');
      if (!numero || !titulo || !texto) return;

      numero.textContent = `Capítulo ${capitulo.numero}`;
      titulo.textContent = capitulo.titulo;
      if (id === 'empresa' || id === 'ajustes') {
        texto.innerHTML = `
          <section class="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">1. Sube el Logo de tu Empresa</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">En esta sección puedes subir el logo que aparecerá en tus presupuestos y facturas. Pulsa el botón 'Seleccionar archivo' y elige una imagen de tu ordenador. El logo se verá en la pantalla de inicio y en los PDFs.</p>
            <img src="assets/manual/01-ajustes-logo.png" style="max-width: 100%; border-radius: 8px; margin: 15px 0;" alt="Subir Logo">
          </section>
          <section class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-amber-900">2. Configuración de Facturación (¡Cuidado!)</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Aquí se configura cómo se numeran tus facturas. La Serie es el prefijo (ej. F2026) y el Siguiente Número es el número que se asignará a la próxima factura. ⚠️ ¡Mucho ojo! No cambies esto si ya has emitido facturas, ya que Hacienda exige que los números sean correlativos y no tengan saltos.</p>
            <img src="assets/manual/02-ajustes-facturacion.png" style="max-width: 100%; border-radius: 8px; margin: 15px 0;" alt="Configuración Facturación">
          </section>`;
      } else if (id === 'presupuestos') {
        texto.innerHTML = `
          <section class="mb-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">Crear un presupuesto</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Crea un presupuesto pulsando '+ Nuevo Documento'. Elige el cliente, añade las partidas (puedes escribirlas a mano o seleccionarlas directamente de tu Tarifario) y guarda. Desde la lista principal puedes descargar el PDF o convertirlo en factura.</p>
            <img src="assets/manual/10-manual-presupuestos.png" style="max-width: 100%;" alt="Presupuestos">
          </section>`;
      } else if (id === 'facturacion') {
        texto.innerHTML = `
          <section class="mb-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">Gestionar facturas</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Tus presupuestos aceptados se pueden convertir en Factura Proforma. Una vez revisada, pulsa 'Emitir Factura Oficial' para que se le asigne un número de serie legal. Si te equivocas, usa el botón 'Rectificar'.</p>
            <img src="assets/manual/11-manual-facturacion.png" style="max-width: 100%;" alt="Facturación">
          </section>`;
      } else if (id === 'gastos') {
        texto.innerHTML = `
          <section class="mb-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">Registrar gastos</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Registra tus compras y gastos (materiales, gasolina, etc.). Puedes añadir el proveedor, la categoría y usar el campo 'Observaciones' para apuntar detalles (ej. 'Material para obra de Juan').</p>
            <img src="assets/manual/12-manual-gastos.png" style="max-width: 100%;" alt="Gastos">
          </section>`;
      } else if (id === 'tarifario') {
        texto.innerHTML = `
          <section class="mb-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">Tu catálogo de precios</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Es tu catálogo de precios. Añade tus partidas con su precio y unidad. Puedes importar o exportar tus precios en formato CSV/Excel para llevarlos siempre contigo.</p>
            <img src="assets/manual/13-manual-tarifario.png" style="max-width: 100%;" alt="Tarifario">
          </section>`;
      } else if (id === 'sincronizacion') {
        texto.innerHTML = `
          <section class="mb-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">Sincronizar dispositivos</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Usa ConstruFactu en varios dispositivos a la vez. Vincula tu cuenta con el Código Nube y todos tus cambios se subirán a la nube automáticamente. Tus datos aparecerán en el otro dispositivo sin hacer nada.</p>
            <img src="assets/manual/14-manual-sincronizacion.png" style="max-width: 100%;" alt="Sincronización">
          </section>`;
      } else if (id === 'copias') {
        texto.innerHTML = `
          <section class="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">1. ¿Para qué sirve la Copia de Seguridad?</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Es muy importante guardar una copia de tus datos de vez en cuando. Es como hacer una fotografía de todos tus clientes, facturas y gastos. Si algún día tu ordenador falla o quieres pasar los datos a otro dispositivo, podrás recuperarlos usando este archivo.</p>
            <img src="assets/manual/04-manual-copia-seguridad.png" style="max-width: 100%; border-radius: 8px; margin: 15px 0;" alt="Copia de Seguridad">
          </section>
          <section class="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">2. Guardar una Copia</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Tienes dos formas de guardar tu copia:</p>
            <ol class="mt-2 list-decimal space-y-2 pl-6 text-base sm:text-lg leading-relaxed text-slate-700">
              <li>Pulsando 'Enviar copia por email': Se abrirá tu gestor de correo para que te lo envíes a ti mismo.</li>
              <li>Pulsando 'Descargar archivo (.json) en dispositivo': Se guardará un archivo en tu ordenador o móvil. ¡Guárdalo en un pendrive o en la nube!</li>
            </ol>
            <img src="assets/manual/05-manual-guardar-copia.png" style="max-width: 100%; border-radius: 8px; margin: 15px 0;" alt="Guardar Copia">
          </section>
          <section class="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">3. Restaurar tus datos</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Si has tenido un problema o estás en un ordenador nuevo, pulsa el botón 'Seleccionar archivo' en la sección 'Restaurar desde archivo JSON' y elige la copia que guardaste antes. ¡Todos tus datos volverán a aparecer como por arte de magia!</p>
            <img src="assets/manual/06-manual-restaurar.png" style="max-width: 100%; border-radius: 8px; margin: 15px 0;" alt="Restaurar Copia">
          </section>
          <section class="mb-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-blue-900">4. Recordatorios</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Para no olvidarte de hacer copias, puedes configurar un recordatorio en el desplegable 'Frecuencia de Recordatorio'. La app te avisará cada semana o cada mes para que no pierdas nada.</p>
          </section>`;
      } else if (id === 'borrado') {
        texto.innerHTML = `
          <section class="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">1. Borrar Datos (Limpieza)</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Si necesitas hacer limpieza, usa el botón 'Borrar datos'. Se abrirá una ventana donde podrás elegir qué quieres borrar (presupuestos, gastos, clientes...). Por seguridad, te pedirá tu PIN de administrador. ⚠️ Ten en cuenta que las facturas oficiales NUNCA se borran, ya que Hacienda obliga a conservarlas.</p>
            <img src="assets/manual/07-manual-borrar-datos.png" style="max-width: 100%; border-radius: 8px; margin: 15px 0;" alt="Borrar Datos">
          </section>
          <section class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-rose-900">2. Cerrar Empresa y Empezar de Cero</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Si vendes el negocio o quieres empezar desde cero, pulsa el botón rojo 'Cerrar Empresa'. La app te obligará a descargar una copia de seguridad, luego te pedirá tu PIN y, por último, tendrás que escribir la palabra 'CERRAR' para confirmar. Una vez hecho, la app se reiniciará completamente vacía.</p>
            <img src="assets/manual/08-manual-cerrar-empresa.png" style="max-width: 100%; border-radius: 8px; margin: 15px 0;" alt="Cerrar Empresa">
          </section>
          <section class="mb-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-emerald-900">3. Verificar Integridad Veri*Factu</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">El botón verde 'Verificar integridad Veri*Factu' comprueba que todas tus facturas están correctamente registradas y que nadie ha manipulado los datos. Si todo está bien, te mostrará un mensaje de éxito con el número de registros verificados.</p>
            <img src="assets/manual/09-manual-verificar-verifactu.png" style="max-width: 100%; border-radius: 8px; margin: 15px 0;" alt="Verificar VeriFactu">
          </section>`;
      } else if (id === 'estado') {
        texto.innerHTML = `
          <section class="mb-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <h4 class="text-lg sm:text-xl font-extrabold text-slate-900">Consultar Mi Estado y Trimestres</h4>
            <p class="mt-3 text-base sm:text-lg leading-relaxed text-slate-700">Esta sección calcula automáticamente tu IVA (Modelo 303) de cada trimestre. Revisa tus cifras y, cuando estén listas, usa el botón para enviar los datos directamente a tu gestor o descargarlos para tu contabilidad.</p>
            <img src="assets/manual/15-manual-trimestres.png" style="max-width: 100%;" alt="Mi Estado y Trimestres">
          </section>`;
      } else {
        texto.textContent = `Contenido del capítulo ${capitulo.numero} en construcción...`;
      }

      document.querySelectorAll('[data-manual-capitulo]').forEach(boton => {
        const activo = boton.dataset.manualCapitulo === (id === 'ajustes' ? 'empresa' : id);
        boton.classList.toggle('is-active', activo);
        boton.setAttribute('aria-pressed', String(activo));
      });
    };

    window.addEventListener('construfactu:datosActualizados', event => {
      console.log('[SYNC] Redibujando vista activa tras recibir datos.', event.detail);
      ConstruFactu.UI.refrescarVistaActual();
    });

    /* ═══ DINERO: aritmética en céntimos enteros (sin errores de coma flotante) ═══
       · Importes en euros → céntimos con redondeo "half away from zero" (el habitual en facturación).
       · Cantidad: hasta 3 decimales. Precio unitario: hasta 4 decimales (p. ej. 0,125 €/ud).
       · Cada línea se redondea a céntimo; Base = Σ líneas; IVA = redondeo(Base × tipo); Total = Base + IVA. */
    /* ═══ EVENTOS DELEGADOS ═══
       Sustituye a los onclick/oninput/onchange inline. El HTML declara: data-click="funcion" data-click-args='[...]'
       (idem data-input / data-change). Argumentos especiales: "$this" = el elemento, "$value" = su valor.
       Solo se pueden invocar funciones globales propias de la app (nunca nativas como eval/alert). */
    (function iniciarEventosDelegados() {
      ['click', 'input', 'change'].forEach(ev => document.addEventListener(ev, (e) => {
        for (let el = e.target; el && el.nodeType === 1; el = el.parentElement) {      // burbujeo igual que un onclick inline
          const nombre = el.getAttribute('data-' + ev);
          if (!nombre) continue;
          const fn = Object.prototype.hasOwnProperty.call(window, nombre) ? window[nombre] : null;
          if (typeof fn !== 'function' || /\[native code\]/.test(Function.prototype.toString.call(fn))) { console.error('[eventos] acción no permitida o inexistente:', nombre); continue; }
          let args = [];
          try { args = JSON.parse(el.getAttribute('data-' + ev + '-args') || '[]'); } catch (err) { console.error('[eventos] argumentos inválidos en', nombre); continue; }
          args = args.map(a => a === '$this' ? el : a === '$value' ? el.value : a);
          try {
            const r = fn.apply(window, args);
            if (r && typeof r.catch === 'function') r.catch(err => console.error('[' + nombre + ']', err));
          } catch (err) { console.error('[' + nombre + ']', err); }
          if (e.cancelBubble) break;
        }
      }));
    })();

    // Botón "atrás" del móvil/navegador: vuelve a la vista anterior y cierra visor PDF y ventanas emergentes.
    window.addEventListener('popstate', (event) => {
      const UI = ConstruFactu.UI;
      document.getElementById('view-pdf').classList.add('hidden');
      document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
      const destino = event.state?.vista;
      if (!destino) return; // En Inicio no se añade otro estado: el navegador puede salir de la app.
      if (destino === 'login' && UI.sesionActiva) return;
      if (!UI.sesionActiva && destino !== 'login') {
        UI.irA('login', true);
        return;
      }
      UI.irA(destino, true);
    });
    try {
      history.replaceState({ vista: ConstruFactu.UI.vistaActual }, '', '#' + ConstruFactu.UI.vistaActual);
    } catch (error) {
      console.error('[navegación] No se pudo guardar la vista inicial en el historial:', error);
    }

    // SheetJS solo se descarga cuando se importa/exporta Excel (la app arranca sin red).
    let _xlsxPromise = null;
    function cargarXLSX() {
      if (typeof XLSX !== 'undefined') return Promise.resolve();
      if (!_xlsxPromise) _xlsxPromise = new Promise((ok, ko) => {
        const sc = document.createElement('script');
        sc.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
        sc.onload = ok;
        sc.onerror = () => { _xlsxPromise = null; ko(new Error('Para usar Excel se necesita conexión la primera vez.')); };
        document.head.appendChild(sc);
      });
      return _xlsxPromise;
    }

    /* ═══ DIÁLOGOS PROPIOS (sustituyen a alert / confirm / prompt) ═══
       Todos devuelven una Promesa y se encolan (nunca se solapan). Los textos se insertan con textContent:
       sin riesgo de inyección. Accesibles: role="dialog", foco atrapado, Esc cancela, Enter acepta. */
    const Dialogo = {
      _cola: Promise.resolve(),
      _enc(fn) { const p = this._cola.then(fn); this._cola = p.catch(() => {}); return p; },
      _el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; },
      _tipo(m) { m = String(m).trimStart(); if (m.startsWith('✅')) return 'ok'; if (m.startsWith('❌') || /^No se pudo/.test(m)) return 'error'; if (m.startsWith('⚠')) return 'aviso'; return 'info'; },
      _limpiar(m) { return String(m).replace(/^\s*(✅|❌|⚠️|⚠|🔑)\s*/, ''); },

      _abrir({ titulo, mensaje, tipo = 'info', botones, principal, alEscapar, input, extra }) {
        return this._enc(() => new Promise(resolve => {
          const previo = document.activeElement, refs = {};
          const raiz = this._el('div', 'fixed inset-0 z-[200] bg-slate-900/60 flex items-end sm:items-center justify-center p-4');
          raiz.id = 'dlg-root';
          const panel = this._el('div', 'w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto');
          panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'dlg-titulo');
          const colores = { ok: 'bg-emerald-100 text-emerald-700', error: 'bg-rose-100 text-rose-700', aviso: 'bg-amber-100 text-amber-700', info: 'bg-slate-100 text-slate-700' };
          const iconos = { ok: '✓', error: '✕', aviso: '!', info: 'i' };
          const cab = this._el('div', 'flex items-center gap-3');
          cab.appendChild(this._el('div', 'w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-extrabold text-sm ' + colores[tipo], iconos[tipo]));
          const h = this._el('h2', 'font-extrabold text-base text-slate-900', titulo); h.id = 'dlg-titulo'; cab.appendChild(h);
          panel.appendChild(cab);
          const msg = this._el('p', 'text-sm text-slate-700 whitespace-pre-line', mensaje); msg.id = 'dlg-msg'; panel.appendChild(msg);
          let campo = null;
          if (input) {
            campo = this._el('input', 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm');
            campo.id = 'dlg-input'; campo.type = input.tipo || 'text'; campo.autocomplete = 'off';
            if (input.placeholder) campo.placeholder = input.placeholder;
            panel.appendChild(campo);
          }
          if (extra) panel.appendChild(extra.nodo);
          const cerrar = (valor) => { document.removeEventListener('keydown', teclas, true); raiz.remove(); if (previo && previo.focus) { try { previo.focus(); } catch (e) {} } resolve(valor); };
          const estilos = { primario: 'bg-slate-900 text-white', peligro: 'bg-rose-600 text-white', neutro: 'bg-slate-100 text-slate-700' };
          const fila = this._el('div', 'flex flex-wrap gap-2 justify-end pt-1');
          botones.forEach(b => {
            const btn = this._el('button', 'px-4 py-2.5 rounded-xl font-extrabold text-xs disabled:opacity-40 ' + estilos[b.estilo], b.texto);
            btn.type = 'button'; btn.setAttribute('data-dlg', b.id); if (b.deshabilitado) btn.disabled = true;
            btn.addEventListener('click', () => b.accion(cerrar, campo, btn));
            refs[b.id] = btn; fila.appendChild(btn);
          });
          panel.appendChild(fila); raiz.appendChild(panel);
          if (extra && extra.alCrear) extra.alCrear(refs);
          const teclas = (e) => {
            if (e.key === 'Escape' && alEscapar) { e.preventDefault(); e.stopPropagation(); alEscapar(cerrar); }
            else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'TEXTAREA' && principal && !refs[principal].disabled) { e.preventDefault(); e.stopPropagation(); refs[principal].click(); }
            else if (e.key === 'Tab') {                                       // el foco no sale del diálogo
              const f = Array.from(panel.querySelectorAll('button:not([disabled]), input, a[href]'));
              if (!f.length) return;
              const i = f.indexOf(document.activeElement);
              if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
            }
          };
          document.addEventListener('keydown', teclas, true);
          document.body.appendChild(raiz);
          (campo || refs[principal] || fila.firstChild).focus();
        }));
      }
    };

    function avisar(mensaje, opc = {}) {
      const tipo = opc.tipo || Dialogo._tipo(mensaje);
      const titulos = { ok: 'Listo', error: 'No se pudo completar', aviso: 'Atención', info: 'Aviso' };
      return Dialogo._abrir({ titulo: opc.titulo || titulos[tipo], mensaje: Dialogo._limpiar(mensaje), tipo, principal: 'aceptar', alEscapar: c => c(),
        botones: [{ id: 'aceptar', texto: 'Entendido', estilo: 'primario', accion: c => c() }] });
    }
    function confirmar(mensaje, opc = {}) {                                  // → true / false
      return Dialogo._abrir({ titulo: opc.titulo || (opc.peligro ? 'Confirmar acción' : 'Confirmar'), mensaje: Dialogo._limpiar(mensaje), tipo: opc.peligro ? 'aviso' : 'info',
        principal: 'aceptar', alEscapar: c => c(false),
        botones: [{ id: 'cancelar', texto: opc.cancelar || 'Cancelar', estilo: 'neutro', accion: c => c(false) },
                  { id: 'aceptar', texto: opc.aceptar || 'Aceptar', estilo: opc.peligro ? 'peligro' : 'primario', accion: c => c(true) }] });
    }
    function pedirTexto(mensaje, opc = {}) {                                 // → texto / null si se cancela
      return Dialogo._abrir({ titulo: opc.titulo || 'Introduce un valor', mensaje: Dialogo._limpiar(mensaje), tipo: opc.peligro ? 'aviso' : 'info',
        input: { tipo: opc.tipo || 'text', placeholder: opc.placeholder }, principal: 'aceptar', alEscapar: c => c(null),
        botones: [{ id: 'cancelar', texto: 'Cancelar', estilo: 'neutro', accion: c => c(null) },
                  { id: 'aceptar', texto: opc.aceptar || 'Aceptar', estilo: opc.peligro ? 'peligro' : 'primario', accion: (c, campo) => c(campo.value) }] });
    }
    async function mostrarModalCompra() {
      const email = String((ConstruFactu.Store.state.auth || {}).email || '');
      const caja = Dialogo._el('div', 'space-y-2');
      const etiquetaEmail = Dialogo._el('label', 'block text-xs font-bold text-slate-700', 'Email de usuario para indicar en el pago');
      etiquetaEmail.htmlFor = 'email-licencia';
      const inputEmail = Dialogo._el('input', 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm');
      inputEmail.id = 'email-licencia';
      inputEmail.type = 'email';
      inputEmail.value = email;
      inputEmail.readOnly = true;
      caja.append(etiquetaEmail, inputEmail);

      const asunto = 'Solicitud de Licencia ConstruFactu';
      const cuerpo = 'Hola, he realizado el Bizum para activar mi licencia. Mi email de usuario es: ' + email;
      return Dialogo._abrir({
        titulo: 'Activar Licencia PRO',
        mensaje: 'Para activar tu licencia anual, realiza una transferencia de 49€ por Bizum al número 695709918 indicando tu email. Envíanos el justificante y te enviaremos tu clave de activación en menos de 24h.',
        extra: { nodo: caja },
        principal: 'email',
        alEscapar: c => c(false),
        botones: [
          { id: 'cerrar', texto: 'Cerrar', estilo: 'neutro', accion: c => c(false) },
          {
            id: 'email',
            texto: 'Enviar justificante por Email',
            estilo: 'primario',
            accion: c => {
              window.location.href = `mailto:alfonsoarandagarcia@gmail.com?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
              c(true);
            }
          }
        ]
      });
    }
    window.mostrarModalCompra = mostrarModalCompra;
    function pedirOpcionesBorrado() {
      const caja = Dialogo._el('div', 'space-y-3');
      const crearOpcion = (id, texto, marcada) => {
        const lab = Dialogo._el('label', 'flex items-start gap-2 text-sm text-slate-700 cursor-pointer');
        const chk = Dialogo._el('input', 'mt-0.5');
        chk.type = 'checkbox';
        chk.id = id;
        chk.checked = marcada;
        lab.appendChild(chk);
        lab.appendChild(Dialogo._el('span', null, texto));
        caja.appendChild(lab);
        return chk;
      };
      const chkPresupuestos = crearOpcion('chk-presupuestos', 'Borrar Presupuestos y Albaranes', true);
      const chkGastos = crearOpcion('chk-gastos', 'Borrar Gastos', true);
      const chkClientes = crearOpcion('chk-clientes', 'Borrar Clientes y Proveedores', false);
      const chkTarifario = crearOpcion('chk-tarifario', 'Borrar Tarifario (Catálogo de precios)', false);
      return Dialogo._abrir({
        titulo: 'Limpieza de datos',
        mensaje: 'Selecciona qué quieres borrar. Las facturas oficiales NUNCA se borran (obligación legal).',
        tipo: 'aviso',
        extra: { nodo: caja },
        principal: 'continuar',
        alEscapar: c => c(null),
        botones: [
          { id: 'cancelar', texto: 'Cancelar', estilo: 'neutro', accion: c => c(null) },
          { id: 'continuar', texto: 'Continuar', estilo: 'primario', accion: c => c({
            presupuestos: chkPresupuestos.checked,
            gastos: chkGastos.checked,
            clientes: chkClientes.checked,
            tarifario: chkTarifario.checked
          }) }
        ]
      });
    }
    function mostrarClaveRecuperacion(clave) {                               // no se puede cerrar sin confirmar que se ha guardado
      const caja = Dialogo._el('div', 'space-y-3');
      const k = Dialogo._el('div', 'font-mono text-base font-extrabold tracking-wider text-center bg-slate-50 border border-slate-200 rounded-xl p-3 select-all break-all', clave);
      k.id = 'dlg-clave'; caja.appendChild(k);
      const lab = Dialogo._el('label', 'flex items-start gap-2 text-xs text-slate-700 cursor-pointer');
      const chk = Dialogo._el('input', 'mt-0.5'); chk.type = 'checkbox'; chk.id = 'dlg-clave-ok';
      lab.appendChild(chk); lab.appendChild(Dialogo._el('span', null, 'He guardado la clave en un lugar seguro, fuera de este dispositivo.'));
      caja.appendChild(lab);
      return Dialogo._abrir({
        titulo: 'Tu clave de recuperación', tipo: 'aviso', principal: 'continuar',
        mensaje: 'Es la única forma de restablecer tu PIN si lo olvidas. Se muestra solo esta vez: guárdala en papel o en un gestor de contraseñas.',
        extra: { nodo: caja, alCrear: (refs) => { chk.addEventListener('change', () => { refs.continuar.disabled = !chk.checked; }); } },
        botones: [
          { id: 'copiar', texto: 'Copiar', estilo: 'neutro', accion: async (c, campo, btn) => { try { await navigator.clipboard.writeText(clave); btn.textContent = 'Copiada ✓'; } catch (e) { btn.textContent = 'No se pudo copiar'; } } },
          { id: 'descargar', texto: 'Descargar .txt', estilo: 'neutro', accion: () => {
              const txt = `ConstruFactu · Clave de recuperación\nEmpresa: ${(ConstruFactu.Store.state.empresa || {}).nombre || ''}\nClave: ${clave}\nGenerada: ${new Date().toLocaleString('es-ES')}\n\nGuarda este archivo fuera del dispositivo. Quien tenga esta clave puede restablecer el PIN.\n`;
              const url = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), a = document.createElement('a');
              a.href = url; a.download = 'ConstruFactu_clave_recuperacion.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); } },
          { id: 'continuar', texto: 'Continuar', estilo: 'primario', deshabilitado: true, accion: c => c(true) }]
      });
    }

    function mostrarAviso(msg, tipo = 'info') {
      const colores = { error: 'bg-rose-700', aviso: 'bg-amber-600', info: 'bg-slate-900' };
      const el = document.createElement('div');
      el.setAttribute('role', 'alert');
      el.className = `fixed top-3 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-[92%] px-4 py-3 rounded-xl text-white text-xs font-bold shadow-xl ${colores[tipo] || colores.info}`;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), tipo === 'error' ? 9000 : 5000);
    }

    let vistaAnteriorEditor = 'facturas';
    let lineasEditorTemp = [];

    const cpEspanaDB = {
      "41800": "Sanlúcar la Mayor (Sevilla)",
      "41110": "Bollullos de la Mitación (Sevilla)",
      "41001": "Sevilla", "41002": "Sevilla", "41003": "Sevilla", "41004": "Sevilla", "41005": "Sevilla",
      "41006": "Sevilla", "41007": "Sevilla", "41008": "Sevilla", "41009": "Sevilla", "41010": "Sevilla",
      "41011": "Sevilla", "41012": "Sevilla", "41013": "Sevilla", "41014": "Sevilla", "41015": "Sevilla",
      "41016": "Sevilla", "41018": "Sevilla", "41019": "Sevilla", "41020": "Sevilla",
      "41927": "Mairena del Aljarafe (Sevilla)", "41940": "Tomares (Sevilla)", "41900": "Camas (Sevilla)",
      "28001": "Madrid", "08001": "Barcelona", "45001": "Toledo", "50001": "Zaragoza",
      "41": "Provincia de Sevilla", "28": "Comunidad de Madrid", "08": "Barcelona", "45": "Toledo", "50": "Zaragoza"
    };

    function accionScrollFlotante() {
      window.scrollBy({ top: 300, behavior: 'smooth' });
    }
    window.addEventListener('scroll', ConstruFactu.UI.actualizarBotonScroll);

    function cambiarTabLogin(tab) {
      document.getElementById('form-login-pane').classList.toggle('hidden', tab !== 'login');
      document.getElementById('form-registro-pane').classList.toggle('hidden', tab !== 'registro');
      document.getElementById('form-recuperar-pane').classList.toggle('hidden', tab !== 'recuperar');
      
      const btnLog = document.getElementById('tab-btn-login');
      const btnReg = document.getElementById('tab-btn-registro');
      if (tab === 'login') {
        btnLog.className = "flex-1 py-2 rounded-lg text-xs font-extrabold bg-slate-900 text-white shadow-sm transition";
        btnReg.className = "flex-1 py-2 rounded-lg text-xs font-extrabold text-slate-600 transition";
      } else if (tab === 'registro') {
        btnReg.className = "flex-1 py-2 rounded-lg text-xs font-extrabold bg-slate-900 text-white shadow-sm transition";
        btnLog.className = "flex-1 py-2 rounded-lg text-xs font-extrabold text-slate-600 transition";
      }
    }

    async function iniciarSesion() {
      const u = document.getElementById('login-user').value.trim();
      const p = document.getElementById('login-pass').value;
      if (!u || !p) { avisar('Introduce usuario y contraseña.'); return; }
      const r = await ConstruFactu.Auth.iniciarSesion(u, p);
      if (r.ok) { document.getElementById('login-pass').value = ''; irA('menu'); }
      else avisar(r.msg || 'Usuario o contraseña incorrectos.');
    }


    async function registrarNuevaCuenta() {
      const emp = document.getElementById('reg-empresa').value.trim();
      const nif = document.getElementById('reg-nif').value.trim().toUpperCase();
      const email = document.getElementById('reg-email').value.trim();
      const pass = document.getElementById('reg-pass').value;
      if (!emp || !nif || !email || !pass) { avisar('Rellena todos los campos del registro.'); return; }
      try {
        const clave = await ConstruFactu.Auth.registrar(emp, nif, email, pass);
        await ConstruFactu.Store.save();
        await mostrarClaveRecuperacion(clave);
        document.getElementById('login-user').value = email;
        document.getElementById('login-pass').value = '';
        cambiarTabLogin('login');
      } catch (e) { avisar(e.message); }
    }

    async function enviarRecuperacion() {
      const email = document.getElementById('rec-email').value.trim();
      const clave = document.getElementById('rec-clave').value;
      const pin = document.getElementById('rec-pin').value;
      if (!email || !clave || !pin) { avisar('Rellena email, clave de recuperación y PIN nuevo.'); return; }
      try {
        const nueva = await ConstruFactu.Auth.recuperar(email, clave, pin);
        ['rec-clave', 'rec-pin'].forEach(i => document.getElementById(i).value = '');
        await mostrarClaveRecuperacion(nueva);
        avisar('PIN restablecido. Ya puedes acceder.');
        cambiarTabLogin('login');
      } catch (e) { avisar(e.message); }
    }


    function fmtCant(n) {                                   // 3,5 · 1.250 · 0,125 (formato es-ES, hasta 3 decimales)
      return (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 3 });
    }
    function fmtPrecio(n) {                                  // precio unitario: 2 a 4 decimales (0,125 €), para que cuadre con el importe
      return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' €';
    }
    function fmtEuro(n) {
      return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    function calcTotalesDoc(doc) {
      return ConstruFactu.Documentos.calcularTotales(doc);
    }

    function ocultarTodasLasVistas() {
      ConstruFactu.UI.ocultarTodas();
    }

    function irA(vista, esPopState = false) {
      ConstruFactu.UI.irA(vista, esPopState);
    }

    function volverAtras() {
      history.back();
    }

    function actualizarBadgesMenu() {
      ConstruFactu.UI.actualizarBadgesMenu();
    }

    function abrirModalVerifactu() { document.getElementById('modal-verifactu').classList.remove('hidden'); }
    function cerrarModalVerifactu() { document.getElementById('modal-verifactu').classList.add('hidden'); }

    async function confirmarEmisionVerifactu() {
      const btn = document.querySelector('#modal-verifactu button[onclick*="confirmarEmision"]');
      if (btn) btn.disabled = true;
      try {
        const doc = await guardarDocumento('silent');
        if (!doc) return;
        cerrarModalVerifactu();
        const actualizado = await ConstruFactu.VeriFactu.emitirOficial(doc.id);
        irA('facturas');
        verPDFDocumento(actualizado.id);
      } catch (e) {
        avisar('❌ No se pudo emitir: ' + e.message);
      } finally { if (btn) btn.disabled = false; }
    }

    async function verificarIntegridadVerifactu() {
      const r = await ConstruFactu.VeriFactu.verificarCadena();
      if (r.ok) avisar(`✅ Cadena Veri*factu íntegra.\nRegistros verificados: ${r.total}`);
      else avisar(`⚠️ Se detectaron ${r.errores.length} incidencia(s):\n\n- ` + r.errores.slice(0, 10).join('\n- '));
    }

    function escapeHTML(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
      );
    }

    function renderizarPreviewLogoEmpresa(logo) {
      const contenedor = document.getElementById('logo-preview-container');
      if (!contenedor) return;
      contenedor.replaceChildren();

      if (typeof logo !== 'string' || !logo.startsWith('data:image/')) {
        contenedor.textContent = 'Ningún archivo seleccionado';
        return;
      }

      const imagen = document.createElement('img');
      imagen.src = logo;
      imagen.alt = 'Logo actual de la empresa';
      imagen.style.cssText = 'max-height: 40px; max-width: 150px; object-fit: contain; vertical-align: middle;';
      imagen.onerror = () => renderizarPreviewLogoEmpresa('');
      contenedor.append(imagen);

      const etiqueta = document.createElement('span');
      etiqueta.textContent = 'Logo actual';
      contenedor.append(etiqueta);
    }

    function cargarVistaConfig() {
      const state = ConstruFactu.Store.state;
      document.getElementById('cfg-nombre').value = state.empresa.nombre;
      document.getElementById('cfg-email').value = state.auth.email || '';
      renderizarPreviewLogoEmpresa(state.empresa.logo);
      
      const lic = ConstruFactu.Licensing.obtenerEstado();
      document.getElementById('cfg-badge-licencia').textContent = lic.texto;
      document.getElementById('cfg-desc-licencia').innerHTML = lic.desc;
      
      document.getElementById('cfg-nif').value = state.empresa.nif;
      const serie = state.empresa.serie || 'F2026';
      document.getElementById('cfg-serie').value = serie;
      const contadorActual = Number((state.contadoresVerifactu || {})[serie]) || 0;
      document.getElementById('cfg-siguiente-numero').value = String(contadorActual + 1);
      document.getElementById('cfg-direccion').value = state.empresa.direccion || '';
      document.getElementById('cfg-iban').value = state.empresa.iban || '';
      ['cfg-pin-actual', 'cfg-pin-nuevo'].forEach(i => document.getElementById(i).value = '');
      document.getElementById('cfg-frecuencia').value = state.empresa.frecuenciaRecordatorio || '7';
      const modoVerifactu = document.querySelector('[data-input="cambiarModoVerifactu"]');
      if (modoVerifactu) modoVerifactu.value = state.empresa.modoVerifactu || 'no_verifactu';
    }

    async function cambiarModoVerifactu(e) {
      const select = e && e.target
        ? e.target
        : document.querySelector('[data-input="cambiarModoVerifactu"]');
      if (!select) return;

      ConstruFactu.Store.state.empresa.modoVerifactu = select.value;
      ConstruFactu.Store.state.empresa.updatedAt = Date.now();
      await ConstruFactu.Store.save();
      mostrarAviso('Modo de facturación actualizado. A partir de ahora tus nuevas facturas se generarán en este modo.');
    }

    function cargarLogoEmpresa(input) {
      if (input.files && input.files[0]) {
        const archivo = input.files[0];
        if (archivo.size > 50000) {
          avisar('El logo es demasiado grande. Por favor, usa una imagen de menos de 50 KB para evitar problemas de sincronización.');
          return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
          const logo = e.target && typeof e.target.result === 'string' ? e.target.result : '';
          ConstruFactu.Store.state.empresa.logo = logo;
          ConstruFactu.Store.state.empresa.updatedAt = Date.now();
          renderizarPreviewLogoEmpresa(logo);
          avisar('Logotipo cargado correctamente. Guarda los datos para consolidar.');
        };
        reader.onerror = function() {
          avisar('No se pudo leer el archivo del logotipo.', { tipo: 'error' });
        };
        reader.readAsDataURL(archivo);
      }
    }

    async function guardarConfigEmpresa() {
      const state = ConstruFactu.Store.state;
      state.empresa.nombre = document.getElementById('cfg-nombre').value.trim();
      state.empresa.nif = document.getElementById('cfg-nif').value.trim().toUpperCase();
      state.empresa.direccion = document.getElementById('cfg-direccion').value.trim();
      state.empresa.iban = document.getElementById('cfg-iban').value.trim().toUpperCase();
      state.empresa.frecuenciaRecordatorio = document.getElementById('cfg-frecuencia').value;
      state.empresa.updatedAt = Date.now();
      
      const u = document.getElementById('cfg-email').value.trim();
      const pActual = document.getElementById('cfg-pin-actual').value;
      const pNuevo = document.getElementById('cfg-pin-nuevo').value;
      if (pNuevo) {
        if (!(/^\d{4,}$/.test(pNuevo) || pNuevo.length >= 6)) { avisar('El PIN nuevo debe tener 4+ dígitos o 6+ caracteres.'); return; }
        if (!(await ConstruFactu.Auth.verificarPin(pActual))) { avisar('El PIN actual no es correcto.'); return; }
        state.auth.pin = await ConstruFactu.Auth._credencial(pNuevo);
        delete state.auth.password; delete state.auth.masterKey;
      }
      if (u) state.auth.email = u;

      await ConstruFactu.Store.save();
      avisar('Configuración guardada correctamente.');
      irA('menu');
    }

    async function guardarConfiguracionFacturacion() {
      const state = ConstruFactu.Store.state;
      const serie = document.getElementById('cfg-serie').value.trim().toUpperCase();
      const siguienteNumero = Number(document.getElementById('cfg-siguiente-numero').value);
      if (!serie) {
        avisar('La serie de facturación no puede estar vacía.', { tipo: 'error' });
        return;
      }
      if (!Number.isSafeInteger(siguienteNumero) || siguienteNumero < 1) {
        avisar('El siguiente número debe ser un entero mayor que cero.', { tipo: 'error' });
        return;
      }

      state.contadoresVerifactu = state.contadoresVerifactu || {};
      const serieAnterior = state.empresa.serie;
      const serieActual = serieAnterior || 'F2026';
      const siguienteNumeroAnterior = (Number(state.contadoresVerifactu[serieActual]) || 0) + 1;
      const existenFacturasOficiales = (state.documentos || []).some(doc =>
        doc.tipo === 'factura' && doc.estado === 'Oficial'
      );
      if (
        existenFacturasOficiales &&
        (serie !== serieActual || siguienteNumero !== siguienteNumeroAnterior) &&
        !(await confirmar(
          '¿Estás completamente seguro de que quieres cambiar la numeración? Esta acción modificará cómo se numeran las próximas facturas oficiales.',
          { aceptar: 'Cambiar numeración', cancelar: 'Mantener actual', peligro: true, titulo: 'Cambio de numeración' }
        ))
      ) return;

      const updatedAtAnterior = state.empresa.updatedAt;
      const contadorUpdatedAtAnterior = state.contadoresVerifactuUpdatedAt;
      const teniaContador = Object.prototype.hasOwnProperty.call(state.contadoresVerifactu, serie);
      const contadorAnterior = state.contadoresVerifactu[serie];
      state.empresa.serie = serie;
      state.empresa.updatedAt = Date.now();
      state.contadoresVerifactu[serie] = siguienteNumero - 1;
      state.contadoresVerifactuUpdatedAt = Date.now();

      let guardado;
      try {
        guardado = await ConstruFactu.Store.save();
      } catch (error) {
        state.empresa.serie = serieAnterior;
        if (updatedAtAnterior === undefined) delete state.empresa.updatedAt;
        else state.empresa.updatedAt = updatedAtAnterior;
        if (teniaContador) state.contadoresVerifactu[serie] = contadorAnterior;
        else delete state.contadoresVerifactu[serie];
        state.contadoresVerifactuUpdatedAt = contadorUpdatedAtAnterior;
        console.error('[Ajustes] Error al guardar la numeración:', error);
        avisar('No se pudo guardar la configuración de facturación.', { tipo: 'error' });
        return;
      }
      if (!guardado) {
        state.empresa.serie = serieAnterior;
        if (updatedAtAnterior === undefined) delete state.empresa.updatedAt;
        else state.empresa.updatedAt = updatedAtAnterior;
        if (teniaContador) state.contadoresVerifactu[serie] = contadorAnterior;
        else delete state.contadoresVerifactu[serie];
        state.contadoresVerifactuUpdatedAt = contadorUpdatedAtAnterior;
        avisar('No se pudo guardar la configuración de facturación.', { tipo: 'error' });
        return;
      }

      avisar('Configuración de facturación guardada correctamente.');
    }

    async function limpiarDatosDemostraciónSeguro() {
      const opciones = await pedirOpcionesBorrado();
      if (opciones === null) return;

      const pin = await pedirTexto('Introduce tu PIN para confirmar la limpieza de datos', {
        titulo: 'Seguridad',
        tipo: 'password',
        aceptar: 'Confirmar limpieza',
        peligro: true,
        placeholder: 'Tu PIN'
      });
      if (!pin) return;

      if (!(await ConstruFactu.Auth.verificarPin(pin))) {
        avisar('PIN incorrecto. No se ha borrado ningún dato.');
        return;
      }

      const state = ConstruFactu.Store.state;
      const timestamp = Date.now();
      if (opciones.presupuestos) {
        state.documentos = (state.documentos || []).map(doc => {
          if (doc.tipo === 'factura' || doc.tipo === 'rectificativa' || doc.estado === 'Oficial' || doc.deletedAt) return doc;
          return { ...doc, deletedAt: timestamp, updatedAt: timestamp };
        });
      }
      if (opciones.gastos) {
        state.gastos = (state.gastos || []).map(gasto =>
          gasto.deletedAt ? gasto : { ...gasto, deletedAt: timestamp, updatedAt: timestamp }
        );
      }
      if (opciones.clientes) {
        state.clientes = (state.clientes || []).map(cliente =>
          cliente.deletedAt ? cliente : { ...cliente, deletedAt: timestamp, updatedAt: timestamp }
        );
        state.proveedores = [];
      }
      if (opciones.tarifario) {
        state.catalogoPrecios = (state.catalogoPrecios || []).map(partida =>
          partida.deletedAt ? partida : { ...partida, deletedAt: timestamp, updatedAt: timestamp }
        );
      }

      await ConstruFactu.Store.save();
      avisar('Limpieza completada. Tus facturas oficiales siguen a salvo.');
      irA('menu');
    }

    async function cerrarEmpresaYEmpezarDeCero() {
      const descargar = await confirmar(
        '⚠️ ATENCIÓN: Vas a cerrar la empresa actual.\n\nEs OBLIGATORIO que guardes una copia de seguridad. Hacienda te obliga a conservar tus facturas durante al menos 4 años.\n\n¿Quieres descargar tu copia de seguridad AHORA?',
        { aceptar: 'Descargar copia', cancelar: 'Cancelar', peligro: true, titulo: 'Cierre de empresa' }
      );
      if (!descargar) return;
      descargarBackupJSON();

      const pin = await pedirTexto('Introduce tu PIN de administrador para autorizar el cierre de empresa', {
        titulo: 'Seguridad',
        tipo: 'password',
        aceptar: 'Continuar',
        peligro: true,
        placeholder: 'Tu PIN'
      });
      if (!pin || !(await ConstruFactu.Auth.verificarPin(pin))) {
        avisar('PIN incorrecto. No se ha cerrado la empresa.');
        return;
      }

      const confirmacion = await pedirTexto('Escribe la palabra CERRAR para borrar todo y empezar de cero', {
        titulo: 'Confirmación Final',
        aceptar: 'Cerrar empresa',
        peligro: true,
        placeholder: 'CERRAR'
      });
      if (confirmacion !== 'CERRAR') {
        avisar('La confirmación no coincide. No se ha cerrado la empresa.');
        return;
      }

      ConstruFactu.Store.state = ConstruFactu.Store.clonarDefecto();
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(ConstruFactu.DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject();
        req.onblocked = () => resolve();
      });
      localStorage.clear();
      window.location.reload();
    }

    function cerrarSesion() { irA('login'); }

    function generarNombreBackup() {
      const ahora = new Date();
      const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
      const hora = `${String(ahora.getHours()).padStart(2, '0')}-${String(ahora.getMinutes()).padStart(2, '0')}`;
      const nombreEmpresa = String(ConstruFactu.Store.state.empresa.nombre || 'Empresa')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Empresa';
      return `ConstruFactu_Backup_${nombreEmpresa}_${fecha}_${hora}.json`;
    }

    async function enviarCopiaSeguridadEmail() {
      const fecha = new Date().toISOString().slice(0, 10), nombre = generarNombreBackup();
      const json = JSON.stringify(ConstruFactu.Store.state, null, 2);
      const continuar = await confirmar(
        'Vamos a preparar tu copia de seguridad.\n\nEl navegador te pedirá dónde guardarla. Una vez descargada, puedes adjuntarla a un correo o guardarla en tu nube (Drive, OneDrive, etc.).',
        { aceptar: 'Descargar ahora', cancelar: 'Cancelar' }
      );
      if (!continuar) return;

      // 1) Hoja de compartir del sistema, con el archivo ADJUNTO (móviles, tablets y algunos escritorios).
      //    Chrome/Android solo admite ciertos tipos de archivo: si .json no se permite, se comparte como .json.txt (se restaura igual).
      const variantes = [new File([json], nombre, { type: 'application/json' }), new File([json], nombre + '.txt', { type: 'text/plain' })];
      if (navigator.share && navigator.canShare) {
        for (const f of variantes) {
          if (!navigator.canShare({ files: [f] })) continue;
          try { await navigator.share({ title: 'Copia de seguridad ConstruFactu', text: 'Copia de seguridad de ConstruFactu (' + fecha + ').', files: [f] }); return; }
          catch (e) { if (e && e.name === 'AbortError') return; console.error('[compartir]', e); }
        }
      }

      // 2) Sin hoja de compartir (típico en ordenadores): NINGÚN navegador permite adjuntar un archivo desde un enlace mailto:.
      //    Se descarga la copia y se avisa con claridad de que el adjunto lo pone el usuario.
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })), a = document.createElement('a');
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }

    function descargarBackupJSON() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ConstruFactu.Store.state, null, 2));
      const a = document.createElement('a'); a.href = dataStr;
      a.download = generarNombreBackup();
      document.body.appendChild(a); a.click(); a.remove();
      avisar('Copia de seguridad descargada con éxito en tu dispositivo.');
    }

    async function restaurarDesdeArchivoJSON(input) {
      if (input.files && input.files[0]) {
        const confirmacion = await pedirTexto('⚠️ ADVERTENCIA DE SEGURIDAD:\n\nRestaurar una copia de seguridad sobrescribirá todos los datos y documentos actuales de la aplicación.\n\n¿Deseas continuar con la restauración?', { titulo: 'Confirmar restauración', aceptar: 'Restaurar', peligro: true, placeholder: 'Escribe RESTAURAR' });
        if (confirmacion === null || String(confirmacion).toUpperCase() !== 'RESTAURAR') {
          avisar('Debes escribir la palabra RESTAURAR exactamente para confirmar.');
          input.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = async function(e) {
          try {
            const parsed = JSON.parse(e.target.result);
            const errores = ConstruFactu.Store.validar(parsed, true);
            if (errores.length) { avisar('Archivo no válido:\n- ' + errores.join('\n- ')); return; }
            const previo = ConstruFactu.Store.state;
            try { localStorage.setItem('construfactu_prerestore', JSON.stringify(previo)); } catch (e2) {}
            ConstruFactu.Store.migrar(parsed);
            ConstruFactu.Store.state = ConstruFactu.Store.fusionar(ConstruFactu.Store.clonarDefecto(), parsed);
            const ver = await ConstruFactu.VeriFactu.verificarCadena(ConstruFactu.Store.state);
            if (!ver.ok && !(await confirmar('⚠️ La copia tiene inconsistencias en la cadena Veri*factu:\n\n- ' + ver.errores.slice(0, 5).join('\n- ') + '\n\n¿Restaurar igualmente?', { aceptar: 'Restaurar igualmente', peligro: true }))) { ConstruFactu.Store.state = previo; return; }
            const ok = await ConstruFactu.Store.save();
            if (!ok) { ConstruFactu.Store.state = previo; avisar('No se pudo guardar la copia restaurada. Se han conservado tus datos actuales.'); return; }
            avisar('¡Copia restaurada con éxito!');
            irA('menu');
          } catch (err) { avisar('Error al leer el archivo JSON.'); }
        };
        reader.readAsText(input.files[0]);
      }
    }

    async function activarLicencia() {
      const clave = document.getElementById('cfg-licencia-input').value.trim();
      const ok = await ConstruFactu.Licensing.activarClave(clave);
      if (ok) {
        avisar('¡Licencia PRO anual activada correctamente!');
        cargarVistaConfig();
        actualizarBadgesMenu();
      } else {
        avisar('Clave no válida.');
      }
    }

    function buscarActualizaciones() { avisar('Versión actual (v0.9.45) al día.'); }

    async function exportarGestoriaSeleccionada() {
      try {
        const trimestre = document.getElementById('est-trimestre').value;
        const anio = Number(document.getElementById('est-anio').value);
        if (!Number.isInteger(anio) || anio < 1000 || anio > 9999) {
          throw new Error('Selecciona un año válido para exportar.');
        }

        let desde;
        let hasta;
        if (trimestre === 'ALL') {
          desde = `${anio}-01-01`;
          hasta = `${anio}-12-31`;
        } else {
          const numeroTrimestre = Number(trimestre);
          if (!Number.isInteger(numeroTrimestre) || numeroTrimestre < 1 || numeroTrimestre > 4) {
            throw new Error('Selecciona un trimestre válido para exportar.');
          }
          const mesInicio = (numeroTrimestre - 1) * 3;
          const fechaFin = new Date(anio, mesInicio + 3, 0);
          desde = `${anio}-${String(mesInicio + 1).padStart(2, '0')}-01`;
          hasta = `${anio}-${String(mesInicio + 3).padStart(2, '0')}-${String(fechaFin.getDate()).padStart(2, '0')}`;
        }

        await ConstruFactu.Gestor.exportarGestor(desde, hasta);
        await avisar('ZIP para gestoría generado y descargado.');
      } catch (error) {
        await avisar(error && error.message ? error.message : 'No se pudo generar el archivo para Gestoría.', { tipo: 'error' });
      }
    }

    function renderLogoEmpresaLogin() {
      const contenedor = document.getElementById('login-brand-empresa');
      const empresa = (ConstruFactu.Store.state || {}).empresa || {};
      if (contenedor) {
        contenedor.replaceChildren();
        if (typeof empresa.logo === 'string' && empresa.logo.startsWith('data:image/')) {
          const img = document.createElement('img');
          img.src = empresa.logo;
          img.alt = empresa.nombre || 'Logo de la empresa';
          img.style.cssText = 'max-width: 380px; width: 100%; height: auto; margin: 20px 0;';
          img.onerror = () => {
            contenedor.replaceChildren();
            const nombre = document.createElement('div');
            nombre.className = 'text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 my-5';
            nombre.textContent = empresa.nombre || 'ConstruFactu';
            contenedor.appendChild(nombre);
          };
          contenedor.appendChild(img);
        } else if (typeof empresa.nombre === 'string' && empresa.nombre.trim()) {
          const nombre = document.createElement('div');
          nombre.className = 'text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 my-5';
          nombre.textContent = empresa.nombre.trim();
          contenedor.appendChild(nombre);
        }
      }

      const licenciaStatus = document.getElementById('login-licencia-status');
      if (!licenciaStatus) return;
      const estadoLicencia = ConstruFactu.Licensing.obtenerEstado();
      if (!estadoLicencia.vigente) {
        licenciaStatus.textContent = 'Prueba agotada. Activa tu licencia PRO.';
      } else if (empresa.licenciaTipo === 'pro') {
        const expiracion = empresa.licenciaExpiracion
          ? new Date(empresa.licenciaExpiracion)
          : null;
        licenciaStatus.textContent = expiracion && !Number.isNaN(expiracion.getTime())
          ? `Licencia PRO hasta: ${expiracion.toLocaleDateString('es-ES')}`
          : 'Licencia PRO activa';
      } else {
        const inicio = new Date(empresa.fechaCreacionSistema);
        const diasTranscurridos = Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24));
        const diasRestantes = Math.max(0, 15 - diasTranscurridos);
        licenciaStatus.textContent = `Prueba: ${diasRestantes} días restantes`;
      }
    }

    window.addEventListener('DOMContentLoaded', async () => {
      await ConstruFactu.Store.init();
      renderLogoEmpresaLogin();
      if (ConstruFactu.FirebaseSync && typeof ConstruFactu.FirebaseSync.autoConectar === 'function') {
        ConstruFactu.FirebaseSync.autoConectar().catch(error => {
          console.error('[FirebaseSync] No se pudo completar la conexión automática:', error);
        });
      }
      
      // Activar aviso visual si DEV_MODE es true
      if (typeof DEV_MODE !== 'undefined' && DEV_MODE) {
        const bannerDev = document.getElementById('banner-dev-mode');
        if (bannerDev) bannerDev.classList.remove('hidden');
        document.getElementById('login-user').value = 'admin@construcciones-garcia.es';
        document.getElementById('login-pass').value = '1234';
      }
      if (!ConstruFactu.Auth.tieneCuenta() && !(typeof DEV_MODE !== 'undefined' && DEV_MODE)) cambiarTabLogin('registro');

      actualizarBadgesMenu();
      ConstruFactu.VeriFactu.verificarCadena().then(r => { if (!r.ok) mostrarAviso('⚠️ Veri*factu: ' + r.errores[0], 'error'); }).catch(() => {});
      if (window.ConstruFactu.DispositivoMaestro) {
        window.ConstruFactu.DispositivoMaestro.init();
      }

      const botonExportarBackup = document.getElementById('btn-exportar-backup');
      const botonImportarBackup = document.getElementById('btn-importar-backup');
      const inputFileBackup = document.getElementById('input-file-backup');
      const fechaUltimoBackup = document.getElementById('ultimo-backup-fecha');
      const actualizarFechaUltimoBackup = () => {
        const ultimoExportEn = window.ConstruFactu.Store.state.backupConfig?.ultimoExportEn;
        if (!ultimoExportEn) {
          fechaUltimoBackup.textContent = 'Sin copias realizadas';
          return;
        }

        const fecha = new Date(ultimoExportEn);
        fechaUltimoBackup.textContent = Number.isNaN(fecha.getTime())
          ? 'Fecha no disponible'
          : fecha.toLocaleString('es-ES');
      };

      if (botonExportarBackup) {
        botonExportarBackup.addEventListener('click', async () => {
          const exportado = await window.ConstruFactu.VerifactuBackup.exportar();
          if (exportado) actualizarFechaUltimoBackup();
        });
      }

      if (botonImportarBackup && inputFileBackup) {
        botonImportarBackup.addEventListener('click', () => inputFileBackup.click());
        inputFileBackup.addEventListener('change', async () => {
          const file = inputFileBackup.files[0];
          if (!file) return;

          try {
            const importado = await window.ConstruFactu.VerifactuBackup.importar(file);
            if (importado) actualizarFechaUltimoBackup();
          } finally {
            inputFileBackup.value = '';
          }
        });
      }

      if (fechaUltimoBackup) actualizarFechaUltimoBackup();
    });
  