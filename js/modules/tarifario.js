(function(CF) {
  CF.Tarifario = {
        obtenerTodos() { return ConstruFactu.Store.state.catalogoPrecios || []; },
        buscar(q, cap) {
          q = (q || '').toLowerCase();
          return this.obtenerTodos().filter(p => {
            const matchQ = p.capitulo.toLowerCase().includes(q) || p.concepto.toLowerCase().includes(q);
            const matchCap = !cap || p.capitulo === cap;
            return matchQ && matchCap;
          });
        },
        async guardar(datos) {
          const tp = ConstruFactu.Store.state.catalogoPrecios;
          const idx = tp.findIndex(x => x.id === datos.id);
          if (idx !== -1) {
            tp[idx] = { ...datos, updatedAt: Date.now() };
          } else {
            tp.unshift({ ...datos, updatedAt: Date.now() });
          }
          await ConstruFactu.Store.save();
        },
        async eliminar(id) {
          ConstruFactu.Store.state.catalogoPrecios = ConstruFactu.Store.state.catalogoPrecios.filter(p => p.id !== id);
          await ConstruFactu.Store.save();
        },
        exportarCSV() {
          const filas = [['Capitulo', 'Concepto', 'Unidad', 'Precio']];
          this.obtenerTodos().forEach(p => {
            filas.push([p.capitulo, p.concepto, p.unidad, Number(p.precio).toFixed(2)]);
          });
          const csv = filas.map(r => r.map(c => `"${(c || '').toString().replace(/"/g, '""')}"`).join(';')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `tarifario_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
        }
      };
function seleccionarPartidaTarifario(idx, tarId) {
      if (!tarId) return;
      const part = ConstruFactu.Tarifario.obtenerTodos().find(p => p.id === tarId);
      if (!part) return;
      lineasEditorTemp[idx].concepto = part.concepto;
      lineasEditorTemp[idx].unidad = part.unidad;
      lineasEditorTemp[idx].precio = part.precio;
      renderLineasEditor();
      recalcularEditor();
    }
function renderTarifario() {
      const q = (document.getElementById('buscar-tarifario').value || '').toLowerCase();
      const filtroCap = document.getElementById('filtro-capitulo');
      const capSel = filtroCap ? filtroCap.value : '';

      const capitulosUnicos = Array.from(new Set(ConstruFactu.Tarifario.obtenerTodos().map(p => p.capitulo))).filter(Boolean).sort();
      if (filtroCap) {
        const valActual = filtroCap.value;
        filtroCap.innerHTML = `<option value="">Todos capítulos</option>` + capitulosUnicos.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
        filtroCap.value = valActual;
      }

      const cont = document.getElementById('lista-tarifario');
      const filtrados = ConstruFactu.Tarifario.buscar(q, capSel);
      if (!filtrados.length) { cont.innerHTML = `<div class="text-center text-xs text-slate-400 py-8">No hay partidas.</div>`; return; }

      cont.innerHTML = filtrados.map(p => `
        <div class="bg-white p-3.5 rounded-2xl border flex justify-between items-center shadow-sm">
          <div>
            <span class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">${escapeHTML(p.capitulo)}</span>
            <p class="font-bold text-xs mt-1 text-slate-900">${escapeHTML(p.concepto)}</p>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-sm text-slate-900">${fmtEuro(p.precio)} / ${escapeHTML(p.unidad)}</div>
            <div class="flex gap-2 justify-end mt-1">
              <button data-click="abrirFormPartidaTarifario" data-click-args='["${escapeHTML(p.id)}"]' class="text-[10px] text-blue-600 font-bold">Editar</button>
              <button data-click="eliminarPartidaTarifario" data-click-args='["${escapeHTML(p.id)}"]' class="text-[10px] text-rose-600 font-bold">Borrar</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    function exportarTarifarioCSV() { ConstruFactu.Tarifario.exportarCSV(); }
    function abrirModalImportarTarifario() {
      document.getElementById('file-import-tarifas').value = '';
      document.getElementById('txt-file-name-info').textContent = 'Ningún archivo seleccionado';
      document.getElementById('modal-importar-tarifario').classList.remove('hidden');
    }
    function cerrarModalImportarTarifario() { document.getElementById('modal-importar-tarifario').classList.add('hidden'); }
    function actualizarNombreArchivoImportado(input) {
      document.getElementById('txt-file-name-info').textContent = input.files && input.files[0] ? input.files[0].name : 'Ningún archivo seleccionado';
    }
    async function descargarPlantillaTarifarioXLSX() {
      try { await cargarXLSX(); } catch (e) { avisar(e.message); return; }
      const ws_data = [
        ["Capitulo", "Concepto", "Unidad", "Precio"],
        ["Albañilería", "Enfoscado maestreado mortero cemento", "m²", 18.50]
      ];
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tarifas");
      XLSX.writeFile(wb, "plantilla_tarifario_ejemplo.xlsx");
    }

    async function ejecutarImportacionTarifas() {
      const input = document.getElementById('file-import-tarifas');
      if (!input.files || !input.files[0]) { avisar('Selecciona archivo.'); return; }
      const file = input.files[0];
      const strategy = document.getElementById('import-duplicados-strategy').value;
      const reader = new FileReader();

      reader.onload = async function(e) {
        try {
          await cargarXLSX();
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (!jsonRows || jsonRows.length < 2) { avisar('Archivo sin filas.'); return; }

          const header = jsonRows[0].map(h => (h || '').toString().trim().toLowerCase());
          const idxCap = header.findIndex(h => h.includes('capitulo') || h.includes('capítulo'));
          const idxCon = header.findIndex(h => h.includes('concepto') || h.includes('descripcion'));
          const idxUni = header.findIndex(h => h.includes('unidad'));
          const idxPre = header.findIndex(h => h.includes('precio') || h.includes('importe'));

          if (idxCon === -1 || idxUni === -1 || idxPre === -1) { avisar('Faltan columnas obligatorias.'); return; }

          let added = 0, updated = 0, skipped = 0;
          for (let i = 1; i < jsonRows.length; i++) {
            const row = jsonRows[i];
            if (!row || row.length === 0) continue;
            const capitulo = idxCap !== -1 && row[idxCap] ? row[idxCap].toString().trim() : 'General';
            const concepto = row[idxCon] ? row[idxCon].toString().trim() : '';
            const unidad = row[idxUni] ? row[idxUni].toString().trim() : 'ud';
            let pr = row[idxPre];
            if (typeof pr === 'string') pr = pr.replace(',', '.').replace(/[^0-9.-]+/g, '');
            const precio = Number(pr) || 0;

            if (concepto) {
              const existingIdx = ConstruFactu.Store.state.catalogoPrecios.findIndex(p => p.concepto.toLowerCase() === concepto.toLowerCase());
              if (existingIdx !== -1) {
                if (strategy === 'actualizar') {
                  ConstruFactu.Store.state.catalogoPrecios[existingIdx] = { ...ConstruFactu.Store.state.catalogoPrecios[existingIdx], capitulo, unidad, precio, updatedAt: Date.now() };
                  updated++;
                } else if (strategy === 'omitir') {
                  skipped++;
                } else {
                  ConstruFactu.Store.state.catalogoPrecios.unshift({ id: 't' + Date.now() + Math.random().toString(36).substring(2, 6), capitulo, concepto, unidad, precio, updatedAt: Date.now() });
                  added++;
                }
              } else {
                ConstruFactu.Store.state.catalogoPrecios.unshift({ id: 't' + Date.now() + Math.random().toString(36).substring(2, 6), capitulo, concepto, unidad, precio });
                added++;
              }
            }
          }
          await ConstruFactu.Store.save();
          cerrarModalImportarTarifario();
          renderTarifario();
          avisar(`Importación completada:
- Añadidas: ${added}
- Actualizadas: ${updated}
- Omitidas: ${skipped}`);
        } catch (err) { avisar('Error al procesar archivo.'); }
      };
      reader.readAsArrayBuffer(file);
    }

    function abrirFormPartidaTarifario(id = '') {
      ocultarTodasLasVistas();
      document.getElementById('view-tarifario-form').classList.remove('hidden');
      if (id) {
        const p = ConstruFactu.Store.state.catalogoPrecios.find(x => x.id === id);
        document.getElementById('tar-id').value = p.id;
        document.getElementById('tar-capitulo').value = p.capitulo;
        document.getElementById('tar-concepto').value = p.concepto;
        document.getElementById('tar-unidad').value = p.unidad;
        document.getElementById('tar-precio').value = p.precio;
      } else {
        ['tar-id', 'tar-capitulo', 'tar-concepto', 'tar-precio'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('tar-unidad').value = 'm²';
      }
    }

    async function guardarPartidaTarifario() {
      const id = document.getElementById('tar-id').value;
      const capitulo = document.getElementById('tar-capitulo').value.trim();
      const concepto = document.getElementById('tar-concepto').value.trim();
      const precio = ConstruFactu.Money._esc(document.getElementById('tar-precio').value, 4) / 1e4;
      if (!capitulo || !concepto || isNaN(precio)) { avisar('Campos obligatorios.'); return; }
      await ConstruFactu.Tarifario.guardar({
        id: id || 't' + Date.now(), capitulo, concepto,
        unidad: document.getElementById('tar-unidad').value.trim() || 'ud',
        precio
      });
      irA('tarifario');
    }

    async function eliminarPartidaTarifario(id) {
      if ((await confirmar('¿Eliminar partida?', { aceptar: 'Eliminar', peligro: true }))) {
        await ConstruFactu.Tarifario.eliminar(id);
        renderTarifario();
      }
    }
  CF.seleccionarPartidaTarifario = function() { return seleccionarPartidaTarifario.apply(this, arguments); };
  window.seleccionarPartidaTarifario = CF.seleccionarPartidaTarifario;
  CF.renderTarifario = function() { return renderTarifario.apply(this, arguments); };
  window.renderTarifario = CF.renderTarifario;
  CF.exportarTarifarioCSV = function() { return exportarTarifarioCSV.apply(this, arguments); };
  window.exportarTarifarioCSV = CF.exportarTarifarioCSV;
  CF.abrirModalImportarTarifario = function() { return abrirModalImportarTarifario.apply(this, arguments); };
  window.abrirModalImportarTarifario = CF.abrirModalImportarTarifario;
  CF.cerrarModalImportarTarifario = function() { return cerrarModalImportarTarifario.apply(this, arguments); };
  window.cerrarModalImportarTarifario = CF.cerrarModalImportarTarifario;
  CF.actualizarNombreArchivoImportado = function() { return actualizarNombreArchivoImportado.apply(this, arguments); };
  window.actualizarNombreArchivoImportado = CF.actualizarNombreArchivoImportado;
  CF.descargarPlantillaTarifarioXLSX = function() { return descargarPlantillaTarifarioXLSX.apply(this, arguments); };
  window.descargarPlantillaTarifarioXLSX = CF.descargarPlantillaTarifarioXLSX;
  CF.ejecutarImportacionTarifas = function() { return ejecutarImportacionTarifas.apply(this, arguments); };
  window.ejecutarImportacionTarifas = CF.ejecutarImportacionTarifas;
  CF.abrirFormPartidaTarifario = function() { return abrirFormPartidaTarifario.apply(this, arguments); };
  window.abrirFormPartidaTarifario = CF.abrirFormPartidaTarifario;
  CF.guardarPartidaTarifario = function() { return guardarPartidaTarifario.apply(this, arguments); };
  window.guardarPartidaTarifario = CF.guardarPartidaTarifario;
  CF.eliminarPartidaTarifario = function() { return eliminarPartidaTarifario.apply(this, arguments); };
  window.eliminarPartidaTarifario = CF.eliminarPartidaTarifario;
})(window.ConstruFactu);
