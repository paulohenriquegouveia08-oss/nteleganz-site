/**
 * NT Eleganz — Bridge de Checkout Oficial
 * Redireciona para a página dedicada /checkout/
 */
(function () {
  'use strict';
  window.nteCheckout = {
    open: function () {
      window.location.href = '/checkout/';
    }
  };
})();
