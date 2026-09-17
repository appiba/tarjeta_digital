(function() {
  var currentCard = null;

  function initScanner(context) {
    var form = AppUtils.qs('[data-wallet-scan-form]');
    var walletFromUrl = new URLSearchParams(window.location.search).get('wallet');

    setState('Escanea o pega el QR general de Wallet del cliente.');

    if (form) {
      form.addEventListener('submit', function(event) {
        event.preventDefault();
        var formData = new FormData(form);
        scanWallet(formData.get('wallet'));
      });
    }

    if (walletFromUrl && form) {
      var input = form.querySelector('[name="wallet"]');
      input.value = walletFromUrl;
      scanWallet(walletFromUrl);
    }

    AppUtils.mountIcons();
  }

  async function scanWallet(wallet, createIfMissing) {
    var button = AppUtils.qs('[data-wallet-scan-form] button[type="submit"]');

    AppUtils.setButtonLoading(button, true, 'Buscando...');

    try {
      var result = await AppAPI.apiRequest('scanWallet', {
        wallet: wallet,
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

    if (!data.has_card) {
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
    container.innerHTML = '<h2>' + escapeHtml(customer.full_name || 'Cliente') + '</h2>' +
      '<p>' + escapeHtml(business.business_name || 'Mi negocio') + '</p>' +
      '<div class="settings-list">' +
        '<div><span>Sellos</span><strong>' + escapeHtml(card.stamps || 0) + '</strong></div>' +
        '<div><span>Puntos</span><strong>' + escapeHtml(card.points || 0) + '</strong></div>' +
        '<div><span>Visitas</span><strong>' + escapeHtml(card.visits || 0) + '</strong></div>' +
        '<div><span>Progreso</span><strong>' + escapeHtml(card.progress_percent || 0) + '%</strong></div>' +
        '<div><span>Bienvenida</span><strong>' + escapeHtml(welcome.enabled ? statusLabel(welcome.status) : 'No configurado') + '</strong></div>' +
      '</div>' +
      '<div class="client-action-grid" style="margin-top:16px;">' +
        '<button class="button button--primary" type="button" data-card-action="add_stamp">+1 Sello</button>' +
        '<button class="button button--ghost" type="button" data-card-action="add_visit">+1 Visita</button>' +
        '<button class="button button--ghost" type="button" data-card-action="add_points">Agregar puntos</button>' +
        '<button class="button button--warning" type="button" data-card-action="redeem_welcome_reward"' + (welcome.status === 'available' ? '' : ' disabled') + '>Canjear bienvenida</button>' +
      '</div>' +
      '<div class="client-list scanner-history">' + renderHistory(data.history || []) + '</div>';

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
  }

  async function applyAction(action, button) {
    if (!currentCard || !currentCard.card_id) {
      return;
    }

    var amount = '';

    if (action === 'add_points') {
      amount = window.prompt('Cuantos puntos deseas agregar?', '1');

      if (!amount) {
        return;
      }
    }

    AppUtils.setButtonLoading(button, true, 'Guardando...');

    try {
      var result = await AppAPI.apiRequest('applyBusinessCustomerAction', {
        card_id: currentCard.card_id,
        action: action,
        amount: amount
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo registrar.');
      }

      paintResult({
        customer: result.data.customer,
        business: {},
        has_card: true,
        card: result.data.card,
        program: result.data.program,
        welcome_reward: result.data.welcome_reward,
        history: result.data.history
      });
      AppUtils.toast('Movimiento registrado.', 'success');
    } catch (error) {
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

    return item.notes || item.type || 'Movimiento';
  }

  function setState(message) {
    AppUtils.qsa('[data-scanner-state]').forEach(function(node) {
      node.textContent = message;
    });
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

  window.ScannerApp = {
    initScanner: initScanner
  };
})();
