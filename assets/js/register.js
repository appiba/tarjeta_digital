(function() {
  var currentBusinessCode = '';
  var currentBusiness = null;
  var currentProgram = null;
  var currentReward = null;
  var currentPhone = '';
  var lookupData = null;

  async function init() {
    AppUtils.mountIcons();
    currentBusinessCode = getBusinessCode();

    if (!currentBusinessCode) {
      setState('Falta el codigo del negocio en el link.');
      showStep('error');
      return;
    }

    bindForms();
    await loadBusiness();
  }

  async function loadBusiness() {
    try {
      var result = await AppAPI.apiRequest('getPublicBusiness', {
        business_code: currentBusinessCode
      });

      if (!result.success) {
        throw new Error('No pudimos cargar este establecimiento. Intenta nuevamente.');
      }

      currentBusiness = result.data.business || {};
      currentReward = result.data.reward || {};
      currentProgram = result.data.program || {};

      paintBusiness(currentBusiness, currentProgram, currentReward);
      setState('Ingresa tu WhatsApp y abre tu Wallet al instante.');
      showStep('phone');
    } catch (error) {
      console.error(error);
      setState('No pudimos cargar este establecimiento. Intenta nuevamente.');
      showStep('error');
    }
  }

  function bindForms() {
    var phoneForm = AppUtils.qs('[data-register-phone-form]');
    var profileForm = AppUtils.qs('[data-register-profile-form]');

    if (phoneForm) {
      phoneForm.addEventListener('submit', handlePhoneSubmit);
    }

    if (profileForm) {
      profileForm.addEventListener('submit', handleProfileSubmit);
    }

    AppUtils.qsa('[data-register-action]').forEach(function(button) {
      button.addEventListener('click', function() {
        handleRegisterAction(button.dataset.registerAction, button);
      });
    });
  }

  async function handlePhoneSubmit(event) {
    event.preventDefault();

    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var formData = new FormData(form);
    currentPhone = String(formData.get('phone') || '').trim();

    AppUtils.setButtonLoading(button, true, 'Abriendo Wallet...');

    try {
      await createWalletFromPhone(button);
    } catch (error) {
      console.error(error);
      AppUtils.toast(error.message || 'No pudimos abrir tu Wallet. Intenta nuevamente.', 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();

    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var formData = new FormData(form);

    AppUtils.setButtonLoading(button, true, 'Creando Wallet...');

    try {
      var result = await requestCustomerRegistration({
        business_code: currentBusinessCode,
        full_name: formData.get('full_name'),
        phone: currentPhone || formData.get('phone'),
        email: formData.get('email'),
        birthday: formData.get('birthday')
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo crear tu Wallet.');
      }

      completeWalletFlow(result.data, result.data.is_new_customer ? 'Wallet creada' : 'Tarjeta agregada');
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  async function handleRegisterAction(action, button) {
    if (action === 'create-profile') {
      paintProfileForm();
      return;
    }

    AppUtils.setButtonLoading(button, true, action === 'open-card' ? 'Abriendo...' : 'Agregando...');

    try {
      var result = await requestCustomerRegistration({
        business_code: currentBusinessCode,
        phone: currentPhone,
        full_name: lookupData && lookupData.customer && lookupData.customer.full_name ? lookupData.customer.full_name : 'Cliente Loyalty'
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo continuar.');
      }

      completeWalletFlow(result.data, result.data.is_new_card ? 'Tarjeta agregada' : 'Wallet encontrada');
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  async function createWalletFromPhone(button) {
    AppUtils.setButtonLoading(button, true, 'Creando Wallet...');

    var result = await requestCustomerRegistration({
      business_code: currentBusinessCode,
      phone: currentPhone,
      full_name: 'Cliente Loyalty'
    });

    if (!result.success) {
      throw new Error(result.message || 'No se pudo crear tu Wallet.');
    }

    completeWalletFlow(result.data, result.data.is_new_customer ? 'Wallet activa' : 'Wallet encontrada');
  }

  async function requestCustomerRegistration(payload) {
    var result = await AppAPI.apiRequest('registerCustomerWallet', payload);

    if (!isNotImplemented(result, 'registerCustomerWallet')) {
      return result;
    }

    return AppAPI.apiRequest('registerCustomer', payload);
  }

  function isNotImplemented(result, action) {
    var message = String(result && result.message || '').toLowerCase();
    var error = String(result && result.error || '').toLowerCase();
    var actionName = String(action || '').toLowerCase();

    return error === 'not_implemented' || (message.indexOf('accion no implementada') !== -1 && message.indexOf(actionName) !== -1);
  }

  function paintLookupResult(data) {
    if (!data.customer_exists) {
      return;
    }

    var businessName = currentBusiness.business_name || 'este negocio';
    var customerName = data.customer && data.customer.full_name ? data.customer.full_name : 'Cliente';
    var title = data.has_card ? 'Tu Wallet ya esta activa en ' + businessName + '.' : 'Agregar ' + businessName + ' a tu Wallet';
    var buttonText = data.has_card ? 'Abrir mi Wallet' : 'Agregar tarjeta';
    var action = data.has_card ? 'open-card' : 'add-card';
    var box = AppUtils.qs('[data-register-result]');

    showStep('result');
    box.innerHTML = '<h2>Hola, ' + escapeHtml(customerName) + '</h2>' +
      '<p>Ya encontramos tu Wallet.</p>' +
      '<div class="wallet-add-card">' +
        '<div class="wallet-add-card__logo">' + escapeHtml(initials(businessName)) + '</div>' +
        '<div><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(programSummary(currentProgram, currentReward)) + '</span></div>' +
      '</div>' +
      '<div class="approval-actions">' +
        '<button class="button button--primary" type="button" data-register-action="' + escapeAttr(action) + '">' + escapeHtml(buttonText) + '</button>' +
        '<button class="button button--ghost" type="button" data-change-phone>Cambiar telefono</button>' +
      '</div>';

    bindDynamicResultButtons(box);
  }

  function paintProfileForm() {
    var phoneInput = AppUtils.qs('[data-profile-phone]');

    if (phoneInput) {
      phoneInput.value = currentPhone;
    }

    showStep('profile');
    setState('Crea tu Wallet una sola vez. Luego podras agregar mas negocios con el mismo WhatsApp.');
  }

  function completeWalletFlow(data, title) {
    var session = data.customer_session;

    if (session) {
      AppAPI.setCustomerSession(session);
    }

    var box = AppUtils.qs('[data-register-result]');
    var business = data.business || currentBusiness || {};
    var customer = data.customer || {};
    var card = data.card || {};
    var walletUrl = data.wallet_url || '../client/';
    var cardUrl = data.card_url || walletUrl;
    var coupons = data.available_coupons || data.coupons || [];
    var firstCoupon = coupons.length ? coupons[0] : null;
    var fallbackWallet = saveLocalWallet(data);

    showStep('result');
    box.innerHTML = '<h2>' + escapeHtml(title || 'Wallet lista') + '</h2>' +
      '<p>Tu WhatsApp quedo guardado. Abre tu tarjeta para descubrir ofertas, cupones sorpresa y descuentos cuando el negocio los active.</p>' +
      '<ul class="route-list">' +
        '<li><span>Cliente</span><strong>' + escapeHtml(customer.full_name || 'Cliente') + '</strong></li>' +
        '<li><span>Wallet</span><strong>' + escapeHtml(customer.wallet_id || (session && session.wallet_id) || '') + '</strong></li>' +
        '<li><span>Negocio</span><strong>' + escapeHtml(business.business_name || '') + '</strong></li>' +
        '<li><span>Tarjeta</span><strong>' + escapeHtml(card.card_id || '') + '</strong></li>' +
        (firstCoupon ? '<li><span>Cupon activo</span><strong>' + escapeHtml(firstCoupon.title || 'Cupon sorpresa') + '</strong></li>' : '') +
      '</ul>' +
      '<div class="approval-actions">' +
        '<a class="button button--primary" href="' + escapeAttr(cardUrl) + '">Abrir mi Wallet</a>' +
        '<a class="button button--ghost" href="' + escapeAttr(walletUrl) + '">Ir a Mi Wallet</a>' +
      '</div>';

    AppUtils.toast(title || 'Wallet lista.', 'success');
    AppUtils.mountIcons();

    window.setTimeout(function() {
      var targetUrl = cardUrl || (fallbackWallet && fallbackWallet.card_url) || walletUrl;

      if (targetUrl) {
        window.location.href = targetUrl;
      }
    }, 500);
  }

  function saveLocalWallet(data) {
    var session = data.customer_session || {};
    var business = data.business || currentBusiness || {};
    var customer = data.customer || {};
    var card = data.card || {};
    var program = data.program || currentProgram || {};
    var reward = data.reward || currentReward || {};
    var walletId = customer.wallet_id || session.wallet_id || ('LOCAL-' + normalizePhoneForId(currentPhone));
    var cardId = card.card_id || ('LOCAL-CARD-' + normalizePhoneForId(currentPhone) + '-' + (business.business_code || currentBusinessCode));
    var cardUrl = data.card_url || ('../client/card.html?card=' + encodeURIComponent(cardId) + '&local=1');
    var wallet = {
      saved_at: new Date().toISOString(),
      business_code: business.business_code || currentBusinessCode,
      business_id: business.business_id || '',
      customer: {
        customer_id: customer.customer_id || ('LOCAL-CUS-' + normalizePhoneForId(currentPhone)),
        wallet_id: walletId,
        full_name: customer.full_name || 'Cliente Loyalty',
        phone: customer.phone || currentPhone,
        phone_normalized: customer.phone_normalized || currentPhone,
        email: customer.email || '',
        birthday: customer.birthday || '',
        status: 'active'
      },
      wallet_id: walletId,
      wallet_url: data.wallet_url || '../client/?local=1',
      card_url: cardUrl,
      cards: [{
        business: business,
        program: program,
        reward: reward,
        welcome_reward: data.welcome_reward || { enabled: false, status: 'none' },
        coupons: data.coupons || data.available_coupons || [],
        available_coupons: data.available_coupons || data.coupons || [],
        card: Object.assign({
          card_id: cardId,
          customer_id: customer.customer_id || '',
          business_id: business.business_id || '',
          program_id: program.program_id || '',
          points: 0,
          stamps: 0,
          visits: 0,
          status: 'active',
          current: 0,
          goal: program.goal || 10,
          progress_percent: 0
        }, card),
        card_url: cardUrl
      }]
    };

    try {
      window.localStorage.setItem('loyalty_fallback_wallet', JSON.stringify(wallet));
      upsertLocalBusinessCustomer(wallet);
    } catch (error) {
      console.warn('No se pudo guardar Wallet local', error);
    }

    return wallet;
  }

  function upsertLocalBusinessCustomer(wallet) {
    var key = 'loyalty_fallback_business_customers';
    var rows = [];

    try {
      rows = JSON.parse(window.localStorage.getItem(key) || '[]');
    } catch (error) {
      rows = [];
    }

    var cardPayload = wallet.cards && wallet.cards[0] ? wallet.cards[0] : {};
    var row = {
      saved_at: wallet.saved_at,
      business_code: wallet.business_code || '',
      business_id: wallet.business_id || '',
      customer: wallet.customer,
      business: cardPayload.business || {},
      card: cardPayload.card || {},
      program: cardPayload.program || {},
      reward: cardPayload.reward || {},
      welcome_reward: cardPayload.welcome_reward || {},
      coupons: cardPayload.coupons || [],
      available_coupons: cardPayload.available_coupons || []
    };
    var existingIndex = rows.findIndex(function(item) {
      return item.business_code === row.business_code && item.customer && row.customer && item.customer.phone === row.customer.phone;
    });

    if (existingIndex === -1) {
      rows.unshift(row);
    } else {
      rows[existingIndex] = row;
    }

    window.localStorage.setItem(key, JSON.stringify(rows.slice(0, 100)));
  }

  function normalizePhoneForId(phone) {
    return String(phone || '').replace(/\D/g, '') || String(Date.now());
  }

  function bindDynamicResultButtons(root) {
    AppUtils.qsa('[data-register-action]', root).forEach(function(button) {
      button.addEventListener('click', function() {
        handleRegisterAction(button.dataset.registerAction, button);
      });
    });

    var changePhone = AppUtils.qs('[data-change-phone]', root);
    if (changePhone) {
      changePhone.addEventListener('click', function() {
        showStep('phone');
      });
    }
  }

  function paintBusiness(business, program, reward) {
    setThemeColor('--primary', business.primary_color || '#2563eb');
    setThemeColor('--secondary', business.secondary_color || '#0f766e');
    setText('[data-register-initials]', initials(business.business_name || 'Loyalty'));
    setText('[data-register-business]', business.business_name || 'Loyalty');
    setText('[data-register-type]', business.business_type || 'Clientes mas cerca');
    setText('[data-program-summary]', programSummary(program, reward));
    setText('[data-register-state]', 'Tu Wallet para ' + (business.business_name || 'este negocio') + '.');
  }

  function showStep(step) {
    AppUtils.qsa('[data-register-step]').forEach(function(node) {
      node.hidden = node.dataset.registerStep !== step;
    });
  }

  function setState(message) {
    setText('[data-register-state]', message);
  }

  function setText(selector, message) {
    AppUtils.qsa(selector).forEach(function(item) {
      item.textContent = message;
    });
  }

  function setThemeColor(name, value) {
    document.documentElement.style.setProperty(name, value);
    document.body.style.setProperty(name, value);
  }

  function programSummary(program, reward) {
    var type = labelProgramType(program && program.program_type);
    var goal = program && program.goal ? program.goal : '10';
    return 'Acumula ' + goal + ' ' + type + '. Descubre ofertas, cupones sorpresa y descuentos activos.';
  }

  function labelProgramType(type) {
    var value = String(type || 'STAMPS').toUpperCase();

    if (value === 'POINTS') {
      return 'puntos';
    }

    if (value === 'VISITS') {
      return 'visitas';
    }

    return 'sellos';
  }

  function getBusinessCode() {
    var params = new URLSearchParams(window.location.search);
    return String(params.get('business') || '').trim().toUpperCase();
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

  function initials(value) {
    return String(value || 'L')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function(part) { return part.charAt(0).toUpperCase(); })
      .join('') || 'L';
  }

  window.RegisterApp = {
    init: init
  };
})();
