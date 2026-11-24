(function(CF) {
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
        poblarSelectProveedoresGasto(g.proveedor);
      } else {
        ['gas-id', 'gas-nif', 'gas-num', 'gas-concepto', 'gas-observaciones', 'gas-base'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('gas-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('gas-iva').value = '21';
        poblarSelectProveedoresGasto();
      }
      recalcularGasto();
    }
    function recalcularGasto() {
      const base = Number(document.getElementById('gas-base').value) || 0;
      const iva = Number(document.getElementById('gas-iva').value) || 0;
      document.getElementById('gas-total-preview').textContent = fmtEuro(ConstruFactu.Money.gasto({ base, iva }).totalC / 100);
    }
    async function guardarGasto() {
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
  CF.recalcularGasto = function() { return recalcularGasto.apply(this, arguments); };
  window.recalcularGasto = CF.recalcularGasto;
  CF.guardarGasto = function() { return guardarGasto.apply(this, arguments); };
  window.guardarGasto = CF.guardarGasto;
  CF.eliminarGasto = function() { return eliminarGasto.apply(this, arguments); };
  window.eliminarGasto = CF.eliminarGasto;
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
