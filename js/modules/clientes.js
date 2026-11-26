(function(CF) {
  CF.Clientes = {
        obtenerTodos() { return (ConstruFactu.Store.state.clientes || []).filter(c => !c.deletedAt); },
        buscar(q) {
          q = (q || '').toLowerCase();
          return this.obtenerTodos().filter(c => c.nombre.toLowerCase().includes(q) || c.nif.toLowerCase().includes(q));
        },
        async guardar(datos) {
          const cs = ConstruFactu.Store.state.clientes;
          const idx = cs.findIndex(c => c.id === datos.id);
          const existente = idx !== -1 ? cs[idx] : null;
          const cliente = {
            ...datos,
            updatedAt: Date.now(),
            deletedAt: existente && existente.deletedAt ? existente.deletedAt : null
          };
          if (idx !== -1) {
            cs[idx] = cliente;
          } else {
            cs.unshift(cliente);
          }
          return await ConstruFactu.Store.save();
        },
        async eliminar(id) {
          const cliente = (ConstruFactu.Store.state.clientes || []).find(c => c.id === id);
          if (!cliente || cliente.deletedAt) return false;
          const deletedAtAnterior = cliente.deletedAt;
          const updatedAtAnterior = cliente.updatedAt;
          const timestamp = Date.now();
          cliente.deletedAt = timestamp;
          cliente.updatedAt = timestamp;
          if (!(await ConstruFactu.Store.save())) {
            if (deletedAtAnterior === undefined) delete cliente.deletedAt;
            else cliente.deletedAt = deletedAtAnterior;
            if (updatedAtAnterior === undefined) delete cliente.updatedAt;
            else cliente.updatedAt = updatedAtAnterior;
            return false;
          }
          return true;
        },
        exportarCSV() {
          const filas = [['Nombre', 'NIF', 'Direccion', 'CP', 'Poblacion', 'Telefono', 'Movil', 'Email', 'Observaciones']];
          this.obtenerTodos().forEach(c => {
            filas.push([c.nombre, c.nif, c.direccion || '', c.cp || '', c.poblacion || '', c.telefono || '', c.movil || '', c.email || '', c.observaciones || '']);
          });
          const csv = filas.map(r => r.map(col => `"${(col || '').toString().replace(/"/g, '""')}"`).join(';')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
        }
      };
function validarYBuscarCP(val) {
      const limpio = val.replace(/\D/g, '').substring(0, 5);
      document.getElementById('cli-cp').value = limpio;
    }

    function validarYBuscarCPModal(val) {
      const limpio = val.replace(/\D/g, '').substring(0, 5);
      document.getElementById('mcli-cp').value = limpio;
    }

    function soloNumeros(input) {
      input.value = input.value.replace(/\D/g, '');
    }
function getCliente(id) {
      return ConstruFactu.Store.state.clientes.find(c => c.id === id) || { nombre: 'Cliente', nif: '-', direccion: '', cp: '', poblacion: '', telefono: '', movil: '', email: '', observaciones: '' };
    }
// CLIENTES

	function renderClientes() {
      const q = (document.getElementById('buscar-cliente').value || '').toLowerCase();
      const cont = document.getElementById('lista-clientes');
      const filtrados = ConstruFactu.Clientes.buscar(q);
      cont.innerHTML = filtrados.map(c => `
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="font-extrabold text-slate-900 text-base whitespace-pre-line">${escapeHTML(c.nombre)}</h3>
              <p class="text-xs text-slate-600">NIF: <strong>${escapeHTML(c.nif)}</strong></p>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHTML(c.poblacion)} (${escapeHTML(c.cp || '')})</p>
              ${c.observaciones ? `<div class="mt-2 p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900">📝 <strong>Notas:</strong> ${escapeHTML(c.observaciones)}</div>` : ''}
            </div>
            <button data-click="abrirFormCliente" data-click-args='["${escapeHTML(c.id)}"]' class="p-2 rounded-xl bg-slate-100 text-slate-700 text-sm">✏️</button>
          </div>
          <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
            <button data-click="crearDocParaCliente" data-click-args='["${escapeHTML(c.id)}","presupuesto"]' class="py-2 rounded-xl bg-blue-50 text-blue-800 font-extrabold text-[11px]">PRESUPUESTO</button>
            <button data-click="crearDocParaCliente" data-click-args='["${escapeHTML(c.id)}","albaran"]' class="py-2 rounded-xl bg-amber-50 text-amber-800 font-extrabold text-[11px]">ALBARÁN</button>
            <button data-click="crearDocParaCliente" data-click-args='["${escapeHTML(c.id)}","factura"]' class="py-2 rounded-xl bg-slate-900 text-white font-extrabold text-[11px]">FACTURA</button>
          </div>
        </div>
      `).join('');
    }

    function abrirFormCliente(id = '') {
      ocultarTodasLasVistas();
      document.getElementById('view-cliente-form').classList.remove('hidden');
      if (id) {
        const c = ConstruFactu.Store.state.clientes.find(x => x.id === id);
        if (!c || c.deletedAt) {
          irA('clientes');
          return;
        }
        document.getElementById('titulo-form-cliente').textContent = 'EDITAR CLIENTE';
        document.getElementById('cli-id').value = c.id;
        document.getElementById('cli-nombre').value = c.nombre;
        document.getElementById('cli-nif').value = c.nif;
        document.getElementById('cli-direccion').value = c.direccion || '';
        document.getElementById('cli-cp').value = c.cp || '';
        document.getElementById('cli-poblacion').value = c.poblacion || '';
        document.getElementById('cli-telefono').value = c.telefono || '';
        document.getElementById('cli-movil').value = c.movil || '';
        document.getElementById('cli-email').value = c.email || '';
        document.getElementById('cli-observaciones').value = c.observaciones || '';
        document.getElementById('btn-eliminar-cliente').classList.remove('hidden');
      } else {
        document.getElementById('titulo-form-cliente').textContent = 'NUEVO CLIENTE';
        ['cli-id', 'cli-nombre', 'cli-nif', 'cli-direccion', 'cli-cp', 'cli-poblacion', 'cli-telefono', 'cli-movil', 'cli-email', 'cli-observaciones'].forEach(f => document.getElementById(f).value = '');
        document.getElementById('btn-eliminar-cliente').classList.add('hidden');
      }
    }

    async function guardarCliente() {
      const id = document.getElementById('cli-id').value;
      const nombre = document.getElementById('cli-nombre').value.trim();
      const nif = document.getElementById('cli-nif').value.trim().toUpperCase();
      const cp = document.getElementById('cli-cp').value.trim();
      const poblacion = document.getElementById('cli-poblacion').value.trim();
      
      if (!nombre || !nif) { avisar('El nombre y el NIF son obligatorios.'); return; }
      if (cp && cp.length !== 5) { avisar('El código postal de España debe tener exactamente 5 cifras.'); return; }

      const datos = {
        id: id || 'c' + Date.now(),
        nombre,
        nif,
        direccion: document.getElementById('cli-direccion').value.trim(),
        cp,
        poblacion,
        telefono: document.getElementById('cli-telefono').value.trim(),
        movil: document.getElementById('cli-movil').value.trim(),
        email: document.getElementById('cli-email').value.trim(),
        observaciones: document.getElementById('cli-observaciones').value.trim()
      };

      await ConstruFactu.Clientes.guardar(datos);
      irA('clientes');
    }

    async function eliminarCliente() {
      const id = document.getElementById('cli-id').value;
      if ((await confirmar('¿Eliminar este cliente?', { aceptar: 'Eliminar', peligro: true }))) {
        if (!(await ConstruFactu.Clientes.eliminar(id))) {
          avisar('No se pudo guardar el borrado del cliente.', { tipo: 'error' });
          return;
        }
        irA('clientes');
      }
    }

    function crearDocParaCliente(clienteId, tipo) {
      vistaAnteriorEditor = tipo === 'presupuesto' ? 'presupuestos' : (tipo === 'albaran' ? 'albaranes' : 'facturas');
      abrirEditorDocumento(null, tipo, clienteId);
    }

    function exportarClientesCSV() { ConstruFactu.Clientes.exportarCSV(); }
    function abrirModalImportarClientes() {
      document.getElementById('file-import-clientes').value = '';
      document.getElementById('txt-file-name-cli-info').textContent = 'Ningún archivo seleccionado';
      document.getElementById('modal-importar-clientes').classList.remove('hidden');
    }
    function cerrarModalImportarClientes() { document.getElementById('modal-importar-clientes').classList.add('hidden'); }
    function actualizarNombreArchivoClientesImportado(input) {
      const txt = document.getElementById('txt-file-name-cli-info');
      txt.textContent = input.files && input.files[0] ? input.files[0].name : 'Ningún archivo seleccionado';
    }
    async function descargarPlantillaClientesXLSX() {
      try { await cargarXLSX(); } catch (e) { avisar(e.message); return; }
      const ws_data = [
        ["Nombre", "NIF", "Direccion", "CP", "Poblacion", "Telefono", "Movil", "Email", "Observaciones"],
        ["Promociones Aljarafe S.L.", "B91234567", "Avda. de Europa 44", "41927", "Mairena del Aljarafe (Sevilla)", "954000000", "654321987", "obras@aljarafe.es", "Forma de pago transferencia 30 días"]
      ];
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clientes");
      XLSX.writeFile(wb, "plantilla_clientes_ejemplo.xlsx");
    }

    async function ejecutarImportacionClientes() {
      const input = document.getElementById('file-import-clientes');
      if (!input.files || !input.files[0]) { avisar('Selecciona un archivo Excel (.xlsx, .xls) o CSV.'); return; }
      const file = input.files[0];
      const strategy = document.getElementById('import-cli-duplicados-strategy').value;
      const reader = new FileReader();

      reader.onload = async function(e) {
        try {
          await cargarXLSX();
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (!jsonRows || jsonRows.length < 2) { avisar('Archivo sin filas válidas.'); return; }

          const header = jsonRows[0].map(h => (h || '').toString().trim().toLowerCase());
          const idxNom = header.findIndex(h => h.includes('nombre') || h.includes('razon'));
          const idxNif = header.findIndex(h => h.includes('nif') || h.includes('cif'));
          const idxDir = header.findIndex(h => h.includes('dir') || h.includes('calle'));
          const idxCp = header.findIndex(h => h.includes('cp') || h.includes('postal'));
          const idxPob = header.findIndex(h => h.includes('pob') || h.includes('ciudad'));
          const idxTel = header.findIndex(h => h.includes('tel') || h.includes('fijo'));
          const idxMov = header.findIndex(h => h.includes('mov') || h.includes('móvil'));
          const idxEmail = header.findIndex(h => h.includes('email') || h.includes('correo'));
          const idxObs = header.findIndex(h => h.includes('obs') || h.includes('nota') || h.includes('pago'));

          if (idxNom === -1 || idxNif === -1) { avisar('Faltan columnas obligatorias ("Nombre" y "NIF").'); return; }

          let nuevos = [];
          for (let i = 1; i < jsonRows.length; i++) {
            const row = jsonRows[i];
            if (!row || row.length === 0) continue;
            const nombre = row[idxNom] ? row[idxNom].toString().trim() : '';
            const nif = row[idxNif] ? row[idxNif].toString().trim().toUpperCase() : '';
            if (nombre && nif) {
              nuevos.push({
                nombre, nif,
                direccion: idxDir !== -1 && row[idxDir] ? row[idxDir].toString().trim() : '',
                cp: idxCp !== -1 && row[idxCp] ? row[idxCp].toString().trim() : '',
                poblacion: idxPob !== -1 && row[idxPob] ? row[idxPob].toString().trim() : '',
                telefono: idxTel !== -1 && row[idxTel] ? row[idxTel].toString().trim() : '',
                movil: idxMov !== -1 && row[idxMov] ? row[idxMov].toString().trim() : '',
                email: idxEmail !== -1 && row[idxEmail] ? row[idxEmail].toString().trim() : '',
                observaciones: idxObs !== -1 && row[idxObs] ? row[idxObs].toString().trim() : ''
              });
            }
          }

          let added = 0, updated = 0, skipped = 0;
          for (let nc of nuevos) {
            const existingIdx = ConstruFactu.Store.state.clientes.findIndex(c => !c.deletedAt && c.nif.toLowerCase() === nc.nif.toLowerCase());
            if (existingIdx !== -1) {
              if (strategy === 'actualizar') {
                Object.assign(ConstruFactu.Store.state.clientes[existingIdx], nc, { updatedAt: Date.now() });
                updated++;
              } else if (strategy === 'omitir') {
                skipped++;
              } else {
                ConstruFactu.Store.state.clientes.unshift({
                  id: 'c' + Date.now() + Math.random().toString(36).substring(2, 6),
                  ...nc, updatedAt: Date.now(), deletedAt: null
                });
                added++;
              }
            } else {
              ConstruFactu.Store.state.clientes.unshift({
                id: 'c' + Date.now() + Math.random().toString(36).substring(2, 6),
                ...nc, updatedAt: Date.now(), deletedAt: null
              });
              added++;
            }
          }
          await ConstruFactu.Store.save();
          cerrarModalImportarClientes();
          renderClientes();
          avisar(`Importación completada:
- Nuevos: ${added}
- Actualizados: ${updated}
- Omitidos: ${skipped}`);
        } catch (err) { avisar('Error al procesar archivo.'); }
      };
      reader.readAsArrayBuffer(file);
    }

    function abrirModalNuevoCliente() {
      ['mcli-nombre', 'mcli-nif', 'mcli-direccion', 'mcli-cp', 'mcli-poblacion', 'mcli-telefono', 'mcli-movil', 'mcli-email', 'mcli-observaciones'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      document.getElementById('modal-nuevo-cliente').classList.remove('hidden');
    }
    function cerrarModalNuevoCliente() { document.getElementById('modal-nuevo-cliente').classList.add('hidden'); }
    async function guardarClienteDesdeModal() {
      const leerCampo = id => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };
      const nombre = leerCampo('mcli-nombre');
      const nif = leerCampo('mcli-nif').toUpperCase();
      const cp = leerCampo('mcli-cp');
      if (!nombre || !nif) { avisar('Nombre y NIF obligatorios.'); return; }
      const nuevoId = 'c' + Date.now();
      const nuevoCli = {
        id: nuevoId, nombre, nif,
        direccion: leerCampo('mcli-direccion'),
        cp,
        poblacion: leerCampo('mcli-poblacion'),
        telefono: leerCampo('mcli-telefono'),
        movil: leerCampo('mcli-movil'),
        email: leerCampo('mcli-email'),
        observaciones: leerCampo('mcli-observaciones')
      };
      await ConstruFactu.Clientes.guardar(nuevoCli);
      poblarSelectClientes(nuevoId);
      cerrarModalNuevoCliente();
    }

function poblarSelectClientes(seleccionarId = '') {
      const selCli = document.getElementById('doc-cliente');
      selCli.innerHTML = ConstruFactu.Clientes.obtenerTodos().map(c => `<option value="${c.id}">${escapeHTML(c.nombre.split('\n').join(' '))} (${escapeHTML(c.nif)})</option>`).join('');
      if (seleccionarId) selCli.value = seleccionarId;
    }
  CF.validarYBuscarCP = function() { return validarYBuscarCP.apply(this, arguments); };
  window.validarYBuscarCP = CF.validarYBuscarCP;
  CF.validarYBuscarCPModal = function() { return validarYBuscarCPModal.apply(this, arguments); };
  window.validarYBuscarCPModal = CF.validarYBuscarCPModal;
  CF.soloNumeros = function() { return soloNumeros.apply(this, arguments); };
  window.soloNumeros = CF.soloNumeros;
  CF.getCliente = function() { return getCliente.apply(this, arguments); };
  window.getCliente = CF.getCliente;
  CF.renderClientes = function() { return renderClientes.apply(this, arguments); };
  window.renderClientes = CF.renderClientes;
  CF.abrirFormCliente = function() { return abrirFormCliente.apply(this, arguments); };
  window.abrirFormCliente = CF.abrirFormCliente;
  CF.guardarCliente = function() { return guardarCliente.apply(this, arguments); };
  window.guardarCliente = CF.guardarCliente;
  CF.eliminarCliente = function() { return eliminarCliente.apply(this, arguments); };
  window.eliminarCliente = CF.eliminarCliente;
  CF.crearDocParaCliente = function() { return crearDocParaCliente.apply(this, arguments); };
  window.crearDocParaCliente = CF.crearDocParaCliente;
  CF.exportarClientesCSV = function() { return exportarClientesCSV.apply(this, arguments); };
  window.exportarClientesCSV = CF.exportarClientesCSV;
  CF.abrirModalImportarClientes = function() { return abrirModalImportarClientes.apply(this, arguments); };
  window.abrirModalImportarClientes = CF.abrirModalImportarClientes;
  CF.cerrarModalImportarClientes = function() { return cerrarModalImportarClientes.apply(this, arguments); };
  window.cerrarModalImportarClientes = CF.cerrarModalImportarClientes;
  CF.actualizarNombreArchivoClientesImportado = function() { return actualizarNombreArchivoClientesImportado.apply(this, arguments); };
  window.actualizarNombreArchivoClientesImportado = CF.actualizarNombreArchivoClientesImportado;
  CF.descargarPlantillaClientesXLSX = function() { return descargarPlantillaClientesXLSX.apply(this, arguments); };
  window.descargarPlantillaClientesXLSX = CF.descargarPlantillaClientesXLSX;
  CF.ejecutarImportacionClientes = function() { return ejecutarImportacionClientes.apply(this, arguments); };
  window.ejecutarImportacionClientes = CF.ejecutarImportacionClientes;
  CF.abrirModalNuevoCliente = function() { return abrirModalNuevoCliente.apply(this, arguments); };
  window.abrirModalNuevoCliente = CF.abrirModalNuevoCliente;
  CF.cerrarModalNuevoCliente = function() { return cerrarModalNuevoCliente.apply(this, arguments); };
  window.cerrarModalNuevoCliente = CF.cerrarModalNuevoCliente;
  CF.guardarClienteDesdeModal = function() { return guardarClienteDesdeModal.apply(this, arguments); };
  window.guardarClienteDesdeModal = CF.guardarClienteDesdeModal;
  CF.poblarSelectClientes = function() { return poblarSelectClientes.apply(this, arguments); };
  window.poblarSelectClientes = CF.poblarSelectClientes;
})(window.ConstruFactu);
