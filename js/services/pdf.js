(function(CF) {
  let docActualPDFNombre = 'Documento_A4.pdf';
  let docActualPDFId = null;
function verPDFDocumento(id) {
      const doc = ConstruFactu.Store.state.documentos.find(d => d.id === id);
      if (!doc || doc.deletedAt) return;
      const cli = getCliente(doc.clienteId);
      const tot = calcTotalesDoc(doc);
      const esRect = doc.tipo === 'rectificativa';
      const esOficial = (doc.tipo === 'factura' || esRect) && doc.estado === 'Oficial';

      docActualPDFNombre = (doc.numero || 'documento') + '.pdf';
      docActualPDFId = doc.id;
      const empresa = ConstruFactu.Store.state.empresa || {};

      const printArea = document.getElementById('print-area');
      printArea.innerHTML = '';

      const container = document.createElement('div');
      container.className = 'flex flex-col justify-between';
      container.style.minHeight = '265mm';

      const topDiv = document.createElement('div');

      const headerDiv = document.createElement('div');
      headerDiv.className = 'border-b-2 border-slate-900 pb-5 mb-6 flex justify-between items-start';

      const leftHead = document.createElement('div');
      leftHead.className = 'flex items-center gap-4';
      if (empresa.logo) {
        const img = document.createElement('img');
        img.src = empresa.logo;
        img.className = 'w-14 h-14 object-cover rounded-xl border';
        leftHead.appendChild(img);
      }
      const titleInfo = document.createElement('div');
      const h1 = document.createElement('h1');
      h1.className = 'font-extrabold text-xl text-slate-900';
      h1.textContent = empresa.nombre || '';
      const pNif = document.createElement('p');
      pNif.className = 'text-xs text-slate-600';
      pNif.innerHTML = 'NIF: <strong>' + (empresa.nif || '') + '</strong>';
      const pDir = document.createElement('p');
      pDir.className = 'text-xs text-slate-600';
      pDir.textContent = empresa.direccion || '';
      titleInfo.appendChild(h1);
      titleInfo.appendChild(pNif);
      titleInfo.appendChild(pDir);
      leftHead.appendChild(titleInfo);

      const rightHead = document.createElement('div');
      rightHead.className = 'text-right';
      const badge = document.createElement('span');
      badge.className = 'px-3 py-1.5 rounded bg-slate-900 text-white font-extrabold text-xs uppercase';
      badge.textContent = doc.tipo;
      const pNum = document.createElement('p');
      pNum.className = 'font-extrabold text-lg text-slate-900 mt-2';
      pNum.textContent = doc.numero;
      const pFec = document.createElement('p');
      pFec.className = 'text-xs text-slate-600';
      pFec.innerHTML = 'Fecha: <strong>' + doc.fecha + '</strong>';
      rightHead.appendChild(badge);
      rightHead.appendChild(pNum);
      rightHead.appendChild(pFec);

      headerDiv.appendChild(leftHead);
      headerDiv.appendChild(rightHead);
      topDiv.appendChild(headerDiv);

      const cliBox = document.createElement('div');
      cliBox.className = 'bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6';
      cliBox.innerHTML = `
        <div class="text-[11px] font-bold uppercase text-slate-400 mb-1">Cliente</div>
        <div class="font-extrabold text-base text-slate-900 whitespace-pre-line">${escapeHTML(cli.nombre)}</div>
        <div class="text-xs text-slate-700 mt-1">NIF: <strong>${escapeHTML(cli.nif)}</strong></div>
        ${cli.direccion ? `<div class="text-xs text-slate-600">${escapeHTML(cli.direccion)}</div>` : ''}
        <div class="text-xs text-slate-600">${escapeHTML(cli.cp || '')} ${escapeHTML(cli.poblacion || '')}</div>
      `;
      topDiv.appendChild(cliBox);
      if (esRect || doc.obra) {
        const info = document.createElement('div');
        info.className = 'text-xs text-slate-700 mb-5 space-y-0.5';
        info.innerHTML = (esRect ? `<div><strong>Rectifica la factura:</strong> ${escapeHTML(doc.facturaRectificadaNum || '')}${doc.motivoRectificacion ? ' · ' + escapeHTML(doc.motivoRectificacion) : ''}</div>` : '')
          + (doc.obra ? `<div><strong>Obra:</strong> ${escapeHTML(doc.obra)}</div>` : '');
        topDiv.appendChild(info);
      }

      const table = document.createElement('table');
      table.className = 'w-full text-left border-collapse mb-6';
      let tableHTML = `
        <thead>
          <tr class="border-b-2 border-slate-800 text-xs uppercase bg-slate-100">
            <th class="py-2.5 px-2">Partida / Concepto</th>
            <th class="py-2.5 px-2 text-right">Cant.</th>
            <th class="py-2.5 px-2 text-right">Precio</th>
            <th class="py-2.5 px-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody class="divide-y text-xs">
      `;
      (doc.lineas || []).forEach(l => {
        tableHTML += `
          <tr>
            <td class="py-3 px-2">${escapeHTML(l.concepto)}</td>
            <td class="py-3 px-2 text-right whitespace-nowrap">${fmtCant(l.cantidad)} ${escapeHTML(l.unidad)}</td>
            <td class="py-3 px-2 text-right whitespace-nowrap">${fmtPrecio(l.precio)}</td>
            <td class="py-3 px-2 text-right font-bold whitespace-nowrap">${fmtEuro(ConstruFactu.Money.lineaC(l.cantidad, l.precio) / 100)}</td>
          </tr>
        `;
      });
      tableHTML += '</tbody>';
      table.innerHTML = tableHTML;
      topDiv.appendChild(table);

      const totDiv = document.createElement('div');
      totDiv.className = 'flex justify-end mb-6 no-corte';
      totDiv.innerHTML = `
        <div class="w-72 bg-slate-50 p-4 rounded-xl border space-y-1.5 text-right">
          <div class="flex justify-between text-xs"><span>Base:</span><strong>${fmtEuro(tot.base)}</strong></div>
          <div class="flex justify-between text-xs"><span>IVA (${doc.iva}%):</span><strong>${fmtEuro(tot.cuota)}</strong></div>
          <div class="flex justify-between text-lg font-extrabold pt-2 border-t"><span>TOTAL:</span><span>${fmtEuro(tot.total)}</span></div>
        </div>
      `;
      topDiv.appendChild(totDiv);
   
      container.appendChild(topDiv);

      const modoVerifactuActivo = empresa.modoVerifactu === 'verifactu';
      if (esOficial) {
        const bottomDiv = document.createElement('div');
        bottomDiv.className = 'no-corte';
        bottomDiv.innerHTML = `
          <div class="pt-4 border-t-2 border-dashed flex items-center justify-between mt-4">
            <div class="space-y-1">
              <div class="text-[10px] font-extrabold text-slate-800 uppercase">${modoVerifactuActivo ? 'MODO CONFIGURADO: VERI*FACTU' : 'SISTEMA INFORMÁTICO DE FACTURACIÓN (MODO TRANSICIÓN)'}</div>
              ${modoVerifactuActivo ? `<div class="text-[9px] text-slate-600">Huella SHA-256: <span class="font-mono text-[8px]">${doc.hashVerifactu || ''}</span></div>` : ''}
              <div class="text-[9px] text-slate-500">${modoVerifactuActivo ? 'Factura verificable en la sede electrónica de la AEAT o a través del código QR' : 'El QR y la huella no acreditan por sí solos el cumplimiento normativo.'}</div>
            </div>
            ${modoVerifactuActivo ? `<div id="qrcode-${doc.id}" class="p-1 bg-white border rounded shadow-sm flex items-center justify-center w-20 h-20"></div>` : ''}
          </div>
        `;
        container.appendChild(bottomDiv);

        if (modoVerifactuActivo) setTimeout(() => {
          const el = document.getElementById('qrcode-' + doc.id);
          if (el && !el.hasChildNodes()) {
            try {
              new QRCode(el, {
                text: urlQrVerifactu(doc, empresa, tot),
                width: 72,
                height: 72
              });
            } catch(err) {
              el.textContent = "QR Veri*factu";
            }
          }
        }, 150);
      }

      printArea.appendChild(container);
      document.getElementById('view-pdf').classList.remove('hidden');
    }
/* ═══ PDF VECTORIAL (jsPDF + autoTable) ═══
       Texto real y seleccionable (~30 KB), cabecera de tabla repetida en cada página, filas que no se parten.
       Independiente de la pantalla: siempre A4. La fuente estándar (Helvetica) admite Windows-1252. */
    function urlQrVerifactu(doc, empresa, tot) {
      const [year, month, day] = doc.fecha.split('-');
      const fecha = `${day}-${month}-${year}`;
      const importe = Number(tot.total).toFixed(2);
      return `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=${encodeURIComponent(empresa.nif || '')}&numserie=${encodeURIComponent(doc.numero)}&fecha=${encodeURIComponent(fecha)}&importe=${importe}`;
    }
    function pdfTxt(v) {
      return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[^\n\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');
    }
    function prepararLogo(src) {                                // data URL de imagen → PNG ≤256 px, aplanado sobre blanco, con su proporción
      return new Promise(res => {
        if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src || '')) return res(null);
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 256 / Math.max(im.naturalWidth, im.naturalHeight, 1)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
          const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);   // aplana la transparencia (evita bordes oscuros)
          g.drawImage(im, 0, 0, c.width, c.height);
          res({ data: c.toDataURL('image/png'), w: c.width, h: c.height });
        };
        im.onerror = () => res(null); im.src = src;
      });
    }
    function dibujarQRVector(pdf, texto, x, y, tam) {           // QR como cuadrados vectoriales (nítido a cualquier zoom)
      const q = new QRCode(document.createElement('div'), { text: texto, width: 128, height: 128, correctLevel: QRCode.CorrectLevel.M });
      const o = q._oQRCode, n = o.getModuleCount(), m = tam / n;
      pdf.setFillColor(0, 0, 0);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (o.isDark(r, c)) pdf.rect(x + c * m, y + r * m, m + 0.02, m + 0.02, 'F');
    }

    async function generarPDFVectorial(docId, estadoDocumento = null) {
      const S = estadoDocumento || ConstruFactu.Store.state;
      const d = (S.documentos || []).find(x => x.id === docId);
      if (!d) throw new Error('Documento no encontrado');
      if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('No se pudo cargar la librería de PDF.');
      const cli = getCliente(d.clienteId, S) || {};
      const tot = ConstruFactu.Documentos.calcularTotales(d, S.verifactuLog);
      const emp = S.empresa || {};
      const esRect = d.tipo === 'rectificativa', esOficial = (d.tipo === 'factura' || esRect) && d.estado === 'Oficial';
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const L = 16, R = 194, W = R - L, TOP = 14, BOT = 18, PH = 297;
      const C = { ink: [15, 23, 42], gris: [71, 85, 105], suave: [100, 116, 139], claro: [148, 163, 184], f1: [241, 245, 249], f2: [248, 250, 252], borde: [226, 232, 240], ambar: [120, 53, 15] };
      const txt = (c) => pdf.setTextColor(c[0], c[1], c[2]);
      const fuente = (est, tam) => { pdf.setFont('helvetica', est); pdf.setFontSize(tam); };
      const etiqueta = (lab, val, x, y, tam) => { fuente('normal', tam); pdf.text(lab, x, y); const w = pdf.getTextWidth(lab); fuente('bold', tam); pdf.text(val, x + w, y); };
      pdf.setProperties({ title: pdfTxt(d.numero), subject: pdfTxt(d.tipo), author: pdfTxt(emp.nombre), creator: 'ConstruFactu' });

      // ── Cabecera ──
      let y = TOP, xT = L;
      const logo = await prepararLogo(emp.logo);
      if (logo) { const k = Math.min(14 / logo.w, 14 / logo.h), w = logo.w * k, h = logo.h * k; pdf.addImage(logo.data, 'PNG', L + (14 - w) / 2, y + (14 - h) / 2, w, h); xT = L + 18; }
      fuente('bold', 15); txt(C.ink);
      const nom = pdf.splitTextToSize(pdfTxt(emp.nombre || ''), 94); pdf.text(nom, xT, y + 5.5);
      let yl = y + 5.5 + (nom.length - 1) * 6 + 4.8;
      txt(C.gris); etiqueta('NIF: ', pdfTxt(emp.nif || ''), xT, yl, 8.5); txt(C.gris);
      fuente('normal', 8.5); const dir = pdf.splitTextToSize(pdfTxt(emp.direccion || ''), 94);
      if (emp.direccion) { pdf.text(dir, xT, yl + 4.2); yl += 4.2 * dir.length; }
      const tipo = pdfTxt(d.tipo || '').toUpperCase(); fuente('bold', 8);
      const wb = pdf.getTextWidth(tipo) + 7; pdf.setFillColor(...C.ink); pdf.roundedRect(R - wb, y, wb, 6.5, 1.2, 1.2, 'F');
      pdf.setTextColor(255, 255, 255); pdf.text(tipo, R - wb + 3.5, y + 4.5);
      txt(C.ink); fuente('bold', 13); pdf.text(pdfTxt(d.numero || ''), R, y + 13.5, { align: 'right' });
      fuente('bold', 8.5); const wf = pdf.getTextWidth(pdfTxt(d.fecha || '')); fuente('normal', 8.5); txt(C.gris);
      pdf.text('Fecha: ', R - wf - pdf.getTextWidth('Fecha: '), y + 18.2); fuente('bold', 8.5); pdf.text(pdfTxt(d.fecha || ''), R, y + 18.2, { align: 'right' });
      const yh = Math.max(yl, y + 18.2) + 4; pdf.setDrawColor(...C.ink); pdf.setLineWidth(0.6); pdf.line(L, yh, R, yh);
      y = yh + 6;

      // ── Caja de cliente (se mide primero y se dibuja después) ──
      const bloqueCliente = (dibujar, y0) => {
        let yy = y0 + 4.5; const x = L + 5, ancho = W - 10;
        fuente('bold', 6.8); txt(C.claro); if (dibujar) pdf.text('CLIENTE', x, yy + 0.8); yy += 4.6;
        fuente('bold', 11); txt(C.ink); const nm = pdf.splitTextToSize(pdfTxt(cli.nombre || ''), ancho);
        if (dibujar) pdf.text(nm, x, yy + 1.6); yy += 4.9 * nm.length + 0.6;
        fuente('normal', 8.5); txt(C.gris);
        if (dibujar) { fuente('normal', 8.5); pdf.text('NIF: ', x, yy + 1); const w = pdf.getTextWidth('NIF: '); fuente('bold', 8.5); pdf.text(pdfTxt(cli.nif || ''), x + w, yy + 1); fuente('normal', 8.5); } yy += 4.2;
        if (cli.direccion) { const ls = pdf.splitTextToSize(pdfTxt(cli.direccion), ancho); if (dibujar) pdf.text(ls, x, yy + 1); yy += 4 * ls.length; }
        const loc = pdfTxt(((cli.cp || '') + ' ' + (cli.poblacion || '')).trim()); if (loc) { if (dibujar) pdf.text(loc, x, yy + 1); yy += 4; }
        return yy + 3.5 - y0;
      };
      const hc = bloqueCliente(false, y);
      pdf.setFillColor(...C.f2); pdf.setDrawColor(...C.borde); pdf.setLineWidth(0.25); pdf.roundedRect(L, y, W, hc, 2.5, 2.5, 'FD');
      bloqueCliente(true, y); y += hc + 5;

      // ── Rectificativa / obra ──
      fuente('normal', 8.5); txt(C.ink);
      if (esRect) { const t = pdfTxt('Rectifica la factura: ' + (d.facturaRectificadaNum || '') + (d.motivoRectificacion ? '  ·  Motivo: ' + d.motivoRectificacion : '')); const ls = pdf.splitTextToSize(t, W); fuente('bold', 8.5); pdf.text(ls, L, y + 1); y += 4.2 * ls.length; }
      if (d.obra) { const ls = pdf.splitTextToSize(pdfTxt('Obra: ' + d.obra), W); fuente('normal', 8.5); pdf.text(ls, L, y + 1); y += 4.2 * ls.length; }
      if (esRect || d.obra) y += 3;

      // ── Tabla (cabecera repetida en cada página; las filas no se parten) ──
      pdf.autoTable({
        startY: y, margin: { top: TOP, bottom: BOT, left: L, right: 210 - R },
        head: [['PARTIDA / CONCEPTO', 'CANT.', 'PRECIO', 'IMPORTE']],
        body: (d.lineas || []).map((l, i) => [pdfTxt(l.concepto), fmtCant(l.cantidad) + ' ' + pdfTxt(l.unidad), fmtPrecio(l.precio), fmtEuro(tot.lineasC[i] / 100)]),
        theme: 'plain', showHead: 'everyPage', rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 }, textColor: C.ink, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: C.f1, textColor: C.ink, fontStyle: 'bold', fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 27 }, 2: { halign: 'right', cellWidth: 25 }, 3: { halign: 'right', cellWidth: 28, fontStyle: 'bold' } },
        didParseCell: (h) => { if (h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right'; },
        didDrawCell: (h) => { const c = h.cell; pdf.setLineWidth(h.section === 'head' ? 0.5 : 0.2); pdf.setDrawColor(...(h.section === 'head' ? C.ink : C.borde)); pdf.line(c.x, c.y + c.height, c.x + c.width, c.y + c.height); }
      });
      let yy = (pdf.lastAutoTable ? pdf.lastAutoTable.finalY : y) + 7;
      const asegurar = (alto) => { if (yy + alto > PH - BOT) { pdf.addPage(); yy = TOP; } };

      // ── Totales (bloque indivisible) ──
      asegurar(30); const bx = R - 74;
      pdf.setFillColor(...C.f2); pdf.setDrawColor(...C.borde); pdf.setLineWidth(0.25); pdf.roundedRect(bx, yy, 74, 28, 2.5, 2.5, 'FD');
      fuente('normal', 8.5); txt(C.gris); pdf.text('Base:', bx + 5, yy + 7); pdf.text('IVA (' + pdfTxt(d.iva) + '%):', bx + 5, yy + 12.5);
      fuente('bold', 8.5); txt(C.ink); pdf.text(fmtEuro(tot.base), bx + 69, yy + 7, { align: 'right' }); pdf.text(fmtEuro(tot.cuota), bx + 69, yy + 12.5, { align: 'right' });
      pdf.setDrawColor(...C.borde); pdf.line(bx + 5, yy + 16, bx + 69, yy + 16);
      fuente('bold', 12); pdf.text('TOTAL:', bx + 5, yy + 23.2); pdf.text(fmtEuro(tot.total), bx + 69, yy + 23.2, { align: 'right' });
      yy += 28 + 6;

     

      // ── Bloque Veri*factu (huella + QR) ──
      const modoVerifactuActivo = emp.modoVerifactu === 'verifactu';
      if (esOficial) {
        asegurar(32); yy += 2;
        pdf.setDrawColor(...C.claro); pdf.setLineWidth(0.4); pdf.setLineDashPattern([1.6, 1.6], 0); pdf.line(L, yy, R, yy); pdf.setLineDashPattern([], 0);
        fuente('bold', 7.5); txt(C.ink); pdf.text(modoVerifactuActivo ? 'MODO CONFIGURADO: VERI*FACTU' : 'SISTEMA INFORMÁTICO DE FACTURACIÓN (MODO TRANSICIÓN)', L, yy + 6);
        fuente('normal', 7); txt(C.suave); pdf.text(modoVerifactuActivo ? 'Factura verificable en la sede electrónica de la AEAT o a través del código QR' : 'El QR y la huella no acreditan por sí solos el cumplimiento normativo.', L, yy + 15.5);
        if (modoVerifactuActivo) {
          fuente('normal', 7); txt(C.gris); pdf.text('Huella SHA-256:', L, yy + 11);
          pdf.setFont('courier', 'normal'); pdf.setFontSize(6); pdf.text(pdfTxt(d.hashVerifactu || ''), L + 20, yy + 11);
          pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...C.borde); pdf.setLineWidth(0.25); pdf.roundedRect(R - 25, yy + 3, 25, 25, 1.5, 1.5, 'FD');
          dibujarQRVector(pdf, urlQrVerifactu(d, emp, tot), R - 23, yy + 5, 21);
        }
      }

      // ── Pie de página ──
      const n = pdf.internal.getNumberOfPages(), nombre = pdfTxt(d.numero || 'documento');
      pdf.setPage(n);
      fuente('normal', 7); txt(C.claro);
      const notaLegal = esOficial && modoVerifactuActivo
        ? 'Modo Veri*factu seleccionado. La transmisión y verificación ante AEAT no están acreditadas por esta aplicación.'
        : esOficial
          ? 'Documento emitido por ConstruFactu. La validez fiscal y el cumplimiento normativo deben verificarse conforme a la normativa aplicable.'
        : 'Documento de gestión interna. No válido como factura oficial.';
      pdf.text(pdf.splitTextToSize(pdfTxt(notaLegal), W), 105, 280, { align: 'center' });
      for (let i = 1; i <= n; i++) { pdf.setPage(i); fuente('normal', 7.5); txt(C.claro); pdf.text(`${nombre}  ·  Página ${i} de ${n}`, 105, 288, { align: 'center' }); }
      return pdf;
    }

    async function generarPDFNota(nota, estado = null) {
      if (!nota || typeof nota !== 'object') throw new Error('No hay datos de la nota para generar el PDF.');
      if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('No se pudo cargar la librería de PDF.');
      const S = estado || ConstruFactu.Store.state;
      const empresa = S.empresa || {};
      const cliente = (S.clientes || []).find(c => c.id === nota.clienteId && !c.deletedAt) || {};
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const L = 16, R = 194, W = R - L, MAX_Y = 273;
      const C = { ink: [15, 23, 42], gris: [71, 85, 105], suave: [100, 116, 139], claro: [148, 163, 184], fondo: [248, 250, 252], borde: [226, 232, 240] };
      const color = rgb => pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
      const fuente = (estilo, tamano) => { pdf.setFont('helvetica', estilo); pdf.setFontSize(tamano); };
      const fechaISO = String(nota.fecha || '');
      const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaISO) && !Number.isNaN(new Date(fechaISO + 'T00:00:00').getTime());
      const fecha = fechaValida ? new Date(fechaISO + 'T00:00:00').toLocaleDateString('es-ES') : pdfTxt(fechaISO);
      pdf.setProperties({ title: 'Mediciones y notas - ' + pdfTxt(fecha), subject: pdfTxt(nota.obra || 'Nota de obra'), author: pdfTxt(empresa.nombre || ''), creator: 'ConstruFactu' });

      let y = 16;
      pdf.setFillColor(...C.fondo);
      pdf.roundedRect(L, y, W, 34, 2, 2, 'F');
      const logo = await prepararLogo(empresa.logo);
      let xEmpresa = L + 5;
      if (logo) {
        const k = Math.min(22 / logo.w, 22 / logo.h);
        const w = logo.w * k, h = logo.h * k;
        pdf.addImage(logo.data, 'PNG', L + 5, y + 6, w, h);
        xEmpresa = L + 33;
      }
      fuente('bold', 13); color(C.ink);
      const nombreEmpresa = pdf.splitTextToSize(pdfTxt(empresa.nombre || 'Empresa'), logo ? 94 : 125);
      pdf.text(nombreEmpresa, xEmpresa, y + 12);
      fuente('normal', 8.5); color(C.gris);
      const datosEmpresa = [
        empresa.nif ? 'NIF: ' + pdfTxt(empresa.nif) : '',
        empresa.direccion ? pdfTxt(empresa.direccion) : '',
        S.auth && S.auth.email ? pdfTxt(S.auth.email) : ''
      ].filter(Boolean);
      if (datosEmpresa.length) {
        const detalleEmpresa = pdf.splitTextToSize(datosEmpresa.join('  ·  '), R - xEmpresa - 7);
        pdf.text(detalleEmpresa, xEmpresa, y + 17 + (nombreEmpresa.length - 1) * 4);
      }
      fuente('bold', 9); color(C.ink);
      pdf.text('MEDICIONES Y NOTAS', R - 5, y + 12, { align: 'right' });
      fuente('normal', 8); color(C.suave);
      pdf.text(fecha, R - 5, y + 19, { align: 'right' });
      y += 42;

      const nombreCliente = pdf.splitTextToSize(pdfTxt(cliente.nombre || 'Sin cliente'), W - 10);
      const detalleCliente = [
        cliente.nif ? 'NIF: ' + pdfTxt(cliente.nif) : '',
        cliente.direccion ? pdfTxt(cliente.direccion) : '',
        [cliente.cp, cliente.poblacion].filter(Boolean).map(pdfTxt).join(' ')
      ].filter(Boolean).flatMap(linea => pdf.splitTextToSize(linea, W - 10));
      const altoCliente = 12 + (nombreCliente.length + detalleCliente.length) * 4.5;
      pdf.setFillColor(...C.fondo); pdf.setDrawColor(...C.borde);
      pdf.roundedRect(L, y, W, altoCliente, 2, 2, 'FD');
      fuente('bold', 7); color(C.suave);
      pdf.text('CLIENTE', L + 5, y + 5);
      let yCliente = y + 11;
      fuente('bold', 10); color(C.ink);
      pdf.text(nombreCliente, L + 5, yCliente);
      yCliente += nombreCliente.length * 4.5;
      if (detalleCliente.length) {
        fuente('normal', 8); color(C.gris);
        pdf.text(detalleCliente, L + 5, yCliente + 1);
      }
      y += altoCliente + 6;

      const lineasObra = pdf.splitTextToSize(pdfTxt(nota.obra || 'Sin obra o referencia'), 125);
      const altoMeta = Math.max(17, 14 + lineasObra.length * 4.5);
      pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...C.borde);
      pdf.roundedRect(L, y, W, altoMeta, 2, 2, 'FD');
      fuente('bold', 7); color(C.suave);
      pdf.text('FECHA', L + 5, y + 5);
      pdf.text('OBRA / REFERENCIA', L + 48, y + 5);
      fuente('bold', 9); color(C.ink);
      pdf.text(fecha || '—', L + 5, y + 11);
      pdf.text(lineasObra, L + 48, y + 11);
      y += altoMeta + 8;

      const siguientePagina = () => {
        pdf.addPage();
        y = 18;
        fuente('bold', 9); color(C.ink);
        pdf.text('MEDICIONES Y NOTAS · CONTINUACIÓN', L, y);
        fuente('normal', 8); color(C.suave);
        pdf.text(fecha, R, y, { align: 'right' });
        pdf.setDrawColor(...C.borde); pdf.line(L, y + 4, R, y + 4);
        y += 14;
      };
      const tituloSeccion = texto => {
        if (y + 10 > MAX_Y) siguientePagina();
        fuente('bold', 8); color(C.suave);
        pdf.text(texto, L, y);
        pdf.setDrawColor(...C.borde); pdf.line(L, y + 2, R, y + 2);
        y += 9;
      };

      tituloSeccion('MEDICIONES Y OBSERVACIONES');
      fuente('normal', 9.5); color(C.ink);
      const lineasNota = String(nota.texto || 'Sin anotaciones.').replace(/\r\n?/g, '\n').split('\n')
        .flatMap(linea => pdf.splitTextToSize(pdfTxt(linea || ' '), W));
      for (const linea of lineasNota) {
        if (y + 5 > MAX_Y) siguientePagina();
        pdf.text(linea, L, y);
        y += 5;
      }
      y += 4;

      if (y + 8 + 133.5 > MAX_Y) siguientePagina();
      tituloSeccion('CROQUIS');
      if (nota.croquis) {
        const anchoCroquis = W;
        const altoCroquis = anchoCroquis * 600 / 800;
        if (y + altoCroquis + 3 > MAX_Y) siguientePagina();
        pdf.setDrawColor(...C.borde);
        pdf.rect(L, y, anchoCroquis, altoCroquis);
        pdf.addImage(nota.croquis, 'PNG', L + 1, y + 1, anchoCroquis - 2, altoCroquis - 2);
        y += altoCroquis + 4;
      } else {
        fuente('normal', 9); color(C.suave);
        pdf.text('No hay croquis guardado.', L, y);
      }

      const paginas = pdf.getNumberOfPages();
      for (let pagina = 1; pagina <= paginas; pagina++) {
        pdf.setPage(pagina);
        pdf.setDrawColor(...C.borde); pdf.line(L, 284, R, 284);
        fuente('normal', 7); color(C.suave);
        pdf.text(pdfTxt(empresa.nombre || 'ConstruFactu'), L, 289);
        pdf.text(`Página ${pagina} de ${paginas}`, R, 289, { align: 'right' });
      }
      return pdf;
    }

    async function abrirPDFNota(nota) {
      const ventana = window.open('about:blank', '_blank');
      if (!ventana) {
        avisar('El navegador ha bloqueado la pestaña del PDF. Permite ventanas emergentes e inténtalo de nuevo.');
        return;
      }
      ventana.opener = null;
      let blobUrl = null;
      try {
        const pdf = await generarPDFNota(nota);
        blobUrl = URL.createObjectURL(pdf.output('blob'));
        ventana.location.href = blobUrl;
      } catch (error) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        ventana.close();
        avisar('No se pudo generar el PDF: ' + error.message, { tipo: 'error' });
      }
    }

    async function descargarArchivoPDFA4() {
      const ventana = window.open('about:blank', '_blank');
      if (!ventana) {
        avisar('El navegador ha bloqueado la pestaña del PDF. Permite ventanas emergentes e inténtalo de nuevo.');
        return;
      }
      ventana.opener = null;

      let blobUrl = null;
      try {
        const pdf = await generarPDFVectorial(docActualPDFId);
        const blob = pdf.output('blob');
        blobUrl = URL.createObjectURL(blob);
        ventana.location.href = blobUrl;
      } catch (e) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        ventana.close();
        avisar('No se pudo generar el PDF: ' + e.message);
      }
    }
    function cerrarVistaPDF() { document.getElementById('view-pdf').classList.add('hidden'); }
  CF.verPDFDocumento = function() { return verPDFDocumento.apply(this, arguments); };
  window.verPDFDocumento = CF.verPDFDocumento;
  CF.urlQrVerifactu = function() { return urlQrVerifactu.apply(this, arguments); };
  window.urlQrVerifactu = CF.urlQrVerifactu;
  CF.pdfTxt = function() { return pdfTxt.apply(this, arguments); };
  window.pdfTxt = CF.pdfTxt;
  CF.prepararLogo = function() { return prepararLogo.apply(this, arguments); };
  window.prepararLogo = CF.prepararLogo;
  CF.dibujarQRVector = function() { return dibujarQRVector.apply(this, arguments); };
  window.dibujarQRVector = CF.dibujarQRVector;
  CF.generarPDFVectorial = function() { return generarPDFVectorial.apply(this, arguments); };
  window.generarPDFVectorial = CF.generarPDFVectorial;
  CF.generarPDFNota = function() { return generarPDFNota.apply(this, arguments); };
  window.generarPDFNota = CF.generarPDFNota;
  CF.abrirPDFNota = function() { return abrirPDFNota.apply(this, arguments); };
  window.abrirPDFNota = CF.abrirPDFNota;
  CF.descargarArchivoPDFA4 = function() { return descargarArchivoPDFA4.apply(this, arguments); };
  window.descargarArchivoPDFA4 = CF.descargarArchivoPDFA4;
  CF.cerrarVistaPDF = function() { return cerrarVistaPDF.apply(this, arguments); };
  window.cerrarVistaPDF = CF.cerrarVistaPDF;
})(window.ConstruFactu);
