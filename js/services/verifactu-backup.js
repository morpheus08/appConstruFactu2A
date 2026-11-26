// js/services/verifactu-backup.js
// Export/Import de backup para conservación de registros Verifactu. Stub no-op.
(function (CF) {
  'use strict';
  if (!CF) return;

  CF.VerifactuBackup = {
    init: function () {
      var estado = window.ConstruFactu.Store.state;
      if (!estado || !estado.VERIFACTU_ENABLED) return; // no-op si el flag está off
      // TODO: inicialización de UI de backup (Paso E)
    },
    exportar: function () {
      // TODO: export de backup (Paso E)
    },
    importar: function (/* file */) {
      // TODO: import de backup (Paso E)
    }
  };
})(window.ConstruFactu);