(function() {
  var currentBusinessCode = '';

  async function init() {
    AppUtils.mountIcons();
    currentBusinessCode = getBusinessCode();

    if (!currentBusinessCode) {
      setState('Falta el codigo del negocio en el link.');
      return;
    }

    await loadBusiness();
    bindForm();
  }

  async function loadBusiness() {
    try {
      var result = await AppAPI.apiRequest('getPublicBusiness', {
        business_code: currentBusinessCode
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo cargar el negocio.');
      }

      var business = result.data.business || {};
      var reward = result.data.reward || {};
      var program = result.data.program || {};

      setThemeColor('--primary', business.primary_color || '#2563eb');
      setThemeColor('--secondary', business.secondary_color || '#0f766e');
      setText('[data-register-initials]', initials(business.business_name || 'Loyalty'));
      setText('[data-register-business]', business.business_name || 'Loyalty');
      setText('[data-register-type]', business.business_type || 'Clientes mas cerca');
      setState('Tarjeta de ' + (business.business_name || 'este negocio') + '. Meta: ' + (program.goal || '10') + '. Premio: ' + (reward.name || 'Premio especial') + '.');
      showForm(true);
    } catch (error) {
      setState(error.message);
    }
  }

  function bindForm() {
    var form = AppUtils.qs('[data-register-customer-form]');

    if (!form) {
      return;
    }

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      var button = form.querySelector('button[type="submit"]');
      var formData = new FormData(form);

      AppUtils.setButtonLoading(button, true, 'Creando...');

      try {
        var result = await AppAPI.apiRequest('registerCustomer', {
          business_code: currentBusinessCode,
          full_name: formData.get('full_name'),
          phone: formData.get('phone'),
          email: formData.get('email')
        });

        if (!result.success) {
          throw new Error(result.message || 'No se pudo crear la tarjeta.');
        }

        showResult(result.data);
        AppUtils.toast('Tarjeta creada.', 'success');
      } catch (error) {
        AppUtils.toast(error.message, 'error');
      } finally {
        AppUtils.setButtonLoading(button, false);
      }
    });
  }

  function showResult(data) {
    var box = AppUtils.qs('[data-register-result]');
    var form = AppUtils.qs('[data-register-customer-form]');

    if (!box) {
      return;
    }

    if (form) {
      form.hidden = true;
    }

    box.hidden = false;
    box.innerHTML = '<h2>Tarjeta creada</h2>' +
      '<p>Guarda este enlace para ver tu tarjeta digital.</p>' +
      '<ul class="route-list">' +
        '<li><span>Negocio</span><strong>' + escapeHtml(data.business.business_name) + '</strong></li>' +
        '<li><span>Cliente</span><strong>' + escapeHtml(data.customer.full_name) + '</strong></li>' +
        '<li><span>Tarjeta</span><strong>' + escapeHtml(data.card.card_id) + '</strong></li>' +
      '</ul>' +
      '<div class="approval-actions">' +
        '<a class="button button--primary" href="' + escapeAttr(data.card_url) + '">Ver mi tarjeta</a>' +
        '<button class="button button--ghost" type="button" data-copy-card-link>Copiar link</button>' +
      '</div>';

    var copyButton = AppUtils.qs('[data-copy-card-link]', box);
    if (copyButton) {
      copyButton.addEventListener('click', function() {
        copyToClipboard(data.card_url);
      });
    }

    AppUtils.mountIcons();
  }

  function showForm(visible) {
    var form = AppUtils.qs('[data-register-customer-form]');

    if (form) {
      form.hidden = !visible;
    }
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

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      AppUtils.toast('Link copiado.', 'success');
    } catch (error) {
      window.prompt('Copia este link', text);
    }
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
