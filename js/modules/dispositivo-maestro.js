// js/modules/dispositivo-maestro.js
// Rol del dispositivo (maestro/satélite) para Verifactu. Stub no-op.
(function (CF) {
  'use strict';
  if (!CF) return;

  CF.DispositivoMaestro = {
    init: function () {
      var estado = window.ConstruFactu.Store.state;
      if (!estado || !estado.VERIFACTU_ENABLED) return; // no-op si el flag está off
      // TODO: modal de selección de rol (Paso D)
    }
  };
})(window.ConstruFactu);