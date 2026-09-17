(function() {
  async function init(pageName, roles) {
    Auth.bindLogout();
    var context = await Auth.protectPage(roles || ['business_owner', 'staff']);

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
        throw new Error(result.message || 'No se pudieron cargar clientes.');
      }

      var customers = result.data.customers || [];

      paintBusinessCustomers(customers);
      bindBusinessCustomerSearch(customers);
    } catch (error) {
      container.innerHTML = '<article class="panel-card"><h2>Error</h2><p>' + escapeHtml(error.message) + '</p></article>';
    }
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

    return '<article class="request-card" data-business-customer-card="' + escapeAttr(card.card_id || '') + '">' +
      '<div class="request-card__main">' +
        '<div><span class="badge">' + escapeHtml(labelProgramType(program.program_type)) + '</span><h2>' + escapeHtml(customer.full_name || 'Cliente') + '</h2><p>' + escapeHtml(customer.phone || '') + '</p></div>' +
        '<strong>' + escapeHtml(progressText(card, program)) + '</strong>' +
      '</div>' +
      '<dl class="request-card__details">' +
        '<div><dt>Wallet</dt><dd>' + escapeHtml(customer.wallet_id || '') + '</dd></div>' +
        '<div><dt>Tarjeta</dt><dd>' + escapeHtml(card.card_id || '') + '</dd></div>' +
        '<div><dt>Bienvenida</dt><dd>' + escapeHtml(welcome.enabled ? welcome.status : 'none') + '</dd></div>' +
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
        return [customer.full_name, customer.phone, customer.email, customer.wallet_id, card.card_id].join(' ').toLowerCase().indexOf(query) !== -1;
      });

      paintBusinessCustomers(filtered);
    });
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
    initDashboard: initDashboard
  };
})();
