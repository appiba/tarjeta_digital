(function() {
  function initScannerPlaceholder() {
    var node = AppUtils.qs('[data-scanner-state]');

    if (node) {
      node.textContent = 'El escaner QR se implementara en la Fase 5 con html5-qrcode.';
    }
  }

  window.ScannerApp = {
    initScannerPlaceholder: initScannerPlaceholder
  };
})();
