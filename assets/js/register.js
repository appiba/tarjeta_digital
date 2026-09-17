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
      setState('Ingresa tu WhatsApp para buscar tu Wallet.');
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

    AppUtils.setButtonLoading(button, true, 'Buscando...');

    try {
      var result = await AppAPI.apiRequest('lookupCustomerPhone', {
        business_code: currentBusinessCode,
        phone: currentPhone
      });

      if (!result.success) {
        throw new Error('No pudimos revisar tu Wallet. Intenta nuevamente.');
      }

      lookupData = result.data || {};

      if (!lookupData.customer_exists) {
        await createWalletFromPhone(button);
        return;
      }

      paintLookupResult(lookupData);
    } catch (error) {
      console.error(error);
      try {
        await createWalletFromPhone(button);
      } catch (registerError) {
        console.error(registerError);
        AppUtils.toast(registerError.message || 'No pudimos revisar tu Wallet. Intenta nuevamente.', 'error');
      }
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

    completeWalletFlow(result.data, result.data.is_new_customer ? 'Primer cupon listo' : 'Wallet encontrada');
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
    var title = data.has_card ? 'Ya tienes una tarjeta activa de ' + businessName + '.' : 'Agregar ' + businessName + ' a tu Wallet';
    var buttonText = data.has_card ? 'Abrir mi tarjeta' : 'Agregar tarjeta';
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

    showStep('result');
    box.innerHTML = '<h2>' + escapeHtml(title || 'Wallet lista') + '</h2>' +
      '<p>Tu WhatsApp ya queda guardado en la Wallet. Puedes abrir la tarjeta de este negocio o ver todas tus tarjetas.</p>' +
      '<ul class="route-list">' +
        '<li><span>Cliente</span><strong>' + escapeHtml(customer.full_name || 'Cliente') + '</strong></li>' +
        '<li><span>Wallet</span><strong>' + escapeHtml(customer.wallet_id || (session && session.wallet_id) || '') + '</strong></li>' +
        '<li><span>Negocio</span><strong>' + escapeHtml(business.business_name || '') + '</strong></li>' +
        '<li><span>Tarjeta</span><strong>' + escapeHtml(card.card_id || '') + '</strong></li>' +
        (firstCoupon ? '<li><span>Cupon</span><strong>' + escapeHtml(firstCoupon.title || 'Cupon disponible') + '</strong></li>' : '') +
      '</ul>' +
      '<div class="approval-actions">' +
        '<a class="button button--primary" href="' + escapeAttr(cardUrl) + '">Abrir mi tarjeta</a>' +
        '<a class="button button--ghost" href="' + escapeAttr(walletUrl) + '">Ir a Mi Wallet</a>' +
      '</div>';

    AppUtils.toast(title || 'Wallet lista.', 'success');
    AppUtils.mountIcons();

    window.setTimeout(function() {
      var targetUrl = cardUrl || walletUrl;

      if (targetUrl) {
        window.location.href = targetUrl;
      }
    }, 500);
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
    setText('[data-register-state]', 'Tarjeta de ' + (business.business_name || 'este negocio') + '.');
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
    var rewardName = reward && reward.name ? reward.name : 'Premio especial';
    return 'Meta: ' + goal + ' ' + type + '. Premio: ' + rewardName + '.';
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
