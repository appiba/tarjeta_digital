(function() {
  function init() {
    AppUtils.mountIcons();
  }

  async function initCard() {
    init();

    var cardId = getCardId();

    if (!cardId) {
      AppUtils.toast('Falta el codigo de la tarjeta.', 'error');
      return;
    }

    try {
      var result = await AppAPI.apiRequest('getPublicCard', {
        card_id: cardId
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo cargar la tarjeta.');
      }

      paintCard(result.data);
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    }
  }

  function paintCard(data) {
    var business = data.business || {};
    var customer = data.customer || {};
    var card = data.card || {};
    var program = data.program || {};
    var reward = data.reward || {};
    var label = labelProgramType(program.program_type);
    var left = Math.max(0, (card.goal || 0) - (card.current || 0));

    setThemeColor('--primary', business.primary_color || '#1f5eff');
    setThemeColor('--secondary', business.secondary_color || '#12b981');

    setText('[data-business-initials]', initials(business.business_name || 'Loyalty'));
    setText('[data-business-name]', business.business_name || 'Loyalty');
    setText('[data-business-type]', business.business_type || 'Tarjeta digital');
    setText('[data-customer-name]', customer.full_name || 'Cliente');
    setText('[data-progress-label]', (card.current || 0) + ' de ' + (card.goal || 10) + ' ' + label);
    setText('[data-progress-percent]', (card.progress_percent || 0) + '%');
    setText('[data-progress-left]', left > 0 ? 'Te faltan ' + left + ' ' + label + ' para tu premio.' : 'Ya puedes solicitar tu premio en el local.');
    setText('[data-reward-name]', reward.name || 'Premio especial');
    paintProgressBeans(card.current || 0, card.goal || 10);
    AppUtils.mountIcons();
  }

  function paintProgressBeans(current, goal) {
    var container = AppUtils.qs('[data-progress-beans]');
    var total = Math.max(1, Math.min(20, parseInt(goal || '10', 10) || 10));
    var filled = Math.max(0, Math.min(total, parseInt(current || '0', 10) || 0));
    var html = '';

    if (!container) {
      return;
    }

    for (var index = 0; index < total; index += 1) {
      html += '<span class="coffee-bean' + (index >= filled ? ' is-empty' : '') + '"></span>';
    }

    container.innerHTML = html;
  }

  function getCardId() {
    var params = new URLSearchParams(window.location.search);
    return String(params.get('card') || '').trim();
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

  window.ClientApp = {
    init: init,
    initCard: initCard
  };
})();
