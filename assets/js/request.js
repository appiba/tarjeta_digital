(function() {
  function initBusinessRequestForm() {
    var form = AppUtils.qs('[data-business-request-form]');
    var warning = AppUtils.qs('[data-api-warning]');

    if (!AppAPI.isConfigured() && warning) {
      warning.classList.add('is-visible');
    }

    if (!form) {
      return;
    }

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      var button = form.querySelector('button[type="submit"]');
      var formData = new FormData(form);

      AppUtils.setButtonLoading(button, true, 'Enviando...');

      try {
        var result = await AppAPI.apiRequest('registerBusiness', {
          business_name: formData.get('business_name'),
          owner_name: formData.get('owner_name'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          whatsapp: formData.get('whatsapp'),
          city: formData.get('city'),
          address: formData.get('address'),
          business_type: formData.get('business_type'),
          primary_color: formData.get('primary_color'),
          secondary_color: formData.get('secondary_color'),
          loyalty_type: formData.get('loyalty_type'),
          suggested_goal: formData.get('suggested_goal'),
          suggested_reward: formData.get('suggested_reward')
        });

        if (!result.success) {
          throw new Error(result.message || 'No se pudo enviar la solicitud.');
        }

        form.reset();
        showSuccess(result.data);
        AppUtils.toast('Solicitud enviada.', 'success');
      } catch (error) {
        AppUtils.toast(error.message, 'error');
      } finally {
        AppUtils.setButtonLoading(button, false);
      }
    });
  }

  function showSuccess(data) {
    var box = AppUtils.qs('[data-request-success]');

    if (!box) {
      return;
    }

    box.hidden = false;
    box.innerHTML = '<h2>Solicitud recibida</h2>' +
      '<p>Tu solicitud quedo con estado <strong>' + escapeHtml(data.status) + '</strong>. Cuando el administrador la apruebe recibiras el acceso por correo y WhatsApp.</p>' +
      '<p><strong>ID:</strong> ' + escapeHtml(data.request_id) + '</p>';
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.RequestApp = {
    initBusinessRequestForm: initBusinessRequestForm
  };
})();
