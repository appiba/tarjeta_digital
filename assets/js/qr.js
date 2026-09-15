(function() {
  function buildRegisterUrl(businessCode) {
    var root = document.body.dataset.root || '';
    var registerUrl = new URL(root + 'register/', window.location.href);
    registerUrl.searchParams.set('business', businessCode);

    return registerUrl.href;
  }

  window.QRTools = {
    buildRegisterUrl: buildRegisterUrl
  };
})();
