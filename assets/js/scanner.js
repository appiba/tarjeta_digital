(function() {
  var currentScan = null;
  var currentStream = null;
  var scanTimer = null;
  var detector = null;
  var isScanning = false;
  var lastScannedValue = '';
  var lastScannedAt = 0;
  var jsQrLoadPromise = null;

  function initScanner() {
    var form = AppUtils.qs('[data-wallet-scan-form]');
    var scanFromUrl = readScanPayload(window.location.href);

    setState('Abre la camara y apunta al QR que muestra el cliente.');
    bindCameraControls();

    if (form) {
      form.addEventListener('submit', function(event) {
        event.preventDefault();
        var formData = new FormData(form);
        scanCustomer(readScanPayload(formData.get('wallet')));
      });
    }

    if ((scanFromUrl.customerCode || scanFromUrl.wallet) && form) {
      var input = form.querySelector('[name="wallet"]');
      input.value = scanFromUrl.customerCode || scanFromUrl.wallet;
      scanCustomer(scanFromUrl);
    }

    window.addEventListener('beforeunload', stopCamera);
    AppUtils.mountIcons();
  }

  function bindCameraControls() {
    var startButton = AppUtils.qs('[data-camera-start]');
    var stopButton = AppUtils.qs('[data-camera-stop]');

    if (startButton) {
      startButton.addEventListener('click', function() {
        startCamera(startButton);
      });
    }

    if (stopButton) {
      stopButton.addEventListener('click', stopCamera);
    }
  }

  async function startCamera(button) {
    if (isScanning) {
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      AppUtils.toast('Este navegador no permite abrir camara. Usa HTTPS o pega el codigo manual.', 'error');
      return;
    }

    var video = AppUtils.qs('[data-camera-video]');
    var frame = AppUtils.qs('.scan-frame');

    if (!video) {
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Abriendo...');
    setState('Solicitando permiso de camara...');
    setCameraReadout('Permite la camara');

    try {
      currentStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      video.srcObject = currentStream;
      video.hidden = false;
      await video.play();

      if (frame) {
        frame.classList.add('is-camera');
      }

      isScanning = true;
      toggleCameraButtons(true);
      setState('Camara activa. Apunta al QR del cliente.');
      setCameraReadout('Buscando QR...');
      startDecodeLoop(video);
    } catch (error) {
      console.error(error);
      AppUtils.toast('No pudimos abrir la camara. Revisa permisos o pega el codigo manual.', 'error');
      setState('No pudimos abrir la camara. Puedes pegar el codigo manual.');
      setCameraReadout('Sin camara');
      stopCamera();
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  function startDecodeLoop(video) {
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d', { willReadFrequently: true });

    if ('BarcodeDetector' in window) {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (error) {
        detector = null;
      }
    }

    if (!detector && !window.jsQR) {
      setCameraReadout('Preparando lector QR...');
      loadJsQrFallback()
        .then(function() {
          if (isScanning) {
            setCameraReadout('Buscando QR...');
          }
        })
        .catch(function() {
          setState('No se pudo cargar el lector automatico. Puedes pegar el codigo manual.');
          setCameraReadout('Usa codigo manual');
        });
    }

    scanTimer = window.setInterval(async function() {
      var value = '';

      if (!isScanning || !video.videoWidth || !video.videoHeight) {
        return;
      }

      if (detector) {
        try {
          var codes = await detector.detect(video);
          if (codes && codes.length) {
            value = codes[0].rawValue || '';
          }
        } catch (error) {
          detector = null;
        }
      }

      if (!value && window.jsQR) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        var decoded = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        value = decoded && decoded.data ? decoded.data : '';
      }

      if (value) {
        handleDecodedCode(value);
      }
    }, 350);
  }

  function loadJsQrFallback() {
    if (window.jsQR) {
      return Promise.resolve();
    }

    if (jsQrLoadPromise) {
      return jsQrLoadPromise;
    }

    jsQrLoadPromise = new Promise(function(resolve, reject) {
      var script = document.createElement('script');

      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    return jsQrLoadPromise;
  }

  function handleDecodedCode(value) {
    var scan = readScanPayload(value);
    var customerCode = scan.customerCode || scan.wallet;
    var now = Date.now();

    if (!customerCode || (customerCode === lastScannedValue && now - lastScannedAt < 3000)) {
      return;
    }

    lastScannedValue = customerCode;
    lastScannedAt = now;

    var input = AppUtils.qs('[data-wallet-scan-form] [name="wallet"]');
    if (input) {
      input.value = customerCode;
    }

    setCameraReadout('QR leido');
    setState('QR leido. Cargando ficha del cliente...');
    stopCamera();
    scanCustomer(scan);
  }

  function stopCamera() {
    var video = AppUtils.qs('[data-camera-video]');
    var frame = AppUtils.qs('.scan-frame');

    isScanning = false;

    if (scanTimer) {
      window.clearInterval(scanTimer);
      scanTimer = null;
    }

    if (currentStream) {
      currentStream.getTracks().forEach(function(track) {
        track.stop();
      });
      currentStream = null;
    }

    if (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
    }

    if (frame) {
      frame.classList.remove('is-camera');
    }

    toggleCameraButtons(false);
    setCameraReadout('Camara lista');
  }

  function toggleCameraButtons(active) {
    var startButton = AppUtils.qs('[data-camera-start]');
    var stopButton = AppUtils.qs('[data-camera-stop]');

    if (startButton) {
      startButton.hidden = active;
    }

    if (stopButton) {
      stopButton.hidden = !active;
    }
  }

  async function scanCustomer(scan) {
    var button = AppUtils.qs('[data-wallet-scan-form] button[type="submit"]');
    var details = typeof scan === 'object' && scan !== null ? scan : readScanPayload(scan);
    var customerCode = details.customerCode || details.wallet || '';

    if (!customerCode) {
      AppUtils.toast('Escanea el QR del cliente o pega el codigo LOY.', 'error');
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Cargando ficha...');

    try {
      var result = await AppAPI.apiRequest('scanSimpleCustomer', {
        customer_code: customerCode
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo leer este codigo.');
      }

      paintScan(result.data);
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  function paintScan(data) {
    var container = AppUtils.qs('[data-scanner-result]');

    if (!container) {
      return;
    }

    var customer = data.customer || {};
    var level = data.level || {};
    var code = customer.customer_code || customer.wallet_id || '';

    currentScan = {
      customer_code: code,
      customer: customer,
      level: level,
      promotions: data.promotions || []
    };

    container.innerHTML =
      '<h2>Cliente encontrado</h2>' +
      '<p><strong>' + escapeHtml(customer.full_name || 'Cliente Loyalty') + '</strong></p>' +
      '<div class="settings-list">' +
        '<div><span>Codigo</span><strong>' + escapeHtml(code) + '</strong></div>' +
        '<div><span>Pasadas</span><strong>' + escapeHtml(level.total_passes || customer.total_passes || 0) + '</strong></div>' +
        '<div><span>Nivel</span><strong>' + escapeHtml(level.current_level || customer.current_level || 1) + '</strong></div>' +
        '<div><span>Progreso</span><strong>' + escapeHtml(level.label || '') + '</strong></div>' +
      '</div>' +
      '<div class="client-action-grid" style="margin-top:16px;">' +
        '<button class="button button--primary" type="button" data-confirm-pass><i data-lucide="badge-check"></i>Confirmar pasada</button>' +
      '</div>' +
      '<div class="scanner-coupons"><h3>Promociones disponibles</h3>' + renderCoupons(data.promotions || []) + '</div>';

    bindResultActions(container);
    AppUtils.mountIcons();
    setState('Cliente encontrado. Confirma para registrar +1 pasada.');
  }

  function bindResultActions(container) {
    AppUtils.qsa('[data-confirm-pass]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        confirmPass(button);
      });
    });
  }

  async function confirmPass(button) {
    if (!currentScan || !currentScan.customer_code) {
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Registrando...');
    setState('Registrando pasada...');

    try {
      var result = await AppAPI.apiRequest('registerSimplePass', {
        customer_code: currentScan.customer_code
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo registrar la pasada.');
      }

      paintPassResult(result.data);
      AppUtils.toast(result.data.duplicate ? 'Ya se registro hace unos segundos.' : 'Pasada registrada.', 'success');
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  function paintPassResult(data) {
    var container = AppUtils.qs('[data-scanner-result]');

    if (!container) {
      return;
    }

    var customer = data.customer || {};
    var level = data.level || {};
    var title = data.duplicate ? 'Pasada ya registrada' : 'Pasada registrada';

    currentScan = {
      customer_code: customer.customer_code || customer.wallet_id || '',
      customer: customer,
      level: level,
      promotions: data.promotions || []
    };

    container.innerHTML =
      '<h2>' + escapeHtml(title) + '</h2>' +
      '<p><strong>' + escapeHtml(customer.full_name || 'Cliente Loyalty') + '</strong></p>' +
      (data.leveled_up ? '<p class="badge">Subiste de nivel</p>' : '') +
      '<div class="settings-list">' +
        '<div><span>Pasadas totales</span><strong>' + escapeHtml(level.total_passes || customer.total_passes || 0) + '</strong></div>' +
        '<div><span>Nivel actual</span><strong>' + escapeHtml(level.current_level || customer.current_level || 1) + '</strong></div>' +
        '<div><span>Progreso</span><strong>' + escapeHtml(level.label || '') + '</strong></div>' +
        '<div><span>Faltan</span><strong>' + escapeHtml(level.remaining_to_next_level || 0) + '</strong></div>' +
      '</div>' +
      '<div class="scanner-coupons"><h3>Promociones disponibles</h3>' + renderCoupons(data.promotions || []) + '</div>';

    setState(data.duplicate ? 'Ya se habia registrado esta pasada hace unos segundos.' : 'Registrado con exito.');
    AppUtils.mountIcons();
  }

  function renderCoupons(coupons) {
    if (!coupons || !coupons.length) {
      return '<p class="muted">Sin promociones disponibles para este nivel.</p>';
    }

    return '<div class="client-list">' + coupons.map(function(coupon) {
      return '<article class="history-card"><div class="history-card__icon"><i data-lucide="ticket"></i></div><div><span class="badge">Nivel ' + escapeHtml(coupon.level_required || 1) + '</span><strong>' + escapeHtml(coupon.title || 'Promocion') + '</strong><p>' + escapeHtml(coupon.description || '') + '</p></div></article>';
    }).join('') + '</div>';
  }

  function readScanPayload(value) {
    var text = String(value || '').trim();
    var result = {
      customerCode: '',
      wallet: '',
      raw: text
    };

    if (!text) {
      return result;
    }

    try {
      var url = new URL(text);
      result.customerCode = url.searchParams.get('code') || url.searchParams.get('customer_code') || '';
      result.wallet = url.searchParams.get('wallet') || url.searchParams.get('wallet_id') || '';
    } catch (error) {
      var codeMatch = text.match(/(?:code|customer_code)=([^&\s]+)/i);
      var walletMatch = text.match(/(?:wallet|wallet_id)=([^&\s]+)/i);
      result.customerCode = codeMatch ? decodeURIComponent(codeMatch[1]) : '';
      result.wallet = walletMatch ? decodeURIComponent(walletMatch[1]) : '';
    }

    if (!result.customerCode && /^LOY-[A-Z0-9]+$/i.test(text)) {
      result.customerCode = text;
    }

    result.customerCode = String(result.customerCode || '').trim().toUpperCase();
    result.wallet = String(result.wallet || '').trim().toUpperCase();

    if (!result.customerCode && /^LOY-[A-Z0-9]+$/i.test(result.wallet)) {
      result.customerCode = result.wallet;
    }

    return result;
  }

  function setState(message) {
    AppUtils.qsa('[data-scanner-state]').forEach(function(node) {
      node.textContent = message;
    });
  }

  function setCameraReadout(message) {
    AppUtils.qsa('[data-camera-readout]').forEach(function(node) {
      node.textContent = message;
    });
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.ScannerApp = {
    initScanner: initScanner
  };
})();
