(function (CF) {
  'use strict';

  function escaparXML(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function importe(valor) {
    if (valor == null || String(valor).trim() === '') {
      throw new Error('Falta un importe para generar el XML Verifactu.');
    }
    const numero = Number(valor);
    if (!Number.isFinite(numero)) throw new Error('Importe no válido para generar el XML Verifactu.');
    return numero.toFixed(2);
  }

  function fechaFactura(fecha) {
    const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
    if (!coincidencia) throw new Error('La fecha de factura debe tener el formato YYYY-MM-DD.');
    const fechaValidada = new Date(`${coincidencia[1]}-${coincidencia[2]}-${coincidencia[3]}T00:00:00Z`);
    if (!Number.isFinite(fechaValidada.getTime()) || fechaValidada.toISOString().slice(0, 10) !== `${coincidencia[1]}-${coincidencia[2]}-${coincidencia[3]}`) {
      throw new Error('La fecha de factura no es válida.');
    }
    return `${coincidencia[3]}-${coincidencia[2]}-${coincidencia[1]}`;
  }

  function fechaHoraConZona(valor) {
    const fechaHora = String(valor || '');
    const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/i.exec(fechaHora);
    if (!iso || !Number.isFinite(new Date(fechaHora).getTime())) {
      throw new Error('La fecha y hora de registro no tiene un formato ISO válido.');
    }
    if (iso[2]) return iso[1] + (iso[2].toUpperCase() === 'Z' ? '+00:00' : iso[2]);

    const desfase = -new Date(fechaHora).getTimezoneOffset();
    const signo = desfase >= 0 ? '+' : '-';
    const horas = String(Math.floor(Math.abs(desfase) / 60)).padStart(2, '0');
    const minutos = String(Math.abs(desfase) % 60).padStart(2, '0');
    return `${iso[1]}${signo}${horas}:${minutos}`;
  }

  function registroAnterior(registro) {
    const log = CF.Store && CF.Store.state && CF.Store.state.verifactuLog || [];
    return log.find(item => item && item.huella === registro.huellaAnterior);
  }

  CF.VerifactuXML = {
    generarRegistroAlta(doc, empresa, cliente, registro) {
      if (!doc || !empresa || !registro) {
        throw new Error('Faltan datos para generar el XML Verifactu.');
      }

      const esPrimerRegistro = registro.huellaAnterior === CF.VeriFactu.ZERO;
      const anterior = esPrimerRegistro ? null : registroAnterior(registro);
      if (!esPrimerRegistro && !anterior) {
        throw new Error('No se encontró el registro anterior de la cadena Verifactu.');
      }

      const nif = escaparXML(empresa.nif);
      const nombre = escaparXML(empresa.nombre);
      const numero = escaparXML(doc.numero);
      const fecha = escaparXML(fechaFactura(doc.fecha));
      const tipo = doc.tipo === 'rectificativa' ? 'R1' : 'F1';
      const descripcion = escaparXML(doc.obra || doc.observaciones || 'Factura');
      const iva = escaparXML(importe(doc.iva));
      const cuota = escaparXML(importe(registro.cuota));
      const total = escaparXML(importe(registro.total));
      const base = escaparXML(importe(Number(registro.total) - Number(registro.cuota)));
      const encadenamiento = esPrimerRegistro
        ? '<PrimerRegistro>S</PrimerRegistro>'
        : `<RegistroAnterior><IDEmisorFactura>${escaparXML(anterior.idEmisor)}</IDEmisorFactura><NumSerieFactura>${escaparXML(anterior.numero)}</NumSerieFactura><FechaExpedicionFactura>${escaparXML(fechaFactura(anterior.fecha))}</FechaExpedicionFactura><Huella>${escaparXML(anterior.huella)}</Huella></RegistroAnterior>`;

      return `<RegistroFactura><RegistroAlta><IDFactura><IDEmisorFactura>${nif}</IDEmisorFactura><NumSerieFactura>${numero}</NumSerieFactura><FechaExpedicionFactura>${fecha}</FechaExpedicionFactura></IDFactura><NombreRazonEmisor>${nombre}</NombreRazonEmisor><TipoFactura>${tipo}</TipoFactura><DescripcionOperacion>${descripcion}</DescripcionOperacion><Desglose><DetalleDesglose><Impuesto>01</Impuesto><ClaveRegimen>01</ClaveRegimen><CalificacionOperacion>S1</CalificacionOperacion><TipoImpositivo>${iva}</TipoImpositivo><BaseImponibleOimporteNoSujeto>${base}</BaseImponibleOimporteNoSujeto><CuotaRepercutida>${cuota}</CuotaRepercutida></DetalleDesglose></Desglose><CuotaTotal>${cuota}</CuotaTotal><ImporteTotal>${total}</ImporteTotal><Encadenamiento>${encadenamiento}</Encadenamiento><SistemaInformatico><NombreRazon>${nombre}</NombreRazon><NIF>${nif}</NIF><NombreSistemaInformatico>ConstruFactu</NombreSistemaInformatico><IdSistemaInformatico>CF01</IdSistemaInformatico><Version>1.0</Version><NumeroInstalacion>1</NumeroInstalacion><TipoUsoPosibleMultiOT>S</TipoUsoPosibleMultiOT><IndicadorMultiOT>N</IndicadorMultiOT></SistemaInformatico><FechaHoraHusoGenRegistro>${escaparXML(fechaHoraConZona(registro.fechaHoraRegistro))}</FechaHoraHusoGenRegistro><TipoHuella>01</TipoHuella><Huella>${escaparXML(registro.huella || '')}</Huella></RegistroAlta></RegistroFactura>`;
    }
  };
})(window.ConstruFactu);
