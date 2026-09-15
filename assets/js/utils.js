(function() {
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function toast(message, type) {
    var stack = qs('[data-toast-stack]');

    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('data-toast-stack', '');
      document.body.appendChild(stack);
    }

    var item = document.createElement('div');
    item.className = 'toast toast--' + (type || 'info');
    item.textContent = message;
    stack.appendChild(item);

    window.setTimeout(function() {
      item.remove();
    }, 4200);
  }

  function setButtonLoading(button, isLoading, label) {
    if (!button) {
      return;
    }

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = label || 'Procesando...';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function formatDate(value) {
    if (!value) {
      return '';
    }

    var date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }

  function mountIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  window.AppUtils = {
    qs: qs,
    qsa: qsa,
    toast: toast,
    setButtonLoading: setButtonLoading,
    formatDate: formatDate,
    mountIcons: mountIcons
  };
})();
