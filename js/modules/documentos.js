(function(CF) {
  let lineasEditorTemp = [];

  CF.Documentos = {
        obtenerTodos() {
          return (ConstruFactu.Store.state.documentos || []).filter(d => !d.deletedAt);
        },
        filtrar(tipo) {
          const docs = this.obtenerTodos();
          if (tipo === 'presupuesto' || tipo === 'presupuestos') return docs.filter(d => d.tipo === 'presupuesto');
          if (tipo === 'albaran' || tipo === 'albaranes') return docs.filter(d => d.tipo === 'albaran');
          return docs.filter(d => d.tipo === 'factura' || d.tipo === 'rectificativa');
        },
        calcularTotales(doc) {
          if (doc.estado === 'Oficial') {
            const r = (ConstruFactu.Store.state.verifactuLog || []).find(x => x.docId === doc.id);
            if (r && r.formato === 1) {                       // emitida con la fórmula antigua: importes congelados
              const cuotaC = ConstruFactu.Money.aCent(r.cuota), totalC = ConstruFactu.Money.aCent(r.total);
              return { baseC: totalC - cuotaC, cuotaC, totalC, lineasC: ConstruFactu.Money.totales(doc).lineasC,
                       base: (totalC - cuotaC) / 100, cuota: cuotaC / 100, total: totalC / 100 };
            }
          }
          return ConstruFactu.Money.totales(doc);
        },
        siguienteBorrador(tipo) {
          const nums = this.obtenerTodos().filter(d => d.tipo === tipo && d.estado !== 'Oficial')
            .map(d => parseInt((String(d.numero).match(/(\d+)$/) || [0, 0])[1], 10) || 0);
          return Math.max(0, ...nums) + 1;
        },
        async guardar(docObj) {
          const docs = ConstruFactu.Store.state.documentos;
          const idx = docs.findIndex(d => d.id === docObj.id);
          if (idx !== -1 && docs[idx].deletedAt) return false;
          if (idx !== -1 && docs[idx].estado === 'Oficial' && docs[idx] !== docObj) {
            mostrarAviso('Las facturas oficiales son inmutables. Para corregirla emite una rectificativa.', 'error');
            return false;
          }
          docObj.updatedAt = Date.now();
          if (idx === -1) {
            docObj.deletedAt = null;
          }
          if (idx !== -1) {
            docs[idx] = docObj;
          } else {
            docs.unshift(docObj);
          }
          const catalogoPrecios = ConstruFactu.Store.state.catalogoPrecios;
          (docObj.lineas || []).forEach(linea => {
            const concepto = String(linea.concepto || '').trim();
            if (!concepto) return;

            const conceptoNormalizado = concepto.toLowerCase();
            const partida = catalogoPrecios.find(p =>
              !p.deletedAt && String(p.concepto || '').trim().toLowerCase() === conceptoNormalizado
            );
            if (!partida) {
              let id;
              do {
                id = 't' + Date.now() + Math.random().toString(36).substring(2, 8);
              } while (catalogoPrecios.some(p => p.id === id));
              catalogoPrecios.push({
                id,
                capitulo: 'General',
                concepto,
                precio: Number(linea.precio) || 0,
                unidad: linea.unidad || 'ud',
                updatedAt: Date.now(),
                deletedAt: null
              });
            } else if (Number(partida.precio) !== Number(linea.precio)) {
              partida.precio = Number(linea.precio) || 0;
              partida.updatedAt = Date.now();
            }
          });
          return await window.ConstruFactu.Store.save();
        },
        async eliminar(id) {
          const docs = ConstruFactu.Store.state.documentos;
          const doc = docs.find(d => d.id === id);
          if (!doc || doc.deletedAt) return false;
          const deletedAtAnterior = doc.deletedAt;
          const updatedAtAnterior = doc.updatedAt;
          const timestamp = Date.now();
          doc.deletedAt = timestamp;
          doc.updatedAt = timestamp;
          if (!(await ConstruFactu.Store.save())) {
            if (deletedAtAnterior === undefined) delete doc.deletedAt;
            else doc.deletedAt = deletedAtAnterior;
            if (updatedAtAnterior === undefined) delete doc.updatedAt;
            else doc.updatedAt = updatedAtAnterior;
            return false;
          }
          return true;
        }
      };
  let albaranesSeleccionados = new Set();
      let conversionProformaEnCurso = false;
  let filtroListadoActual = 'presupuestos';
function abrirListadoDocs(seccion) {
      filtroListadoActual = seccion;
      albaranesSeleccionados.clear();
      const titulos = { presupuestos: 'PRESUPUESTOS', albaranes: 'ALBARANES', facturas: 'FACTURAS Y RECTIFICATIVAS' };
      document.getElementById('docs-titulo').textContent = titulos[seccion];
      renderListadoDocs();
    }

    function renderListadoDocs() {
      const docs = ConstruFactu.Documentos.filtrar(filtroListadoActual);
      const cont = document.getElementById('lista-docs');
      if (!docs.length) { cont.innerHTML = `<div class="text-center text-xs text-slate-400 py-8">No hay documentos.</div>`; return; }

      cont.innerHTML = docs.map(d => {
        const cli = getCliente(d.clienteId);
        const tot = calcTotalesDoc(d);
        const esRect = d.tipo === 'rectificativa';
        const esOficial = (d.tipo === 'factura' || esRect) && d.estado === 'Oficial';
        let botonRectificar = (esOficial && d.tipo === 'factura') ? `<button data-click="iniciarRectificativa" data-click-args='["${escapeHTML(d.id)}"]' class="py-2 px-3 rounded-xl bg-indigo-50 text-indigo-800 border font-extrabold text-xs">🔄 RECTIFICAR</button>` : '';

        return `
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex items-start justify-between mb-2">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-extrabold text-slate-900 text-sm">${escapeHTML(d.numero)}</span>
                  <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700">${esRect ? 'RECTIFICATIVA' : escapeHTML(d.estado)}</span>
                </div>
                <p class="text-xs font-bold text-slate-700 mt-0.5 whitespace-pre-line">${escapeHTML(cli.nombre)}</p>
                ${d.obra ? `<p class="text-xs text-indigo-700 font-semibold mt-0.5">Obra: ${escapeHTML(d.obra)}</p>` : ''}
                <p class="text-[11px] text-slate-400">Fecha: ${escapeHTML(d.fecha)}</p>
              </div>
              <div class="text-right"><div class="text-base font-extrabold text-slate-900">${fmtEuro(tot.total)}</div></div>
            </div>
            <div class="flex gap-2 pt-2 border-t border-slate-100 items-center">
              <button data-click="verPDFDocumento" data-click-args='["${escapeHTML(d.id)}"]' class="flex-1 py-2 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs">📄 PDF A4</button>
              ${!esOficial ? `<button data-click="editarDocumentoExistente" data-click-args='["${escapeHTML(d.id)}"]' class="flex-1 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs">ABRIR</button>` : ''}
              ${botonRectificar}
              ${!esOficial ? `<button data-click="eliminarDocumento" data-click-args='["${escapeHTML(d.id)}"]' class="py-2 px-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs" title="Eliminar">🗑️</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    async function iniciarRectificativa(originalId) {
      const orig = ConstruFactu.Store.state.documentos.find(d => d.id === originalId);
      if (!orig || orig.deletedAt) return;
      const numRects = ConstruFactu.Documentos.siguienteBorrador('rectificativa');
      const serieRect = ConstruFactu.Store.state.empresa.serieRectificativa || 'R2026';
      const rectDoc = {
        id: 'd' + Date.now(), tipo: 'rectificativa',
        numero: `BORRADOR-${serieRect}-${String(numRects).padStart(3, '0')}`,
        clienteId: orig.clienteId, obra: orig.obra || '', fecha: new Date().toISOString().split('T')[0],
        iva: orig.iva, estado: 'Proforma', facturaRectificadaNum: orig.numero, motivoRectificacion: 'Devolución / Corrección',
        observaciones: `Rectificación de ${orig.numero}`,
        lineas: orig.lineas.map(l => ({ ...l, cantidad: -Math.abs(Number(l.cantidad) || 1) }))
      };
      await ConstruFactu.Documentos.guardar(rectDoc);
      vistaAnteriorEditor = 'facturas';
      abrirEditorDocumento(rectDoc.id, 'rectificativa');
    }

    function nuevoDocumento() {
      const mapaTipo = { presupuestos: 'presupuesto', albaranes: 'albaran', facturas: 'factura' };
      vistaAnteriorEditor = filtroListadoActual;
      abrirEditorDocumento(null, mapaTipo[filtroListadoActual]);
    }

    function editarDocumentoExistente(id) {
      const doc = ConstruFactu.Store.state.documentos.find(d => d.id === id);
      if (!doc || doc.deletedAt) return;
      vistaAnteriorEditor = doc.tipo === 'presupuesto' ? 'presupuestos' : (doc.tipo === 'albaran' ? 'albaranes' : 'facturas');
      abrirEditorDocumento(id, doc.tipo);
    }

    function volverDeEditor() { irA(vistaAnteriorEditor); }

    function abrirEditorDocumento(docId, tipo, clientePreseleccionado = '') {
      ocultarTodasLasVistas();
      document.getElementById('view-doc-editor').classList.remove('hidden');
      let doc = docId ? ConstruFactu.Store.state.documentos.find(d => d.id === docId) : null;
      if (doc && doc.deletedAt) {
        irA(vistaAnteriorEditor);
        return;
      }
      const esRect = tipo === 'rectificativa';

      document.getElementById('rectificativa-fields').classList.toggle('hidden', !esRect);
      document.getElementById('wrapper-doc-estado').classList.toggle('hidden', tipo !== 'presupuesto');

      if (doc) {
        poblarSelectClientes(doc.clienteId);
        document.getElementById('doc-id').value = doc.id;
        document.getElementById('doc-tipo').value = doc.tipo;
        document.getElementById('doc-obra').value = doc.obra || '';
        document.getElementById('doc-fecha').value = doc.fecha;
        document.getElementById('doc-iva').value = String(doc.iva);
        
        if (tipo === 'presupuesto') {
          const selectorEstado = document.getElementById('doc-estado');
          selectorEstado.disabled = doc.estado === 'Facturado';
          selectorEstado.value = doc.estado || 'Borrador';
        }
        if (esRect) {
          document.getElementById('doc-factura-rectificada').value = doc.facturaRectificadaNum || '';
          document.getElementById('doc-motivo-rectificacion').value = doc.motivoRectificacion || '';
        }
        lineasEditorTemp = JSON.parse(JSON.stringify(doc.lineas || []));
      } else {
        poblarSelectClientes(clientePreseleccionado);
        document.getElementById('doc-id').value = '';
        document.getElementById('doc-tipo').value = tipo;
        document.getElementById('doc-obra').value = '';
        document.getElementById('doc-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('doc-iva').value = '21';
        if (tipo === 'presupuesto') {
          const selectorEstado = document.getElementById('doc-estado');
          selectorEstado.disabled = false;
          selectorEstado.value = 'Borrador';
        }
        lineasEditorTemp = [{ concepto: '', cantidad: 1, unidad: 'ud', precio: 0 }];
      }

      const yaConvertido = doc && (
        doc.estado === 'Facturado' ||
        ConstruFactu.Store.state.documentos.some(d => d.origenPresupuestoId === doc.id)
      );
      document.getElementById('btn-convertir-proforma').classList.toggle('hidden', tipo !== 'presupuesto' || yaConvertido);
      document.getElementById('btn-emitir-verifactu').classList.toggle('hidden', tipo !== 'factura' && tipo !== 'rectificativa');

      renderLineasEditor();
      recalcularEditor();
    }

    function renderLineasEditor() {
      const cont = document.getElementById('editor-lineas');
      const opcionesTarifario = ConstruFactu.Tarifario.obtenerTodos().map(p => `<option value="${p.id}">${escapeHTML(p.concepto)} (${fmtEuro(p.precio)}/${escapeHTML(p.unidad)})</option>`).join('');

      cont.innerHTML = lineasEditorTemp.map((l, idx) => `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div class="flex items-center justify-between text-[11px] font-bold text-slate-500 gap-2">
            <span>Partida #${idx + 1}</span>
            <select data-change="seleccionarPartidaTarifario" data-change-args='[${idx},"$value"]' class="max-w-[150px] sm:max-w-[200px] px-2 py-1 rounded border bg-white text-[10px] text-indigo-700 font-bold truncate">
              <option value="">📐 Tarifario...</option>
              ${opcionesTarifario}
            </select>
          </div>
          <div class="flex gap-2 items-center">
            <textarea rows="2" placeholder="Descripción..." data-input="actualizarCampoLinea" data-input-args='[${idx},"concepto","$value"]' class="flex-1 px-3 py-2 rounded-lg border bg-white text-xs font-semibold resize-y">${escapeHTML(l.concepto)}</textarea>
            <button data-click="eliminarLineaEditor" data-click-args='[${idx}]' class="px-2.5 py-2 rounded-lg bg-rose-100 text-rose-700 font-bold text-xs">✕</button>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="block text-[9px] font-bold uppercase text-slate-400">Cantidad</label><input type="number" step="0.01" value="${l.cantidad}" data-input="actualizarCampoLinea" data-input-args='[${idx},"cantidad","$value"]' class="w-full px-2 py-1 rounded-lg border text-xs font-bold"></div>
            <div><label class="block text-[9px] font-bold uppercase text-slate-400">Unidad</label><input type="text" value="${escapeHTML(l.unidad)}" data-input="actualizarCampoLinea" data-input-args='[${idx},"unidad","$value"]' class="w-full px-2 py-1 rounded-lg border text-xs font-bold"></div>
            <div><label class="block text-[9px] font-bold uppercase text-slate-400">Precio (€)</label><input type="number" step="0.01" value="${l.precio}" data-input="actualizarCampoLinea" data-input-args='[${idx},"precio","$value"]' class="w-full px-2 py-1 rounded-lg border text-xs font-bold"></div>
          </div>
        </div>
      `).join('');
    }

    function actualizarCampoLinea(idx, campo, val) {
      lineasEditorTemp[idx][campo] = campo === 'unidad' || campo === 'concepto' ? val : (Number(val) || 0);
      recalcularEditor();
    }

    function agregarLineaEditor() {
      lineasEditorTemp.push({ concepto: '', cantidad: 1, unidad: 'ud', precio: 0 });
      renderLineasEditor();
    }

    function eliminarLineaEditor(idx) {
      if (lineasEditorTemp.length === 1) return;
      lineasEditorTemp.splice(idx, 1);
      renderLineasEditor();
      recalcularEditor();
    }

    function recalcularEditor() {
      const iva = Number(document.getElementById('doc-iva').value) || 0;
      const t = ConstruFactu.Money.totales({ lineas: lineasEditorTemp, iva });
      document.getElementById('ed-base').textContent = fmtEuro(t.base);
      document.getElementById('ed-iva-cuota').textContent = fmtEuro(t.cuota);
      document.getElementById('ed-total').textContent = fmtEuro(t.total);
    }

    async function eliminarDocumento(id) {
      const S = ConstruFactu.Store.state;
      const doc = S.documentos.find(d => d.id === id);
      if (!doc) return;
      // Doble candado: por estado y por pertenecer a la cadena Veri*factu (aunque alguien alterase el estado)
      if (doc.estado === 'Oficial' || (S.verifactuLog || []).some(r => r.docId === id)) {
        avisar('Las facturas oficiales son inmutables y no se pueden eliminar. Para corregirla, emite una rectificativa.', { tipo: 'error' });
        return;
      }
      if (!(await confirmar(`¿Eliminar ${doc.tipo} ${doc.numero}?\n\nEsta acción no se puede deshacer.`, { aceptar: 'Eliminar', peligro: true }))) return;
      if (!(await ConstruFactu.Documentos.eliminar(id))) {
        avisar('No se pudo guardar el borrado. El documento se ha conservado.', { tipo: 'error' });
        return;
      }
      renderListadoDocs();
      actualizarBadgesMenu();
    }

    async function guardarDocumento(vistaPrevia = false) {
      const id = document.getElementById('doc-id').value;
      const tipo = document.getElementById('doc-tipo').value;
      const clienteId = document.getElementById('doc-cliente').value;
      if (!clienteId) { avisar('Selecciona un cliente.'); return null; }

      const lineasLimpias = lineasEditorTemp.map(({ concepto, cantidad, unidad, precio }) => ({ concepto, cantidad, unidad, precio }));
      const obraVal = document.getElementById('doc-obra').value.trim();
      const esRect = tipo === 'rectificativa';

      let estadoVal = 'Borrador';
      if (tipo === 'presupuesto') estadoVal = document.getElementById('doc-estado').value;
      else if (tipo === 'albaran') estadoVal = 'Emitido';
      else if (tipo === 'factura' || tipo === 'rectificativa') estadoVal = 'Proforma';

      let docObj;
      if (id) {
        const existente = ConstruFactu.Store.state.documentos.find(d => d.id === id);
        docObj = {
          ...existente, clienteId, obra: obraVal, fecha: document.getElementById('doc-fecha').value,
          iva: Number(document.getElementById('doc-iva').value), 
          estado: tipo === 'presupuesto' ? estadoVal : existente.estado,
          lineas: lineasLimpias,
          facturaRectificadaNum: esRect ? document.getElementById('doc-factura-rectificada').value.trim().toUpperCase() : undefined,
          motivoRectificacion: esRect ? document.getElementById('doc-motivo-rectificacion').value.trim() : undefined
        };
      } else {
        const prefijos = { presupuesto: 'P2026-', albaran: 'A2026-', factura: 'PROFORMA-', rectificativa: 'BORRADOR-RECT-' };
        const count = ConstruFactu.Documentos.siguienteBorrador(tipo);
        docObj = {
          id: 'd' + Date.now(), tipo, numero: prefijos[tipo] + String(count).padStart(3, '0'),
          clienteId, obra: obraVal, fecha: document.getElementById('doc-fecha').value, iva: Number(document.getElementById('doc-iva').value),
          estado: estadoVal,  lineas: lineasLimpias,
          facturaRectificadaNum: esRect ? document.getElementById('doc-factura-rectificada').value.trim().toUpperCase() : undefined,
          motivoRectificacion: esRect ? document.getElementById('doc-motivo-rectificacion').value.trim() : undefined
        };
      }
      if ((await ConstruFactu.Documentos.guardar(docObj)) === false) return null;
      
      if (vistaPrevia === 'pdf') {
        verPDFDocumento(docObj.id); // Abre la vista preliminar flotante A4
      } else if (vistaPrevia !== 'silent') {
        volverDeEditor();
      }
      return docObj;
    }

    async function convertirAProformaDesdeEditor() {
      if (conversionProformaEnCurso) return;
      conversionProformaEnCurso = true;
      const boton = document.getElementById('btn-convertir-proforma');
      if (boton) boton.disabled = true;

      try {
        if (document.getElementById('doc-tipo').value !== 'presupuesto') {
          avisar('Solo se pueden convertir presupuestos en facturas proforma.', { tipo: 'error' });
          return;
        }

        const idOriginal = document.getElementById('doc-id').value;
        const originalExistente = idOriginal
          ? ConstruFactu.Store.state.documentos.find(d => d.id === idOriginal)
          : null;
        if (originalExistente && (
          originalExistente.deletedAt ||
          originalExistente.tipo !== 'presupuesto' ||
          originalExistente.estado === 'Facturado' ||
          ConstruFactu.Store.state.documentos.some(d => d.origenPresupuestoId === originalExistente.id)
        )) {
          avisar('Este presupuesto ya se ha convertido en una factura proforma.', { tipo: 'error' });
          return;
        }

        const presupuesto = await guardarDocumento('silent');
        if (!presupuesto) return;
        if (
          presupuesto.deletedAt ||
          presupuesto.tipo !== 'presupuesto' ||
          presupuesto.estado === 'Facturado' ||
          ConstruFactu.Store.state.documentos.some(d => d.origenPresupuestoId === presupuesto.id)
        ) {
          avisar('Este presupuesto ya se ha convertido en una factura proforma.', { tipo: 'error' });
          return;
        }

        const estado = ConstruFactu.Store.state;
        const documentos = estado.documentos;
        const fechaActual = new Date();
        const fecha = [
          fechaActual.getFullYear(),
          String(fechaActual.getMonth() + 1).padStart(2, '0'),
          String(fechaActual.getDate()).padStart(2, '0')
        ].join('-');
        let nuevoId;
        do {
          nuevoId = 'd' + Date.now() + Math.random().toString(36).substring(2, 8);
        } while (documentos.some(d => d.id === nuevoId));

        const numeroProforma = ConstruFactu.Documentos.siguienteBorrador('factura');
        const proforma = {
          id: nuevoId,
          tipo: 'factura',
          numero: `PROFORMA-${String(numeroProforma).padStart(3, '0')}`,
          clienteId: presupuesto.clienteId,
          obra: presupuesto.obra || '',
          fecha,
          iva: presupuesto.iva,
          estado: 'Proforma',
          observaciones: presupuesto.observaciones || '',
          lineas: (presupuesto.lineas || []).map(linea => ({ ...linea })),
          origenPresupuestoId: presupuesto.id,
          updatedAt: Date.now(),
          deletedAt: null
        };
        const estadoAnterior = presupuesto.estado;
        const updatedAtAnterior = presupuesto.updatedAt;
        presupuesto.estado = 'Facturado';
        presupuesto.updatedAt = Date.now();
        documentos.unshift(proforma);

        const restaurarCambios = () => {
          const indiceProforma = documentos.indexOf(proforma);
          if (indiceProforma !== -1) documentos.splice(indiceProforma, 1);
          presupuesto.estado = estadoAnterior;
          if (updatedAtAnterior === undefined) delete presupuesto.updatedAt;
          else presupuesto.updatedAt = updatedAtAnterior;
        };
        let guardado;
        try {
          guardado = await ConstruFactu.Store.save();
        } catch (error) {
          restaurarCambios();
          console.error('[Documentos] Error al guardar la conversión a proforma:', error);
          avisar('No se pudo guardar la conversión. El presupuesto se ha conservado sin cambios.', { tipo: 'error' });
          return;
        }
        if (!guardado) {
          restaurarCambios();
          avisar('No se pudo guardar la conversión. El presupuesto se ha conservado sin cambios.', { tipo: 'error' });
          return;
        }

        avisar('✅ El presupuesto se ha convertido en una factura proforma.');
        irA('facturas');
      } finally {
        conversionProformaEnCurso = false;
        if (boton) boton.disabled = false;
      }
    }
  CF.abrirListadoDocs = function() { return abrirListadoDocs.apply(this, arguments); };
  window.abrirListadoDocs = CF.abrirListadoDocs;
  CF.renderListadoDocs = function() { return renderListadoDocs.apply(this, arguments); };
  window.renderListadoDocs = CF.renderListadoDocs;
  CF.iniciarRectificativa = function() { return iniciarRectificativa.apply(this, arguments); };
  window.iniciarRectificativa = CF.iniciarRectificativa;
  CF.nuevoDocumento = function() { return nuevoDocumento.apply(this, arguments); };
  window.nuevoDocumento = CF.nuevoDocumento;
  CF.editarDocumentoExistente = function() { return editarDocumentoExistente.apply(this, arguments); };
  window.editarDocumentoExistente = CF.editarDocumentoExistente;
  CF.volverDeEditor = function() { return volverDeEditor.apply(this, arguments); };
  window.volverDeEditor = CF.volverDeEditor;
  CF.abrirEditorDocumento = function() { return abrirEditorDocumento.apply(this, arguments); };
  window.abrirEditorDocumento = CF.abrirEditorDocumento;
  CF.renderLineasEditor = function() { return renderLineasEditor.apply(this, arguments); };
  window.renderLineasEditor = CF.renderLineasEditor;
  CF.actualizarCampoLinea = function() { return actualizarCampoLinea.apply(this, arguments); };
  window.actualizarCampoLinea = CF.actualizarCampoLinea;
  CF.agregarLineaEditor = function() { return agregarLineaEditor.apply(this, arguments); };
  window.agregarLineaEditor = CF.agregarLineaEditor;
  CF.eliminarLineaEditor = function() { return eliminarLineaEditor.apply(this, arguments); };
  window.eliminarLineaEditor = CF.eliminarLineaEditor;
  CF.recalcularEditor = function() { return recalcularEditor.apply(this, arguments); };
  window.recalcularEditor = CF.recalcularEditor;
  CF.eliminarDocumento = function() { return eliminarDocumento.apply(this, arguments); };
  window.eliminarDocumento = CF.eliminarDocumento;
  CF.guardarDocumento = function() { return guardarDocumento.apply(this, arguments); };
  window.guardarDocumento = CF.guardarDocumento;
  CF.convertirAProformaDesdeEditor = function() { return convertirAProformaDesdeEditor.apply(this, arguments); };
  window.convertirAProformaDesdeEditor = CF.convertirAProformaDesdeEditor;
})(window.ConstruFactu);
