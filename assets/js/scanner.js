(function() {
  var currentCard = null;
  var currentStream = null;
  var scanTimer = null;
  var detector = null;
  var isScanning = false;
  var lastScannedValue = '';
  var lastScannedAt = 0;
  var jsQrLoadPromise = null;
  var currentCustomer = {};
  var currentBusiness = {};
  var currentProgram = {};
  var currentWelcome = {};
  var currentCoupons = [];
  var currentHistory = [];

  function initScanner(context) {
    var form = AppUtils.qs('[data-wallet-scan-form]');
    var scanFromUrl = readScanPayload(window.location.href);

    setState('Abre la camara y apunta al QR que muestra el cliente.');
    bindCameraControls();

    if (form) {
      form.addEventListener('submit', function(event) {
        event.preventDefault();
        var formData = new FormData(form);
        scanWallet(readScanPayload(formData.get('wallet')));
      });
    }

    if ((scanFromUrl.wallet || scanFromUrl.cardId) && form) {
      var input = form.querySelector('[name="wallet"]');
      input.value = scanFromUrl.wallet || scanFromUrl.cardId;
      primeQuickCard(scanFromUrl);
      scanWallet(scanFromUrl);
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
      AppUtils.toast('Este navegador no permite abrir camara. Usa Chrome en HTTPS o pega el codigo manual.', 'error');
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
      if (!isScanning || !video.videoWidth || !video.videoHeight) {
        return;
      }

      var value = '';

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
        handleDecodedWallet(value);
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

  function handleDecodedWallet(value) {
    var scan = readScanPayload(value);
    var normalized = scan.wallet || scan.cardId;
    var now = Date.now();

    if (!normalized || (normalized === lastScannedValue && now - lastScannedAt < 3000)) {
      return;
    }

    lastScannedValue = normalized;
    lastScannedAt = now;

    var input = AppUtils.qs('[data-wallet-scan-form] [name="wallet"]');
    if (input) {
      input.value = normalized;
    }

    setCameraReadout('QR leido');
    setState(scan.cardId ? 'QR leido. Ya puedes registrar el movimiento.' : 'QR leido. Cargando ficha del cliente...');
    stopCamera();
    primeQuickCard(scan);
    scanWallet(scan);
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

  async function scanWallet(scan, createIfMissing) {
    var button = AppUtils.qs('[data-wallet-scan-form] button[type="submit"]');
    var details = typeof scan === 'object' && scan !== null ? scan : readScanPayload(scan);
    var normalizedWallet = details.wallet || '';

    if (!normalizedWallet && !details.cardId) {
      AppUtils.toast('Escanea el QR del cliente o pega el codigo de Wallet.', 'error');
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Cargando ficha...');

    try {
      var result = await AppAPI.apiRequest('scanWallet', {
        wallet: normalizedWallet,
        card_id: details.cardId || '',
        fast: Boolean(details.cardId),
        create_if_missing: Boolean(createIfMissing)
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo leer esta Wallet.');
      }

      paintResult(result.data);
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  function paintResult(data) {
    var container = AppUtils.qs('[data-scanner-result]');

    if (!container) {
      return;
    }

    var customer = data.customer || {};
    var business = data.business || {};
    var card = data.card || {};
    var program = data.program || {};
    var welcome = data.welcome_reward || {};
    var coupons = data.available_coupons || [];

    if (!data.has_card) {
      currentCustomer = customer;
      currentBusiness = business;
      currentProgram = program;
      currentWelcome = welcome;
      currentCoupons = coupons;
      currentHistory = data.history || [];
      currentCard = null;
      container.innerHTML = '<h2>Este cliente todavia no pertenece a tu programa</h2>' +
        '<p><strong>' + escapeHtml(customer.full_name || 'Cliente') + '</strong></p>' +
        '<p>Wallet: ' + escapeHtml(customer.wallet_id || '') + '</p>' +
        '<button class="button button--primary" type="button" data-add-wallet="' + escapeAttr(customer.wallet_id || '') + '">Agregar a mi programa</button>';
      bindResultActions(container);
      AppUtils.mountIcons();
      return;
    }

    currentCard = card;
    currentCustomer = customer;
    currentBusiness = business;
    currentProgram = program;
    currentWelcome = welcome;
    currentCoupons = coupons;
    currentHistory = data.history || [];
    container.innerHTML = '<h2>' + escapeHtml(customer.full_name || 'Cliente') + '</h2>' +
      '<p>' + escapeHtml(business.business_name || 'Mi negocio') + '</p>' +
      '<div class="settings-list">' +
        '<div><span>Sellos</span><strong data-scan-stamps>' + escapeHtml(card.stamps || 0) + '</strong></div>' +
        '<div><span>Puntos</span><strong data-scan-points>' + escapeHtml(card.points || 0) + '</strong></div>' +
        '<div><span>Visitas</span><strong data-scan-visits>' + escapeHtml(card.visits || 0) + '</strong></div>' +
        '<div><span>Progreso</span><strong data-scan-progress>' + escapeHtml(card.progress_percent || 0) + '%</strong></div>' +
        '<div><span>Bienvenida</span><strong>' + escapeHtml(welcome.enabled ? statusLabel(welcome.status) : 'No configurado') + '</strong></div>' +
      '</div>' +
      '<div class="client-action-grid" style="margin-top:16px;">' +
        '<button class="button button--primary" type="button" data-card-action="add_stamp">+1 Sello</button>' +
        '<button class="button button--ghost" type="button" data-card-action="add_visit">+1 Visita</button>' +
        '<button class="button button--ghost" type="button" data-card-action="add_points">Agregar puntos</button>' +
        '<button class="button button--warning" type="button" data-card-action="redeem_welcome_reward"' + (welcome.status === 'available' ? '' : ' disabled') + '>Canjear bienvenida</button>' +
      '</div>' +
      '<div class="scanner-coupons"><h3>Cupones disponibles</h3>' + renderCoupons(coupons) + '</div>' +
      '<div class="client-list scanner-history">' + renderHistory(data.history || []) + '</div>';

    bindResultActions(container);
    AppUtils.mountIcons();
  }

  function primeQuickCard(scan) {
    if (!scan || !scan.cardId) {
      return;
    }

    currentCard = Object.assign({
      card_id: scan.cardId,
      stamps: 0,
      points: 0,
      visits: 0,
      current: 0,
      goal: 10,
      progress_percent: 0
    }, currentCard && currentCard.card_id === scan.cardId ? currentCard : {});

    currentCustomer = currentCustomer || {};
    currentBusiness = currentBusiness || {};
    currentProgram = currentProgram || {};
    currentWelcome = currentWelcome || {};
    currentCoupons = currentCoupons || [];
    currentHistory = currentHistory || [];

    var container = AppUtils.qs('[data-scanner-result]');

    if (!container) {
      return;
    }

    container.innerHTML = '<h2>Codigo leido</h2>' +
      '<p>Tarjeta fija lista. Registra un solo movimiento y espera el mensaje de exito.</p>' +
      '<div class="settings-list">' +
        '<div><span>Tarjeta</span><strong>' + escapeHtml(abbreviateCode(scan.cardId)) + '</strong></div>' +
        '<div><span>Estado</span><strong data-quick-status>Lista para marcar</strong></div>' +
      '</div>' +
      '<div class="client-action-grid" style="margin-top:16px;">' +
        '<button class="button button--primary" type="button" data-card-action="add_stamp">+1 Sello</button>' +
        '<button class="button button--ghost" type="button" data-card-action="add_visit">+1 Visita</button>' +
        '<button class="button button--ghost" type="button" data-card-action="add_points">Agregar puntos</button>' +
      '</div>' +
      '<p class="muted">Los detalles completos se cargan en segundo plano.</p>';

    bindResultActions(container);
    AppUtils.mountIcons();
  }

  function bindResultActions(container) {
    AppUtils.qsa('[data-add-wallet]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        scanWallet(button.dataset.addWallet, true);
      });
    });

    AppUtils.qsa('[data-card-action]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        applyAction(button.dataset.cardAction, button);
      });
    });

    AppUtils.qsa('[data-redeem-coupon]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        applyAction('redeem_coupon', button, button.dataset.redeemCoupon);
      });
    });
  }

  async function applyAction(action, button, couponId) {
    if (!currentCard || !currentCard.card_id) {
      return;
    }

    if (button && button.disabled) {
      return;
    }

    var amount = '';

    if (action === 'add_points') {
      amount = window.prompt('Cuantos puntos deseas agregar?', '1');

      if (!amount) {
        return;
      }
    }

    var previousCard = Object.assign({}, currentCard);
    var optimisticCard = getOptimisticCard(currentCard, action, amount);

    if (optimisticCard) {
      currentCard = optimisticCard;
      updateDisplayedCard(currentCard);
    }

    setQuickStatus('Registrando...');
    setState('Registrando movimiento...');
    AppUtils.setButtonLoading(button, true, 'Registrando...');

    try {
      var result = await AppAPI.apiRequest('applyBusinessCustomerAction', {
        card_id: currentCard.card_id,
        action: action,
        amount: amount,
        coupon_id: couponId || ''
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo registrar.');
      }

      paintResult({
        customer: result.data.customer,
        business: currentBusiness || {},
        has_card: true,
        card: result.data.card,
        program: result.data.program,
        welcome_reward: result.data.welcome_reward,
        coupons: result.data.coupons,
        available_coupons: result.data.coupons ? result.data.coupons.filter(function(coupon) { return coupon.status === 'available'; }) : [],
        history: result.data.history
      });
      setState('Movimiento registrado con exito.');
      AppUtils.toast('Registrado con exito.', 'success');
    } catch (error) {
      currentCard = previousCard;
      updateDisplayedCard(currentCard);
      setQuickStatus('No registrado');
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  function renderHistory(history) {
    if (!history.length) {
      return '<p class="muted">Sin movimientos todavia.</p>';
    }

    return history.slice(0, 6).map(function(item) {
      return '<article class="history-card"><div class="history-card__icon"><i data-lucide="receipt-text"></i></div><div><strong>' + escapeHtml(transactionLabel(item)) + '</strong><p>' + escapeHtml(AppUtils.formatDate(item.created_at)) + '</p></div></article>';
    }).join('');
  }

  function renderCoupons(coupons) {
    if (!coupons.length) {
      return '<p class="muted">Sin cupones disponibles.</p>';
    }

    return '<div class="client-list">' + coupons.map(function(coupon) {
      return '<article class="history-card"><div class="history-card__icon"><i data-lucide="ticket"></i></div><div><strong>' + escapeHtml(coupon.title || 'Cupon') + '</strong><p>' + escapeHtml(coupon.description || '') + '</p><button class="button button--warning" type="button" data-redeem-coupon="' + escapeAttr(coupon.coupon_id) + '">Canjear cupon</button></div></article>';
    }).join('') + '</div>';
  }

  function transactionLabel(item) {
    if (item.type === 'add_stamp') {
      return '+1 sello';
    }

    if (item.type === 'add_visit') {
      return '+1 visita';
    }

    if (item.type === 'add_points') {
      return '+' + (item.points_change || item.amount || 0) + ' puntos';
    }

    if (item.type === 'welcome_reward_redeemed') {
      return 'Bienvenida canjeada';
    }

    if (item.type === 'coupon_granted') {
      return item.notes || 'Cupon desbloqueado';
    }

    if (item.type === 'coupon_redeemed') {
      return item.notes || 'Cupon canjeado';
    }

    return item.notes || item.type || 'Movimiento';
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

  function setQuickStatus(message) {
    AppUtils.qsa('[data-quick-status]').forEach(function(node) {
      node.textContent = message;
    });
  }

  function updateDisplayedCard(card) {
    if (!card) {
      return;
    }

    setText('[data-scan-stamps]', card.stamps || 0);
    setText('[data-scan-points]', card.points || 0);
    setText('[data-scan-visits]', card.visits || 0);
    setText('[data-scan-progress]', (card.progress_percent || 0) + '%');
  }

  function setText(selector, value) {
    AppUtils.qsa(selector).forEach(function(node) {
      node.textContent = value === undefined || value === null ? '' : String(value);
    });
  }

  function getOptimisticCard(card, action, amount) {
    var copy = Object.assign({}, card);
    var goal = parseInt(copy.goal || '10', 10) || 10;

    if (action === 'add_stamp') {
      copy.stamps = (parseInt(copy.stamps || '0', 10) || 0) + 1;
      copy.current = copy.stamps;
    } else if (action === 'add_visit') {
      copy.visits = (parseInt(copy.visits || '0', 10) || 0) + 1;
      copy.current = copy.visits;
    } else if (action === 'add_points') {
      copy.points = (parseInt(copy.points || '0', 10) || 0) + (parseInt(amount || '0', 10) || 0);
      copy.current = copy.points;
    } else {
      return null;
    }

    copy.progress_percent = goal > 0 ? Math.min(100, Math.round(((parseInt(copy.current || '0', 10) || 0) / goal) * 100)) : 0;
    return copy;
  }

  function normalizeWalletInput(value) {
    return readScanPayload(value).wallet;
  }

  function readScanPayload(value) {
    var text = String(value || '').trim();
    var result = {
      wallet: '',
      cardId: '',
      raw: text
    };

    if (!text) {
      return result;
    }

    try {
      var url = new URL(text);
      result.wallet = url.searchParams.get('wallet') || url.searchParams.get('wallet_id') || '';
      result.cardId = url.searchParams.get('card') || url.searchParams.get('card_id') || '';
    } catch (error) {
      var walletMatch = text.match(/(?:wallet|wallet_id)=([^&\s]+)/i);
      var cardMatch = text.match(/(?:card|card_id)=([^&\s]+)/i);
      result.wallet = walletMatch ? decodeURIComponent(walletMatch[1]) : '';
      result.cardId = cardMatch ? decodeURIComponent(cardMatch[1]) : '';
    }

    if (!result.wallet && /^WALLET[\w-]*/i.test(text)) {
      result.wallet = text;
    }

    if (!result.cardId && /^CRD[\w-]*/i.test(text)) {
      result.cardId = text;
    }

    result.wallet = String(result.wallet || '').trim().toUpperCase();
    result.cardId = String(result.cardId || '').trim().toUpperCase();

    return result;
  }

  function statusLabel(status) {
    if (status === 'available') {
      return 'Disponible';
    }

    if (status === 'redeemed') {
      return 'Canjeado';
    }

    if (status === 'expired') {
      return 'Vencido';
    }

    return status || 'No configurado';
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function abbreviateCode(value) {
    var text = String(value || '');
    return text.length > 10 ? text.slice(0, 4) + '...' + text.slice(-6) : text;
  }

  window.ScannerApp = {
    initScanner: initScanner
  };
})();
