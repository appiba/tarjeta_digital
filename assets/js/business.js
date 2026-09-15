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
  }

  window.BusinessApp = {
    init: init
  };
})();
