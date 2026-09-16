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
    var node = AppUtils.qs(selector);

    if (node) {
      node.textContent = value === undefined || value === null ? '' : String(value);
    }
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

  function initials(value) {
    return String(value || 'L')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function(part) { return part.charAt(0).toUpperCase(); })
      .join('') || 'L';
  }

  window.BusinessApp = {
    init: init,
    initDashboard: initDashboard
  };
})();
