
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
        irA(destino, opts) {
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
            document.getElementById('view-ayuda').classList.remove('hidden');
          }
          window.scrollTo(0, 0);
          setTimeout(this.actualizarBotonScroll, 80);
          const previa = this.vistaActual;
          this.sesionActiva = destino !== 'login'; this.vistaActual = destino;
          if (!(opts && opts.sinHistorial)) {
            try {
              if (destino === 'login' || (destino === 'menu' && previa === 'login')) history.replaceState({ cf: 1, v: destino }, '');
              else if (destino !== previa) history.pushState({ cf: 1, v: destino }, '');
            } catch (e) {}
          }
        },
        actualizarBadgesMenu() {
          const state = ConstruFactu.Store.state;
          document.getElementById('menu-empresa-nombre').textContent = state.empresa.nombre;
          document.getElementById('menu-empresa-nif').textContent = `NIF: ${state.empresa.nif}`;
          
          const lic = ConstruFactu.Licensing.obtenerEstado();
          const menuBadge = document.querySelector('#view-menu .bg-amber-100');
          if (menuBadge) {
            menuBadge.textContent = lic.texto;
            menuBadge.className = `text-[10px] font-extrabold px-2 py-0.5 rounded ${lic.badgeClass}`;
          }
          document.getElementById('badge-presupuestos').textContent = state.documentos.filter(d => d.tipo === 'presupuesto').length;
          document.getElementById('badge-albaranes').textContent = state.documentos.filter(d => d.tipo === 'albaran').length;
          document.getElementById('badge-facturas').textContent = state.documentos.filter(d => d.tipo === 'factura' || d.tipo === 'rectificativa').length;
          document.getElementById('badge-clientes').textContent = `${state.clientes.length} registrados`;
          document.getElementById('badge-gastos').textContent = `${state.gastos.length} gastos`;
          document.getElementById('badge-tarifario').textContent = `${(state.catalogoPrecios || []).length} partidas`;
          
          const logoBox = document.getElementById('menu-logo-box');
          if (state.empresa.logo) {
            logoBox.innerHTML = `<img src="${/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(state.empresa.logo) ? state.empresa.logo : ''}" class="w-full h-full object-cover">`;
          } else {
            logoBox.textContent = 'CF';
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
    window.addEventListener('popstate', (e) => {
      const UI = ConstruFactu.UI;
      let destino = e.state && e.state.cf ? e.state.v : 'login';
      if (!UI.sesionActiva) destino = 'login';                                 // sin sesión nunca se muestra nada privado
      document.getElementById('view-pdf').classList.add('hidden');
      document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
      if (destino === 'login' && UI.sesionActiva) { history.pushState({ cf: 1, v: UI.vistaActual }, ''); return; }   // «atrás» en el menú no cierra sesión
      UI.irA(destino, { sinHistorial: true });
    });
    try { history.replaceState({ cf: 1, v: 'login' }, ''); } catch (e) {}

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
    function pedirRangoFechas() {
      const hoy = new Date();
      const formatoFecha = fecha => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
      const desde = document.createElement('input');
      desde.type = 'date';
      desde.id = 'fecha-desde';
      desde.value = formatoFecha(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
      desde.className = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm';
      const hasta = document.createElement('input');
      hasta.type = 'date';
      hasta.id = 'fecha-hasta';
      hasta.value = formatoFecha(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
      hasta.className = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm';

      const caja = Dialogo._el('div', 'space-y-3');
      const grupoDesde = Dialogo._el('div', 'space-y-1');
      const etiquetaDesde = Dialogo._el('label', 'block text-sm font-bold text-slate-700', 'Desde');
      etiquetaDesde.htmlFor = desde.id;
      grupoDesde.append(etiquetaDesde, desde);
      const grupoHasta = Dialogo._el('div', 'space-y-1');
      const etiquetaHasta = Dialogo._el('label', 'block text-sm font-bold text-slate-700', 'Hasta');
      etiquetaHasta.htmlFor = hasta.id;
      grupoHasta.append(etiquetaHasta, hasta);
      caja.append(grupoDesde, grupoHasta);

      return Dialogo._abrir({
        titulo: 'Exportar para Gestoría',
        mensaje: 'Selecciona el periodo que quieres descargar:',
        extra: { nodo: caja },
        principal: 'descargar',
        alEscapar: c => c(null),
        botones: [
          { id: 'cancelar', texto: 'Cancelar', estilo: 'neutro', accion: c => c(null) },
          { id: 'descargar', texto: 'Descargar ZIP', estilo: 'primario', accion: c => c({ desde: desde.value, hasta: hasta.value }) }
        ]
      });
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

    function irA(destino, opts) {
      ConstruFactu.UI.irA(destino, opts);
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

    function cargarVistaConfig() {
      const state = ConstruFactu.Store.state;
      document.getElementById('cfg-nombre').value = state.empresa.nombre;
      document.getElementById('cfg-email').value = state.auth.email || '';
      
      const lic = ConstruFactu.Licensing.obtenerEstado();
      document.getElementById('cfg-badge-licencia').textContent = lic.texto;
      document.getElementById('cfg-desc-licencia').innerHTML = lic.desc;
      
      document.getElementById('cfg-nif').value = state.empresa.nif;
      document.getElementById('cfg-serie').value = state.empresa.serie || 'F2026';
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
      await ConstruFactu.Store.save();
      mostrarAviso('Modo de facturación actualizado. A partir de ahora tus nuevas facturas se generarán en este modo.');
    }

    function cargarLogoEmpresa(input) {
      if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
          ConstruFactu.Store.state.empresa.logo = e.target.result;
          avisar('Logotipo cargado correctamente. Guarda los datos para consolidar.');
        };
        reader.readAsDataURL(input.files[0]);
      }
    }

    async function guardarConfigEmpresa() {
      const state = ConstruFactu.Store.state;
      state.empresa.nombre = document.getElementById('cfg-nombre').value.trim();
      state.empresa.nif = document.getElementById('cfg-nif').value.trim().toUpperCase();
      state.empresa.serie = document.getElementById('cfg-serie').value.trim().toUpperCase();
      state.empresa.direccion = document.getElementById('cfg-direccion').value.trim();
      state.empresa.iban = document.getElementById('cfg-iban').value.trim().toUpperCase();
      state.empresa.frecuenciaRecordatorio = document.getElementById('cfg-frecuencia').value;
      
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
      if (opciones.presupuestos) {
        state.documentos = state.documentos.filter(d =>
          d.tipo === 'factura' ||
          d.tipo === 'rectificativa' ||
          d.estado === 'Oficial'
        );
      }
      if (opciones.gastos) state.gastos = [];
      if (opciones.clientes) {
        state.clientes = [];
        state.proveedores = [];
      }
      if (opciones.tarifario) state.catalogoPrecios = [];

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

    async function descargarGestoriaPorFechas() {
      try {
        const rango = await pedirRangoFechas();
        if (rango === null) return;
        await ConstruFactu.Gestor.exportarGestor(rango.desde, rango.hasta);
        mostrarAviso('ZIP generado y descargado.');
      } catch (error) {
        mostrarAviso(error && error.message ? error.message : 'No se pudo generar el archivo para Gestoría.', 'error');
      }
    }

    function renderLogoEmpresaLogin() {
      const contenedor = document.getElementById('login-brand-empresa');
      if (!contenedor) return;

      contenedor.replaceChildren();
      const empresa = (ConstruFactu.Store.state || {}).empresa || {};
      if (typeof empresa.logo === 'string' && /^data:image\/[^;]+;base64,/.test(empresa.logo)) {
        const img = document.createElement('img');
        img.src = empresa.logo;
        img.alt = empresa.nombre || 'Logo de la empresa';
        img.className = 'max-h-16 object-contain';
        contenedor.appendChild(img);
      } else if (typeof empresa.nombre === 'string' && empresa.nombre.trim() && empresa.nombre.trim() !== 'Construcciones García S.L.') {
        const nombre = document.createElement('div');
        nombre.className = 'text-lg font-extrabold text-slate-700';
        nombre.textContent = empresa.nombre.trim();
        contenedor.appendChild(nombre);
      }
    }

    window.addEventListener('DOMContentLoaded', async () => {
      await ConstruFactu.Store.init();
      renderLogoEmpresaLogin();
      
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
    });
  