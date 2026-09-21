(function() {
  async function init(pageName, roles, options) {
    Auth.bindLogout();
    var context = await Auth.protectPage(roles || ['business_owner', 'staff'], options || {});

    if (!context) {
      return;
    }

    var pageLabel = AppUtils.qs('[data-page-label]');
    if (pageLabel) {
      pageLabel.textContent = pageName || 'Inicio';
    }

    AppUtils.mountIcons();
    return context;
  }

  async function initDashboard() {
    var context = await init('Inicio', ['business_owner', 'staff']);

    if (!context) {
      return;
    }

    try {
      var result = await AppAPI.apiRequest('getBusinessHome');

      if (!result.success) {
        throw new Error(result.message || 'No se pudo cargar el negocio.');
      }

      paintDashboard(result.data);
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    }
  }

  async function initCustomers() {
    var context = await init('Clientes', ['business_owner', 'staff']);

    if (!context) {
      return;
    }

    var container = AppUtils.qs('[data-business-customers-list]');

    if (!container) {
      return;
    }

    container.innerHTML = renderLoading();

    try {
      var result = await AppAPI.apiRequest('listBusinessCustomers', {});

      if (!result.success) {
        if (isNotImplemented(result, 'listBusinessCustomers')) {
          var homeResult = await AppAPI.apiRequest('getBusinessHome', {});
          var business = homeResult.success ? homeResult.data.business || {} : {};
          var localCustomers = getLocalBusinessCustomers(business);

          paintBusinessCustomers(localCustomers);
          bindBusinessCustomerSearch(localCustomers);
          AppUtils.toast('Mostrando clientes guardados en este navegador. Actualiza Apps Script para ver todos.', 'error');
          return;
        }

        throw new Error(result.message || 'No se pudieron cargar clientes.');
      }

      var customers = result.data.customers || [];

      paintBusinessCustomers(customers);
      bindBusinessCustomerSearch(customers);
    } catch (error) {
      container.innerHTML = '<article class="panel-card"><h2>Error</h2><p>' + escapeHtml(error.message) + '</p></article>';
    }
  }

  async function initPromotions() {
    var context = await init('Promociones', ['business_owner', 'staff']);

    if (!context) {
      return;
    }

    bindPromotionForm();
    await loadBusinessPromotions();
  }

  function paintDashboard(data) {
    var business = data.business || {};
    var program = data.program || {};
    var reward = data.reward || {};
    var stats = data.stats || {};
    var customerLink = data.customer_register_url || '';
    var shareText = data.customer_share_text || customerLink;

    setThemeColor('--primary', business.primary_color || '#0f766e');
    setThemeColor('--secondary', business.secondary_color || '#f59e0b');

    setText('[data-business-name]', business.business_name || 'Mi negocio');
    setText('[data-business-type]', business.business_type || 'Negocio local');
    setText('[data-business-code]', business.business_code || '');
    setText('[data-business-initials]', initials(business.business_name || 'Loyalty'));
    setText('[data-program-goal]', String(program.goal || '10'));
    setText('[data-program-type]', labelProgramType(program.program_type));
    setText('[data-reward-name]', reward.name || 'Premio especial');
    setText('[data-stat-customers]', stats.customers || 0);
    setText('[data-stat-transactions]', stats.transactions || 0);
    setText('[data-stat-promotions]', stats.promotions || 0);
    setText('[data-customer-link]', customerLink);
    paintPreviewBeans(program.goal || 10);

    var customerInput = AppUtils.qs('[data-customer-link-input]');
    if (customerInput) {
      customerInput.value = customerLink;
    }

    var shareButton = AppUtils.qs('[data-share-whatsapp]');
    if (shareButton) {
      shareButton.href = 'https://wa.me/?text=' + encodeURIComponent(shareText);
    }

    var copyButton = AppUtils.qs('[data-copy-customer-link]');
    if (copyButton) {
      copyButton.addEventListener('click', function() {
        copyToClipboard(customerLink);
      });
    }
  }

  async function loadBusinessPromotions() {
    var container = AppUtils.qs('[data-business-promotions-list]');

    if (!container) {
      return;
    }

    container.innerHTML = renderLoading();

    try {
      var result = await AppAPI.apiRequest('listBusinessPromotions', {});

      if (!result.success) {
        if (isNotImplemented(result, 'listBusinessPromotions')) {
          paintBusinessPromotions(getLocalBusinessPromotions());
          AppUtils.toast('Promociones guardadas localmente. Actualiza Apps Script para calendario real.', 'error');
          return;
        }

        throw new Error(result.message || 'No se pudieron cargar promociones.');
      }

      paintBusinessPromotions(result.data.promotions || []);
    } catch (error) {
      container.innerHTML = '<article class="panel-card"><h2>Error</h2><p>' + escapeHtml(error.message) + '</p></article>';
    }
  }

  function bindPromotionForm() {
    var form = AppUtils.qs('[data-business-promotion-form]');

    if (!form) {
      return;
    }

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      var button = form.querySelector('button[type="submit"]');
      var formData = new FormData(form);
      var payload = {
        title: formData.get('title'),
        description: formData.get('description'),
        promotion_type: formData.get('promotion_type'),
        surprise_enabled: formData.get('surprise_enabled') === 'on',
        coupon_label: formData.get('coupon_label'),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date')
      };

      AppUtils.setButtonLoading(button, true, 'Guardando...');

      try {
        var result = await AppAPI.apiRequest('createBusinessPromotion', payload);

        if (!result.success) {
          if (isNotImplemented(result, 'createBusinessPromotion')) {
            saveLocalBusinessPromotion(payload);
            form.reset();
            await loadBusinessPromotions();
            AppUtils.toast('Promocion guardada en este navegador.', 'success');
            return;
          }

          throw new Error(result.message || 'No se pudo crear la promocion.');
        }

        form.reset();
        AppUtils.toast('Promocion creada.', 'success');
        await loadBusinessPromotions();
      } catch (error) {
        AppUtils.toast(error.message, 'error');
      } finally {
        AppUtils.setButtonLoading(button, false);
      }
    });
  }

  function paintBusinessPromotions(promotions) {
    var container = AppUtils.qs('[data-business-promotions-list]');

    if (!container) {
      return;
    }

    if (!promotions.length) {
      container.innerHTML = '<article class="empty-state"><div><i data-lucide="megaphone"></i><h2>Sin promociones</h2><p>Crea cupones sorpresa o promociones calendarizadas para fechas especiales.</p></div></article>';
      AppUtils.mountIcons();
      return;
    }

    container.innerHTML = promotions.map(renderBusinessPromotion).join('');
    bindPromotionActions(container);
    AppUtils.mountIcons();
  }

  function renderBusinessPromotion(promotion) {
    var state = promotion.visibility_status || promotion.status || 'active';
    var isDisabled = state === 'disabled' || promotion.status === 'disabled';
    var typeLabel = promotion.promotion_type === 'surprise' || promotion.type === 'surprise_coupon' ? 'Cupon sorpresa' : 'Promocion';
    var action = isDisabled ?
      '<button class="button button--success" type="button" data-promotion-status="' + escapeAttr(promotion.promotion_id) + '" data-status-value="active"><i data-lucide="play"></i>Activar</button>' :
      '<button class="button button--ghost" type="button" data-promotion-status="' + escapeAttr(promotion.promotion_id) + '" data-status-value="disabled"><i data-lucide="pause"></i>Desactivar</button>';

    return '<article class="request-card">' +
      '<div class="request-card__main">' +
        '<div><span class="badge" data-status="' + escapeAttr(state) + '">' + escapeHtml(promotionStateLabel(state)) + '</span><h2>' + escapeHtml(promotion.title || 'Promocion') + '</h2><p>' + escapeHtml(promotion.description || '') + '</p></div>' +
        '<strong>' + escapeHtml(typeLabel) + '</strong>' +
      '</div>' +
      '<dl class="request-card__details">' +
        '<div><dt>Tipo</dt><dd>' + escapeHtml(typeLabel) + '</dd></div>' +
        '<div><dt>Cupon</dt><dd>' + escapeHtml(promotion.coupon_label || promotion.title || '') + '</dd></div>' +
        '<div><dt>Inicio</dt><dd>' + escapeHtml(formatDateValue(promotion.start_date)) + '</dd></div>' +
        '<div><dt>Fin</dt><dd>' + escapeHtml(formatDateValue(promotion.end_date)) + '</dd></div>' +
        '<div><dt>Estado</dt><dd>' + escapeHtml(promotionStateLabel(state)) + '</dd></div>' +
      '</dl>' +
      '<div class="request-card__actions">' + action + '</div>' +
      '</article>';
  }

  function bindPromotionActions(container) {
    AppUtils.qsa('[data-promotion-status]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        updatePromotionStatus(button.dataset.promotionStatus, button.dataset.statusValue, button);
      });
    });
  }

  async function updatePromotionStatus(promotionId, status, button) {
    AppUtils.setButtonLoading(button, true, 'Guardando...');

    try {
      var result = await AppAPI.apiRequest('updateBusinessPromotionStatus', {
        promotion_id: promotionId,
        status: status
      });

      if (!result.success) {
        if (isNotImplemented(result, 'updateBusinessPromotionStatus')) {
          updateLocalPromotionStatus(promotionId, status);
          await loadBusinessPromotions();
          return;
        }

        throw new Error(result.message || 'No se pudo actualizar.');
      }

      await loadBusinessPromotions();
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  function setText(selector, value) {
    AppUtils.qsa(selector).forEach(function(node) {
      node.textContent = value === undefined || value === null ? '' : String(value);
    });
  }

  function paintBusinessCustomers(customers) {
    var container = AppUtils.qs('[data-business-customers-list]');

    if (!container) {
      return;
    }

    if (!customers.length) {
      container.innerHTML = '<article class="empty-state"><div><i data-lucide="users"></i><h2>Aun no hay clientes</h2><p>La lista se llenara con clientes reales registrados desde el link publico del negocio.</p></div></article>';
      AppUtils.mountIcons();
      return;
    }

    container.innerHTML = customers.map(renderBusinessCustomer).join('');
    AppUtils.mountIcons();
  }

  function renderBusinessCustomer(item) {
    var customer = item.customer || {};
    var card = item.card || {};
    var program = item.program || {};
    var welcome = item.welcome_reward || {};
    var coupons = item.coupons || [];
    var availableCoupons = item.available_coupons || coupons.filter(function(coupon) { return coupon.status === 'available'; });
    var phone = customer.phone || customer.phone_normalized || customer.whatsapp || '';

    return '<article class="request-card" data-business-customer-card="' + escapeAttr(card.card_id || '') + '">' +
      '<div class="request-card__main">' +
        '<div><span class="badge">' + escapeHtml(labelProgramType(program.program_type)) + '</span><h2>' + escapeHtml(customer.full_name || 'Cliente') + '</h2><p>WhatsApp: ' + escapeHtml(phone || 'Sin numero') + '</p></div>' +
        '<strong>' + escapeHtml(progressText(card, program)) + '</strong>' +
      '</div>' +
      '<dl class="request-card__details">' +
        '<div><dt>WhatsApp</dt><dd>' + escapeHtml(phone || 'Sin numero') + '</dd></div>' +
        '<div><dt>Wallet</dt><dd>' + escapeHtml(customer.wallet_id || '') + '</dd></div>' +
        '<div><dt>Tarjeta</dt><dd>' + escapeHtml(card.card_id || '') + '</dd></div>' +
        '<div><dt>Bienvenida</dt><dd>' + escapeHtml(welcome.enabled ? welcome.status : 'none') + '</dd></div>' +
        '<div><dt>Cupones activos</dt><dd>' + escapeHtml(String(availableCoupons.length || 0)) + '</dd></div>' +
        '<div><dt>Cupones total</dt><dd>' + escapeHtml(String(coupons.length || 0)) + '</dd></div>' +
        '<div><dt>Estado</dt><dd>' + escapeHtml(card.status || '') + '</dd></div>' +
      '</dl>' +
      '<div class="request-card__actions">' +
        '<a class="button button--ghost" href="scanner.html?wallet=' + encodeURIComponent(customer.wallet_id || '') + '"><i data-lucide="scan-line"></i>Abrir ficha</a>' +
      '</div>' +
      '</article>';
  }

  function bindBusinessCustomerSearch(customers) {
    var input = AppUtils.qs('[data-business-customer-search]');

    if (!input) {
      return;
    }

    input.addEventListener('input', function() {
      var query = input.value.trim().toLowerCase();
      var filtered = customers.filter(function(item) {
        var customer = item.customer || {};
        var card = item.card || {};
        return [customer.full_name, customer.phone, customer.phone_normalized, customer.email, customer.wallet_id, card.card_id].join(' ').toLowerCase().indexOf(query) !== -1;
      });

      paintBusinessCustomers(filtered);
    });
  }

  function getLocalBusinessCustomers(business) {
    var rows = [];

    try {
      rows = JSON.parse(window.localStorage.getItem('loyalty_fallback_business_customers') || '[]');
    } catch (error) {
      rows = [];
    }

    return rows.filter(function(row) {
      if (!business || (!business.business_id && !business.business_code)) {
        return true;
      }

      return (business.business_id && row.business_id === business.business_id) ||
        (business.business_code && row.business_code === business.business_code);
    });
  }

  function getLocalBusinessPromotions() {
    try {
      return JSON.parse(window.localStorage.getItem('loyalty_fallback_promotions') || '[]').map(function(promotion) {
        promotion.visibility_status = getPromotionState(promotion);
        return promotion;
      });
    } catch (error) {
      return [];
    }
  }

  function saveLocalBusinessPromotion(payload) {
    var promotions = getLocalBusinessPromotions();
    var promotion = {
      promotion_id: 'LOCAL-PRO-' + Date.now(),
      title: payload.title || 'Promocion',
      description: payload.description || '',
      promotion_type: payload.promotion_type === 'surprise' ? 'surprise' : 'standard',
      type: payload.promotion_type === 'surprise' ? 'surprise_coupon' : 'promotion',
      surprise_enabled: Boolean(payload.surprise_enabled),
      coupon_label: payload.coupon_label || payload.title || '',
      start_date: payload.start_date || '',
      end_date: payload.end_date || '',
      status: 'active',
      created_at: new Date().toISOString()
    };

    promotion.visibility_status = getPromotionState(promotion);
    promotions.unshift(promotion);
    window.localStorage.setItem('loyalty_fallback_promotions', JSON.stringify(promotions.slice(0, 100)));
  }

  function updateLocalPromotionStatus(promotionId, status) {
    var promotions = getLocalBusinessPromotions().map(function(promotion) {
      if (promotion.promotion_id === promotionId) {
        promotion.status = status;
        promotion.visibility_status = getPromotionState(promotion);
      }

      return promotion;
    });

    window.localStorage.setItem('loyalty_fallback_promotions', JSON.stringify(promotions));
  }

  function getPromotionState(promotion) {
    var now = new Date();
    var start = promotion.start_date ? new Date(promotion.start_date) : null;
    var end = promotion.end_date ? new Date(promotion.end_date) : null;

    if (promotion.status === 'disabled') {
      return 'disabled';
    }

    if (start && !isNaN(start.getTime()) && now < start) {
      return 'scheduled';
    }

    if (end && !isNaN(end.getTime()) && now > end) {
      return 'expired';
    }

    return 'active';
  }

  function isNotImplemented(result, action) {
    var message = String(result && result.message || '').toLowerCase();
    var error = String(result && result.error || '').toLowerCase();
    var actionName = String(action || '').toLowerCase();

    return error === 'not_implemented' || (message.indexOf('accion no implementada') !== -1 && message.indexOf(actionName) !== -1);
  }

  function progressText(card, program) {
    var type = String(program && program.program_type || 'STAMPS').toUpperCase();

    if (type === 'POINTS') {
      return (card.points || 0) + ' puntos';
    }

    if (type === 'VISITS') {
      return (card.visits || 0) + ' / ' + (card.goal || 10) + ' visitas';
    }

    return (card.stamps || 0) + ' / ' + (card.goal || 10) + ' sellos';
  }

  function promotionStateLabel(state) {
    if (state === 'scheduled') {
      return 'Programada';
    }

    if (state === 'expired') {
      return 'Finalizada';
    }

    if (state === 'disabled') {
      return 'Deshabilitada';
    }

    return 'Activa';
  }

  function formatDateValue(value) {
    return value ? AppUtils.formatDate(value) : 'Sin fecha';
  }

  function setThemeColor(name, value) {
    document.documentElement.style.setProperty(name, value);
    document.body.style.setProperty(name, value);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      AppUtils.toast('Link copiado.', 'success');
    } catch (error) {
      window.prompt('Copia este link', text);
    }
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

  function paintPreviewBeans(goal) {
    var container = AppUtils.qs('[data-preview-beans]');
    var total = Math.max(1, Math.min(20, parseInt(goal || '10', 10) || 10));
    var html = '';

    if (!container) {
      return;
    }

    for (var index = 0; index < total; index += 1) {
      html += '<span class="coffee-bean is-empty"></span>';
    }

    container.innerHTML = html;
  }

  function initials(value) {
    return String(value || 'L')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function(part) { return part.charAt(0).toUpperCase(); })
      .join('') || 'L';
  }

  function renderLoading() {
    return '<div class="loader-list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
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

  window.BusinessApp = {
    init: init,
    initCustomers: initCustomers,
    initDashboard: initDashboard,
    initPromotions: initPromotions
  };
})();
