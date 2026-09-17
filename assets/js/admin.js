(function() {
  async function init(pageName) {
    Auth.bindLogout();
    var context = await Auth.protectPage(['super_admin']);

    if (!context) {
      return;
    }

    var pageLabel = AppUtils.qs('[data-page-label]');
    if (pageLabel) {
      pageLabel.textContent = pageName || 'Dashboard';
    }

    var configured = AppUtils.qs('[data-api-state]');
    if (configured) {
      configured.textContent = 'API conectada y sesion validada';
    }

    AppUtils.mountIcons();
    return context;
  }

  async function initDashboard() {
    var context = await init('Dashboard');

    if (!context) {
      return;
    }

    try {
      var result = await AppAPI.apiRequest('getAdminStats');

      if (!result.success) {
        throw new Error(result.message || 'No se pudieron cargar estadisticas.');
      }

      setText('[data-stat="active_businesses"]', result.data.active_businesses);
      setText('[data-stat="pending_requests"]', result.data.pending_requests);
      setText('[data-stat="total_customers"]', result.data.total_customers);
      setText('[data-stat="total_transactions"]', result.data.total_transactions);
      setText('[data-stat="redeemed_rewards"]', result.data.redeemed_rewards);
      setText('[data-stat="suspended_businesses"]', result.data.suspended_businesses);
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    }
  }

  async function initRequests() {
    var context = await init('Solicitudes');

    if (!context) {
      return;
    }

    await loadRequests();
  }

  async function loadRequests() {
    var container = AppUtils.qs('[data-requests-list]');

    if (!container) {
      return;
    }

    container.innerHTML = renderSkeletonList(3);

    try {
      var result = await AppAPI.apiRequest('getRequests', {});

      if (!result.success) {
        throw new Error(result.message || 'No se pudieron cargar solicitudes.');
      }

      var requests = result.data.requests || [];

      if (requests.length === 0) {
        container.innerHTML = renderEmptyState('inbox', 'Sin solicitudes', 'Cuando un negocio envie una solicitud aparecera aqui.');
        AppUtils.mountIcons();
        return;
      }

      container.innerHTML = requests.map(renderRequestCard).join('');
      bindRequestActions(container);
      AppUtils.mountIcons();
    } catch (error) {
      container.innerHTML = '<article class="panel-card"><h2>Error</h2><p>' + escapeHtml(error.message) + '</p></article>';
    }
  }

  function renderRequestCard(request) {
    var createdAt = AppUtils.formatDate(request.created_at);
    var colors = '<span class="color-dot" style="background:' + escapeAttr(request.primary_color || '#1f5eff') + '"></span>' +
      '<span class="color-dot" style="background:' + escapeAttr(request.secondary_color || '#12b981') + '"></span>';
    var actions = '';

    if (request.status === 'pending') {
      actions = '<div class="request-card__actions">' +
        '<button class="button button--primary" type="button" data-approve-request="' + escapeAttr(request.request_id) + '"><i data-lucide="check"></i>Aprobar</button>' +
        '<button class="button button--ghost" type="button" data-reject-request="' + escapeAttr(request.request_id) + '"><i data-lucide="x"></i>Rechazar</button>' +
        '</div>';
    }

    return '<article class="request-card">' +
      '<div class="request-card__main">' +
        '<div>' +
          '<span class="badge" data-status="' + escapeAttr(request.status) + '">' + escapeHtml(statusLabel(request.status)) + '</span>' +
          '<h2>' + escapeHtml(request.business_name) + '</h2>' +
          '<p>' + escapeHtml(request.business_type || 'Negocio') + ' en ' + escapeHtml(request.city || 'sin ciudad') + '</p>' +
        '</div>' +
        '<div class="request-card__colors" aria-label="Colores">' + colors + '</div>' +
      '</div>' +
      '<dl class="request-card__details">' +
        '<div><dt>Propietario</dt><dd>' + escapeHtml(request.owner_name) + '</dd></div>' +
        '<div><dt>Correo</dt><dd>' + escapeHtml(request.email) + '</dd></div>' +
        '<div><dt>WhatsApp</dt><dd>' + escapeHtml(request.whatsapp) + '</dd></div>' +
        '<div><dt>Programa</dt><dd>' + escapeHtml(request.loyalty_type) + ' / meta ' + escapeHtml(request.suggested_goal) + '</dd></div>' +
        '<div><dt>Premio</dt><dd>' + escapeHtml(request.suggested_reward) + '</dd></div>' +
        '<div><dt>Clave panel</dt><dd>' + escapeHtml(request.has_owner_password ? 'Definida por propietario' : 'Temporal al aprobar') + '</dd></div>' +
        '<div><dt>Fecha</dt><dd>' + escapeHtml(createdAt) + '</dd></div>' +
      '</dl>' +
      actions +
      '</article>';
  }

  function bindRequestActions(container) {
    AppUtils.qsa('[data-approve-request]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        approveRequest(button.dataset.approveRequest, button);
      });
    });

    AppUtils.qsa('[data-reject-request]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        rejectRequest(button.dataset.rejectRequest, button);
      });
    });
  }

  async function approveRequest(requestId, button) {
    if (!window.confirm('Aprobar esta solicitud y crear acceso para el negocio?')) {
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Aprobando...');

    try {
      var result = await AppAPI.apiRequest('approveBusiness', {
        request_id: requestId
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo aprobar.');
      }

      showApprovalResult(result.data);
      openApprovalWhatsApp(result.data);
      AppUtils.toast('Negocio aprobado.', 'success');
      await loadRequests();
    } catch (error) {
      AppUtils.toast(error.message, 'error');
      AppUtils.setButtonLoading(button, false);
    }
  }

  async function rejectRequest(requestId, button) {
    var reason = window.prompt('Motivo de rechazo');

    if (!reason) {
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Rechazando...');

    try {
      var result = await AppAPI.apiRequest('rejectBusiness', {
        request_id: requestId,
        rejection_reason: reason
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo rechazar.');
      }

      AppUtils.toast('Solicitud rechazada.', 'success');
      await loadRequests();
    } catch (error) {
      AppUtils.toast(error.message, 'error');
      AppUtils.setButtonLoading(button, false);
    }
  }

  function showApprovalResult(data) {
    var box = AppUtils.qs('[data-approval-result]');

    if (!box) {
      return;
    }

    var businessLoginUrl = data.business_login_url || '';
    var customerRegisterUrl = data.customer_register_url || data.register_url || '';
    var emailStatus = data.email_sent ? 'Correo enviado' : 'Correo pendiente';
    var ownerPasswordMode = data.owner && data.owner.password_mode === 'chosen' ? 'chosen' : 'temporary';
    var ownerPasswordLabel = ownerPasswordMode === 'chosen' ? 'Clave' : 'Contrasena temporal';
    var ownerPasswordValue = ownerPasswordMode === 'chosen' ?
      'Usa la clave que creo en la solicitud' :
      (data.owner && data.owner.temporary_password ? data.owner.temporary_password : '');
    var whatsappButton = data.whatsapp_url ?
      '<a class="button button--primary" href="' + escapeAttr(data.whatsapp_url) + '" target="_blank" rel="noopener">Abrir WhatsApp</a>' :
      '';

    box.hidden = false;
    box.innerHTML = '<h2>Acceso creado</h2>' +
      '<p>Entrega estos datos al propietario del negocio. Si la solicitud ya traia clave, el propietario entra con esa misma clave.</p>' +
      '<ul class="route-list">' +
        '<li><span>Negocio</span><strong>' + escapeHtml(data.business.business_name) + '</strong></li>' +
        '<li><span>Codigo</span><strong>' + escapeHtml(data.business.business_code) + '</strong></li>' +
        '<li><span>Correo</span><strong>' + escapeHtml(data.owner.email) + '</strong></li>' +
        '<li><span>' + escapeHtml(ownerPasswordLabel) + '</span><strong>' + escapeHtml(ownerPasswordValue) + '</strong></li>' +
        '<li><span>Panel negocio</span><strong>' + escapeHtml(businessLoginUrl || 'Configura APP_URL') + '</strong></li>' +
        '<li><span>Link clientes</span><strong>' + escapeHtml(customerRegisterUrl || 'Configura APP_URL') + '</strong></li>' +
        '<li><span>Correo automatico</span><strong>' + escapeHtml(emailStatus) + '</strong></li>' +
      '</ul>' +
      '<div class="approval-actions">' +
        whatsappButton +
        '<button class="button button--ghost" type="button" data-copy-approval>Copiar mensaje</button>' +
      '</div>';

    var copyButton = AppUtils.qs('[data-copy-approval]', box);
    if (copyButton) {
      copyButton.addEventListener('click', function() {
        copyToClipboard(data.whatsapp_message || buildApprovalText(data));
      });
    }
  }

  function openApprovalWhatsApp(data) {
    if (data && data.whatsapp_url) {
      window.open(data.whatsapp_url, '_blank', 'noopener');
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      AppUtils.toast('Mensaje copiado.', 'success');
    } catch (error) {
      window.prompt('Copia este mensaje', text);
    }
  }

  function buildApprovalText(data) {
    return [
      'Cuenta activa en Loyalty',
      'Panel: ' + (data.business_login_url || ''),
      'Correo: ' + (data.owner && data.owner.email ? data.owner.email : ''),
      (data.owner && data.owner.password_mode === 'chosen' ?
        'Clave: usa la clave creada al enviar la solicitud' :
        'Contrasena temporal: ' + (data.owner && data.owner.temporary_password ? data.owner.temporary_password : '')),
      'Link clientes: ' + (data.customer_register_url || data.register_url || '')
    ].join('\n');
  }

  async function initBusinesses() {
    var context = await init('Negocios');

    if (!context) {
      return;
    }

    var container = AppUtils.qs('[data-businesses-list]');

    if (!container) {
      return;
    }

    container.innerHTML = renderSkeletonList(3);

    try {
      var result = await AppAPI.apiRequest('listBusinesses', {});

      if (!result.success) {
        throw new Error(result.message || 'No se pudieron cargar negocios.');
      }

      var businesses = result.data.businesses || [];

      if (businesses.length === 0) {
        container.innerHTML = renderEmptyState('store', 'Aun no hay negocios', 'Aprueba una solicitud para crear el primer negocio.');
        AppUtils.mountIcons();
        return;
      }

      container.innerHTML = businesses.map(renderBusinessCard).join('');
      bindBusinessActions(container);
      AppUtils.mountIcons();
    } catch (error) {
      container.innerHTML = '<article class="panel-card"><h2>Error</h2><p>' + escapeHtml(error.message) + '</p></article>';
    }
  }

  async function initCustomers() {
    var context = await init('Clientes');

    if (!context) {
      return;
    }

    var container = AppUtils.qs('[data-admin-customers-list]');

    if (!container) {
      return;
    }

    container.innerHTML = renderSkeletonList(3);

    try {
      var result = await AppAPI.apiRequest('listAdminCustomers', {});

      if (!result.success) {
        throw new Error(result.message || 'No se pudieron cargar clientes.');
      }

      var customers = result.data.customers || [];

      if (customers.length === 0) {
        container.innerHTML = renderEmptyState('users', 'Aun no hay clientes', 'Cuando los negocios registren clientes reales, apareceran en esta vista global.');
        AppUtils.mountIcons();
        return;
      }

      container.innerHTML = customers.map(renderAdminCustomer).join('');
      AppUtils.mountIcons();
    } catch (error) {
      container.innerHTML = '<article class="panel-card"><h2>Error</h2><p>' + escapeHtml(error.message) + '</p></article>';
    }
  }

  function renderAdminCustomer(item) {
    var customer = item.customer || {};
    var businesses = item.businesses || [];
    var names = businesses.map(function(business) {
      return business.business_name;
    }).filter(Boolean).join(', ');

    return '<article class="request-card">' +
      '<div class="request-card__main">' +
        '<div><span class="badge">Wallet</span><h2>' + escapeHtml(customer.full_name || 'Cliente') + '</h2><p>' + escapeHtml(customer.phone || '') + '</p></div>' +
        '<strong>' + escapeHtml((item.card_count || 0) + ' tarjetas') + '</strong>' +
      '</div>' +
      '<dl class="request-card__details">' +
        '<div><dt>Wallet</dt><dd>' + escapeHtml(customer.wallet_id || '') + '</dd></div>' +
        '<div><dt>Correo</dt><dd>' + escapeHtml(customer.email || 'Sin correo') + '</dd></div>' +
        '<div><dt>Negocios</dt><dd>' + escapeHtml(names || 'Sin negocios') + '</dd></div>' +
        '<div><dt>Estado</dt><dd>' + escapeHtml(customer.status || '') + '</dd></div>' +
      '</dl>' +
      '</article>';
  }

  function renderBusinessCard(business) {
    var isSuspended = business.status === 'suspended';
    var whatsappButton = business.payment_whatsapp_url ?
      '<a class="button button--primary" href="' + escapeAttr(business.payment_whatsapp_url) + '" target="_blank" rel="noopener"><i data-lucide="message-circle"></i>WSS cobro</a>' :
      '<button class="button button--ghost" type="button" disabled><i data-lucide="message-circle"></i>Sin WhatsApp</button>';
    var paymentAction = isSuspended ?
      '<button class="button button--success" type="button" data-reactivate-business="' + escapeAttr(business.business_id) + '"><i data-lucide="badge-check"></i>Reactivar</button>' :
      '<button class="button button--danger" type="button" data-suspend-business-payment="' + escapeAttr(business.business_id) + '"><i data-lucide="ban"></i>Suspender por pago</button>';

    return '<article class="request-card">' +
      '<div class="request-card__main">' +
        '<div><span class="badge" data-status="' + escapeAttr(business.status) + '">' + escapeHtml(statusLabel(business.status)) + '</span><h2>' + escapeHtml(business.business_name) + '</h2><p>' + escapeHtml(business.business_type || '') + '</p></div>' +
        '<strong class="business-code">' + escapeHtml(business.business_code) + '</strong>' +
      '</div>' +
      '<dl class="request-card__details">' +
        '<div><dt>Correo</dt><dd>' + escapeHtml(business.email) + '</dd></div>' +
        '<div><dt>WhatsApp</dt><dd>' + escapeHtml(business.whatsapp) + '</dd></div>' +
        '<div><dt>Ciudad</dt><dd>' + escapeHtml(business.city) + '</dd></div>' +
        '<div><dt>Plan</dt><dd>' + escapeHtml(business.plan) + '</dd></div>' +
        '<div><dt>Cobro</dt><dd>' + escapeHtml(billingCycleLabel(business.billing_cycle)) + '</dd></div>' +
        '<div><dt>Estado pago</dt><dd>' + escapeHtml(billingStatusLabel(business.billing_status)) + '</dd></div>' +
        '<div><dt>Proximo pago</dt><dd>' + escapeHtml(formatPaymentDate(business.next_payment_date)) + '</dd></div>' +
        (business.suspended_reason ? '<div><dt>Motivo suspension</dt><dd>' + escapeHtml(business.suspended_reason) + '</dd></div>' : '') +
      '</dl>' +
      '<div class="request-card__actions">' +
        whatsappButton +
        '<button class="button button--ghost" type="button" data-configure-billing="' + escapeAttr(business.business_id) + '" data-billing-cycle="' + escapeAttr(business.billing_cycle || 'monthly') + '" data-next-payment="' + escapeAttr(business.next_payment_date || '') + '"><i data-lucide="calendar-clock"></i>Configurar pago</button>' +
        paymentAction +
        '<button class="button button--ghost" type="button" data-reset-owner-password="' + escapeAttr(business.business_id) + '"><i data-lucide="key-round"></i>Restablecer clave</button>' +
      '</div>' +
      '</article>';
  }

  function bindBusinessActions(container) {
    AppUtils.qsa('[data-configure-billing]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        configureBusinessBilling(button.dataset.configureBilling, button);
      });
    });

    AppUtils.qsa('[data-suspend-business-payment]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        suspendBusinessPayment(button.dataset.suspendBusinessPayment, button);
      });
    });

    AppUtils.qsa('[data-reactivate-business]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        reactivateBusiness(button.dataset.reactivateBusiness, button);
      });
    });

    AppUtils.qsa('[data-reset-owner-password]', container).forEach(function(button) {
      button.addEventListener('click', function() {
        resetOwnerPassword(button.dataset.resetOwnerPassword, button);
      });
    });
  }

  async function configureBusinessBilling(businessId, button) {
    var rawCycle = window.prompt('Tipo de cobro: mensual o anual', button.dataset.billingCycle === 'yearly' ? 'anual' : 'mensual');

    if (!rawCycle) {
      return;
    }

    var cycle = normalizeBillingCycle(rawCycle);
    var nextPayment = window.prompt('Proximo pago en formato YYYY-MM-DD', button.dataset.nextPayment || '');

    if (nextPayment === null) {
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Guardando...');

    try {
      var result = await AppAPI.apiRequest('setBusinessBilling', {
        business_id: businessId,
        billing_cycle: cycle,
        billing_status: 'current',
        next_payment_date: nextPayment
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo configurar el pago.');
      }

      showAdminMessageResult('Cobro configurado', result.data.whatsapp_message, result.data.whatsapp_url);
      AppUtils.toast('Cobro actualizado.', 'success');
      await initBusinesses();
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  async function suspendBusinessPayment(businessId, button) {
    var reason = window.prompt('Motivo de suspension', 'Pago pendiente de mensualidad o anualidad.');

    if (!reason) {
      return;
    }

    if (!window.confirm('Suspender este negocio y bloquear su acceso al panel?')) {
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Suspendiendo...');

    try {
      var result = await AppAPI.apiRequest('suspendBusinessForPayment', {
        business_id: businessId,
        reason: reason
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo suspender.');
      }

      showAdminMessageResult('Negocio suspendido', result.data.whatsapp_message, result.data.whatsapp_url);
      openAdminWhatsApp(result.data.whatsapp_url);
      AppUtils.toast('Negocio suspendido.', 'success');
      await initBusinesses();
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  async function reactivateBusiness(businessId, button) {
    var rawCycle = window.prompt('Tipo de cobro para reactivar: mensual o anual', 'mensual');

    if (!rawCycle) {
      return;
    }

    var cycle = normalizeBillingCycle(rawCycle);
    var nextPayment = window.prompt('Proximo pago en formato YYYY-MM-DD', '');

    if (nextPayment === null) {
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Reactivando...');

    try {
      var result = await AppAPI.apiRequest('reactivateBusiness', {
        business_id: businessId,
        billing_cycle: cycle,
        next_payment_date: nextPayment
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo reactivar.');
      }

      showAdminMessageResult('Negocio reactivado', result.data.whatsapp_message, result.data.whatsapp_url);
      openAdminWhatsApp(result.data.whatsapp_url);
      AppUtils.toast('Negocio reactivado.', 'success');
      await initBusinesses();
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  async function resetOwnerPassword(businessId, button) {
    if (!window.confirm('Crear una clave temporal nueva para este negocio?')) {
      return;
    }

    AppUtils.setButtonLoading(button, true, 'Creando...');

    try {
      var result = await AppAPI.apiRequest('resetBusinessOwnerPassword', {
        business_id: businessId
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo restablecer la clave.');
      }

      showApprovalResult(result.data);
      openApprovalWhatsApp(result.data);
      AppUtils.toast('Clave temporal creada.', 'success');
    } catch (error) {
      AppUtils.toast(error.message, 'error');
    } finally {
      AppUtils.setButtonLoading(button, false);
    }
  }

  function showAdminMessageResult(title, message, whatsappUrl) {
    var box = AppUtils.qs('[data-approval-result]');

    if (!box) {
      return;
    }

    box.hidden = false;
    box.innerHTML = '<h2>' + escapeHtml(title || 'Mensaje listo') + '</h2>' +
      '<p>Mensaje preparado para el propietario del negocio.</p>' +
      '<ul class="route-list">' +
        '<li><span>Mensaje</span><strong>' + escapeHtml(message || '') + '</strong></li>' +
      '</ul>' +
      '<div class="approval-actions">' +
        (whatsappUrl ? '<a class="button button--primary" href="' + escapeAttr(whatsappUrl) + '" target="_blank" rel="noopener"><i data-lucide="message-circle"></i>Abrir WhatsApp</a>' : '') +
        '<button class="button button--ghost" type="button" data-copy-admin-message><i data-lucide="copy"></i>Copiar mensaje</button>' +
      '</div>';

    var copyButton = AppUtils.qs('[data-copy-admin-message]', box);
    if (copyButton) {
      copyButton.addEventListener('click', function() {
        copyToClipboard(message || '');
      });
    }

    AppUtils.mountIcons();
  }

  function openAdminWhatsApp(whatsappUrl) {
    if (whatsappUrl) {
      window.open(whatsappUrl, '_blank', 'noopener');
    }
  }

  function normalizeBillingCycle(value) {
    var text = String(value || '').trim().toLowerCase();

    if (text === 'anual' || text === 'ano' || text === 'año' || text === 'yearly') {
      return 'yearly';
    }

    return 'monthly';
  }

  function billingCycleLabel(value) {
    return normalizeBillingCycle(value) === 'yearly' ? 'Anual' : 'Mensual';
  }

  function billingStatusLabel(value) {
    var text = String(value || '').trim().toLowerCase();

    if (text === 'overdue') {
      return 'Vencido';
    }

    if (text === 'cancelled' || text === 'canceled') {
      return 'Cancelado';
    }

    return 'Al dia';
  }

  function formatPaymentDate(value) {
    return value ? AppUtils.formatDate(value) : 'Por definir';
  }

  function setText(selector, value) {
    var node = AppUtils.qs(selector);

    if (node) {
      node.textContent = value === undefined || value === null ? '0' : String(value);
    }
  }

  function renderSkeletonList(count) {
    var html = '<div class="loader-list">';

    for (var index = 0; index < count; index += 1) {
      html += '<div class="skeleton"></div>';
    }

    return html + '</div>';
  }

  function renderEmptyState(icon, title, message) {
    return '<article class="empty-state">' +
      '<div><i data-lucide="' + escapeAttr(icon) + '"></i><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(message) + '</p></div>' +
      '</article>';
  }

  function statusLabel(status) {
    var value = String(status || '').toLowerCase();

    if (value === 'pending') {
      return 'Pendiente';
    }

    if (value === 'approved') {
      return 'Aprobada';
    }

    if (value === 'rejected') {
      return 'Rechazada';
    }

    if (value === 'active') {
      return 'Activo';
    }

    if (value === 'suspended') {
      return 'Suspendido';
    }

    return status || '';
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

  window.AdminApp = {
    init: init,
    initBusinesses: initBusinesses,
    initCustomers: initCustomers,
    initDashboard: initDashboard,
    initRequests: initRequests
  };
})();
