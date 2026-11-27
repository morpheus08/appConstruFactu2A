(function(CF) {
    let imagenAdjuntaTemporal = null;
    let solicitudImagenGasto = 0;
    let imagenGastoProcesando = false;

function renderGastos() {
      const q = (document.getElementById('buscar-gasto').value || '').toLowerCase();
      const cont = document.getElementById('lista-gastos');
      const filtrados = (ConstruFactu.Store.state.gastos || [])
        .filter(g => !g.deletedAt)
        .filter(g => g.proveedor.toLowerCase().includes(q) || g.concepto.toLowerCase().includes(q));
      if (!filtrados.length) { cont.innerHTML = `<div class="text-center text-xs text-slate-400 py-8">No hay gastos.</div>`; return; }
      cont.innerHTML = filtrados.map(g => {
        const tot = ConstruFactu.Money.gasto(g).totalC / 100;
        return `
          <div class="bg-white p-4 rounded-2xl border shadow-sm flex justify-between items-center">
            <div>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700">${escapeHTML(g.categoria)}</span>
              <h3 class="font-extrabold text-slate-900 text-sm mt-1">${escapeHTML(g.proveedor)}</h3>
              <p class="text-xs text-slate-500">${escapeHTML(g.concepto)} (${escapeHTML(g.fecha)})</p>
            </div>
           <div class="text-right">
              <div class="font-extrabold text-rose-700 text-sm">${fmtEuro(tot)}</div>
              <div class="flex gap-2 justify-end mt-1">
                ${g.imagenAdjunta ? `<button data-click="verImagenAdjuntaGasto" data-click-args='["${escapeHTML(g.id)}"]' aria-label="Ver foto adjunta" title="Ver foto adjunta" class="text-[10px] text-slate-500 font-bold">📎</button>` : ''}
                <button data-click="abrirFormGasto" data-click-args='["${escapeHTML(g.id)}"]' class="text-[10px] text-blue-600 font-bold hover:underline">Editar</button>
                <button data-click="eliminarGasto" data-click-args='["${escapeHTML(g.id)}"]' class="text-[10px] text-slate-400 hover:text-rose-600 font-bold hover:underline">Eliminar</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function abrirFormGasto(id = '') {
      ocultarTodasLasVistas();
      document.getElementById('view-gasto-form').classList.remove('hidden');
      poblarSelectProveedoresGasto();
      solicitudImagenGasto += 1;
      imagenGastoProcesando = false;
      imagenAdjuntaTemporal = null;
      document.getElementById('gasto-imagen-input').value = '';
      
      if (id) {
        const g = (ConstruFactu.Store.state.gastos || []).find(x => x.id === id);
        if (!g || g.deletedAt) {
          irA('gastos');
          return;
        }
        document.getElementById('gas-id').value = g.id;
        document.getElementById('gas-nif').value = g.nif || '';
        document.getElementById('gas-num').value = g.numFactura || '';
        document.getElementById('gas-fecha').value = g.fecha || new Date().toISOString().split('T')[0];
        document.getElementById('gas-categoria').value = g.categoria || 'Materiales de obra';
        document.getElementById('gas-concepto').value = g.concepto || '';
        document.getElementById('gas-observaciones').value = g.observaciones || '';
        document.getElementById('gas-base').value = g.base || '';
        document.getElementById('gas-iva').value = String(g.iva ?? 21);
        imagenAdjuntaTemporal = g.imagenAdjunta || null;
        poblarSelectProveedoresGasto(g.proveedor);
      } else {
        ['gas-id', 'gas-nif', 'gas-num', 'gas-concepto', 'gas-observaciones', 'gas-base'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('gas-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('gas-iva').value = '21';
        poblarSelectProveedoresGasto();
      }
      mostrarPreviewImagenGasto(imagenAdjuntaTemporal);
      recalcularGasto();
    }

    function esImagenBase64(valor) {
      return typeof valor === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(valor);
    }

    function mostrarPreviewImagenGasto(imagen) {
      const preview = document.getElementById('gasto-imagen-preview');
      preview.textContent = '';
      if (!imagen) return;
      if (!esImagenBase64(imagen)) {
        console.warn('[Gastos] La imagen adjunta no tiene un formato Base64 válido.');
        return;
      }

      const miniatura = document.createElement('img');
      miniatura.src = imagen;
      miniatura.alt = 'Vista previa de la factura o ticket';
      miniatura.style.maxHeight = '100px';
      miniatura.className = 'max-w-full rounded-lg border border-slate-200 object-contain';
      preview.appendChild(miniatura);

      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.textContent = 'Quitar imagen';
      quitar.setAttribute('data-click', 'quitarImagenGasto');
      quitar.className = 'ml-2 text-xs font-bold text-rose-700 hover:underline';
      preview.appendChild(quitar);
    }

    function comprimirImagen(file, maxWidth = 800, calidad = 0.6) {
      return new Promise((resolve, reject) => {
        if (!file) {
          reject(new Error('No se seleccionó ningún archivo.'));
          return;
        }
        if (file.type && !file.type.startsWith('image/')) {
          reject(new Error('El archivo seleccionado no es una imagen.'));
          return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen.'));
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('No se pudo leer la imagen.'));
            return;
          }

          const imagen = new Image();
          imagen.onerror = () => reject(new Error('No se pudo decodificar la imagen.'));
          imagen.onload = () => {
            const anchoOriginal = imagen.naturalWidth;
            const altoOriginal = imagen.naturalHeight;
            if (!anchoOriginal || !altoOriginal) {
              reject(new Error('La imagen no tiene dimensiones válidas.'));
              return;
            }

            const anchoSolicitado = Number(maxWidth);
            const anchoLimite = Number.isFinite(anchoSolicitado) && anchoSolicitado > 0 ? anchoSolicitado : 800;
            const escala = Math.min(1, anchoLimite / anchoOriginal, 1200 / altoOriginal);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(anchoOriginal * escala));
            canvas.height = Math.max(1, Math.round(altoOriginal * escala));
            const contexto = canvas.getContext('2d');
            if (!contexto) {
              reject(new Error('El navegador no pudo preparar la imagen para comprimirla.'));
              return;
            }

            try {
              // Los navegadores actuales aplican la orientación EXIF al decodificar Image.
              contexto.fillStyle = '#fff';
              contexto.fillRect(0, 0, canvas.width, canvas.height);
              contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
              const calidadSolicitada = Number(calidad);
              const calidadJPEG = Number.isFinite(calidadSolicitada)
                ? Math.max(0, Math.min(1, calidadSolicitada))
                : 0.6;
              const resultado = canvas.toDataURL('image/jpeg', calidadJPEG);
              if (!resultado.startsWith('data:image/jpeg;base64,')) {
                reject(new Error('No se pudo comprimir la imagen.'));
                return;
              }
              resolve(resultado);
            } catch (error) {
              reject(error);
            } finally {
              canvas.width = 0;
              canvas.height = 0;
            }
          };
          imagen.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    async function seleccionarImagenGasto(input) {
      const file = input && input.files && input.files[0];
      if (!file) return;

      const solicitud = ++solicitudImagenGasto;
      imagenGastoProcesando = true;
      try {
        const imagen = await comprimirImagen(file);
        if (solicitud !== solicitudImagenGasto) return;
        imagenAdjuntaTemporal = imagen;
        mostrarPreviewImagenGasto(imagenAdjuntaTemporal);
      } catch (error) {
        if (solicitud === solicitudImagenGasto) {
          input.value = '';
          console.error('[Gastos] No se pudo procesar la imagen adjunta:', error);
          avisar('No se pudo procesar la imagen. Prueba con otro archivo.', { tipo: 'error' });
        }
      } finally {
        if (solicitud === solicitudImagenGasto) imagenGastoProcesando = false;
      }
    }

    function quitarImagenGasto() {
      solicitudImagenGasto += 1;
      imagenGastoProcesando = false;
      imagenAdjuntaTemporal = null;
      document.getElementById('gasto-imagen-input').value = '';
      mostrarPreviewImagenGasto(null);
    }

    function recalcularGasto() {
      const base = Number(document.getElementById('gas-base').value) || 0;
      const iva = Number(document.getElementById('gas-iva').value) || 0;
      document.getElementById('gas-total-preview').textContent = fmtEuro(ConstruFactu.Money.gasto({ base, iva }).totalC / 100);
    }
    async function guardarGasto() {
      if (imagenGastoProcesando) {
        avisar('Espera a que termine el procesamiento de la imagen antes de guardar.');
        return;
      }
      const id = document.getElementById('gas-id').value;
      const proveedor = document.getElementById('gas-proveedor').value.trim();
      const base = ConstruFactu.Money.aCent(document.getElementById('gas-base').value) / 100;
      if (!proveedor || !(base > 0)) { avisar('Proveedor y base obligatorios.'); return; }

      const datosGasto = {
        id: id || 'g' + Date.now(),
        proveedor,
        nif: document.getElementById('gas-nif').value.trim().toUpperCase(),
        numFactura: document.getElementById('gas-num').value.trim(),
        fecha: document.getElementById('gas-fecha').value,
        categoria: document.getElementById('gas-categoria').value,
        concepto: document.getElementById('gas-concepto').value.trim(),
        observaciones: document.getElementById('gas-observaciones').value.trim(),
        base,
        iva: Number(document.getElementById('gas-iva').value),
        imagenAdjunta: imagenAdjuntaTemporal || null,
        updatedAt: Date.now(),
        deletedAt: null
      };
      if (id) {
        const existente = ConstruFactu.Store.state.gastos.find(g => g.id === id);
        if (existente && existente.deletedAt) {
          avisar('Este gasto ya está eliminado. No se puede editar.', { tipo: 'error' });
          return;
        }
        if (existente) datosGasto.deletedAt = existente.deletedAt || null;
      }

      if (!ConstruFactu.Store.state.gastos) ConstruFactu.Store.state.gastos = [];

      if (id) {
        const idx = ConstruFactu.Store.state.gastos.findIndex(g => g.id === id);
        if (idx !== -1) {
          ConstruFactu.Store.state.gastos[idx] = datosGasto;
        } else {
          ConstruFactu.Store.state.gastos.unshift(datosGasto);
        }
      } else {
        ConstruFactu.Store.state.gastos.unshift(datosGasto);
      }

      await ConstruFactu.Store.save();
      irA('gastos');
    }

    function verImagenAdjuntaGasto(id) {
      const gasto = (ConstruFactu.Store.state.gastos || []).find(item => item.id === id && !item.deletedAt);
      if (!gasto || !gasto.imagenAdjunta) return;
      if (!esImagenBase64(gasto.imagenAdjunta)) {
        console.warn('[Gastos] No se puede mostrar una imagen adjunta con formato no válido:', id);
        avisar('La imagen adjunta no tiene un formato válido.', { tipo: 'error' });
        return;
      }

      document.getElementById('gasto-imagen-modal-img').src = gasto.imagenAdjunta;
      document.getElementById('modal-imagen-gasto').classList.remove('hidden');
    }

    function cerrarModalImagenGasto() {
      document.getElementById('gasto-imagen-modal-img').removeAttribute('src');
      document.getElementById('modal-imagen-gasto').classList.add('hidden');
    }

    async function eliminarGasto(id) {
      if ((await confirmar('¿Eliminar gasto?', { aceptar: 'Eliminar', peligro: true }))) {
        const gasto = (ConstruFactu.Store.state.gastos || []).find(g => g.id === id);
        if (!gasto || gasto.deletedAt) return;
        const deletedAtAnterior = gasto.deletedAt;
        const updatedAtAnterior = gasto.updatedAt;
        const timestamp = Date.now();
        gasto.deletedAt = timestamp;
        gasto.updatedAt = timestamp;
        if (!(await ConstruFactu.Store.save())) {
          if (deletedAtAnterior === undefined) delete gasto.deletedAt;
          else gasto.deletedAt = deletedAtAnterior;
          if (updatedAtAnterior === undefined) delete gasto.updatedAt;
          else gasto.updatedAt = updatedAtAnterior;
          avisar('No se pudo guardar el borrado del gasto.', { tipo: 'error' });
          return;
        }
        renderGastos();
      }
    }
function poblarSelectProveedoresGasto(seleccionarNombre = '') {
      const sel = document.getElementById('gas-proveedor-select');
      if (!sel) return;
      const provs = ConstruFactu.Store.state.proveedores || [];
      sel.innerHTML = `<option value="">-- Selecciona Proveedor --` + provs.map(p => `<option value="${escapeHTML(p.nombre)}">${escapeHTML(p.nombre)} (${escapeHTML(p.nif || 'Sin NIF')})</option>`).join('');
      if (seleccionarNombre) {
        sel.value = seleccionarNombre;
        document.getElementById('gas-proveedor').value = seleccionarNombre;
      } else if (provs.length > 0) {
        sel.value = provs[0].nombre;
        document.getElementById('gas-proveedor').value = provs[0].nombre;
      }
    }

    function cambiarSelectorProveedorGasto(val) {
      document.getElementById('gas-proveedor').value = val;
    }

    function abrirModalNuevoProveedorGasto() {
      ['mprov-nombre', 'mprov-nif', 'mprov-tel'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('modal-nuevo-proveedor').classList.remove('hidden');
    }

    function cerrarModalNuevoProveedorGasto() {
      document.getElementById('modal-nuevo-proveedor').classList.add('hidden');
    }

    async function guardarProveedorGastoDesdeModal() {
      const nombre = document.getElementById('mprov-nombre').value.trim();
      const nif = document.getElementById('mprov-nif').value.trim().toUpperCase();
      const telefono = document.getElementById('mprov-tel').value.trim();
      if (!nombre) { avisar('El nombre del proveedor es obligatorio.'); return; }
      
      if (!ConstruFactu.Store.state.proveedores) ConstruFactu.Store.state.proveedores = [];
      const nuevoProv = { id: 'prov' + Date.now(), nombre, nif, telefono };
      ConstruFactu.Store.state.proveedores.unshift(nuevoProv);
      await ConstruFactu.Store.save();
      cerrarModalNuevoProveedorGasto();
      poblarSelectProveedoresGasto(nombre);
    }
  CF.renderGastos = function() { return renderGastos.apply(this, arguments); };
  window.renderGastos = CF.renderGastos;
  CF.abrirFormGasto = function() { return abrirFormGasto.apply(this, arguments); };
  window.abrirFormGasto = CF.abrirFormGasto;
  CF.seleccionarImagenGasto = function() { return seleccionarImagenGasto.apply(this, arguments); };
  window.seleccionarImagenGasto = CF.seleccionarImagenGasto;
  CF.quitarImagenGasto = function() { return quitarImagenGasto.apply(this, arguments); };
  window.quitarImagenGasto = CF.quitarImagenGasto;
  CF.recalcularGasto = function() { return recalcularGasto.apply(this, arguments); };
  window.recalcularGasto = CF.recalcularGasto;
  CF.guardarGasto = function() { return guardarGasto.apply(this, arguments); };
  window.guardarGasto = CF.guardarGasto;
  CF.eliminarGasto = function() { return eliminarGasto.apply(this, arguments); };
  window.eliminarGasto = CF.eliminarGasto;
  CF.verImagenAdjuntaGasto = function() { return verImagenAdjuntaGasto.apply(this, arguments); };
  window.verImagenAdjuntaGasto = CF.verImagenAdjuntaGasto;
  CF.cerrarModalImagenGasto = function() { return cerrarModalImagenGasto.apply(this, arguments); };
  window.cerrarModalImagenGasto = CF.cerrarModalImagenGasto;
  CF.poblarSelectProveedoresGasto = function() { return poblarSelectProveedoresGasto.apply(this, arguments); };
  window.poblarSelectProveedoresGasto = CF.poblarSelectProveedoresGasto;
  CF.cambiarSelectorProveedorGasto = function() { return cambiarSelectorProveedorGasto.apply(this, arguments); };
  window.cambiarSelectorProveedorGasto = CF.cambiarSelectorProveedorGasto;
  CF.abrirModalNuevoProveedorGasto = function() { return abrirModalNuevoProveedorGasto.apply(this, arguments); };
  window.abrirModalNuevoProveedorGasto = CF.abrirModalNuevoProveedorGasto;
  CF.cerrarModalNuevoProveedorGasto = function() { return cerrarModalNuevoProveedorGasto.apply(this, arguments); };
  window.cerrarModalNuevoProveedorGasto = CF.cerrarModalNuevoProveedorGasto;
  CF.guardarProveedorGastoDesdeModal = function() { return guardarProveedorGastoDesdeModal.apply(this, arguments); };
  window.guardarProveedorGastoDesdeModal = CF.guardarProveedorGastoDesdeModal;
})(window.ConstruFactu);
