/* ============================================
   NT ELEGANZ — WHATSAPP LOGIC
   ============================================ */

const DEFAULT_WHATSAPP_NUMBER = '5575999283496';
let whatsappNumber = DEFAULT_WHATSAPP_NUMBER;

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '') || DEFAULT_WHATSAPP_NUMBER;
}

function loadConfiguredNumber() {
  try {
    const settings = JSON.parse(localStorage.getItem('nte_wpp_settings') || '{}');
    whatsappNumber = normalizePhoneNumber(settings.number);
  } catch { whatsappNumber = DEFAULT_WHATSAPP_NUMBER; }
}

/**
 * Generates a WhatsApp URL with a pre-filled message
 * @param {string} message - The message to pre-fill
 * @returns {string} - The WhatsApp URL
 */
function generateWhatsAppUrl(message) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function registerLead(data) {
  const lead = {
    source: 'whatsapp',
    status: 'novo',
    readAt: null,
    page: `${location.pathname}${location.search}`,
    ...data,
  };
  // The popup is opened synchronously by the caller; tracking must never stop contact.
  Promise.resolve(window.ntDB?.init())
    .then(() => window.ntDB?.leads?.add(lead))
    .catch(error => console.warn('Não foi possível registrar o lead:', error));
}

function registerOrder(data) {
  const order = {
    source: 'site',
    status: 'novo',
    client: 'Cliente do site',
    phone: '',
    size: '',
    color: '',
    ...data,
  };
  // The popup is opened synchronously by the caller; registering the order must
  // never block contact. Failures are silent (e.g. when the storefront is offline).
  Promise.resolve(window.ntDB?.init())
    .then(() => window.ntDB?.orders?.submit(order))
    .catch(error => {
      console.error('Falha ao registrar pedido via WhatsApp:', error);
      // Toast visível se houver admin logado
      if (window.showToast) showToast('⚠', 'Pedido não salvo', error.message);
    });
}

/**
 * Opens WhatsApp with a direct greeting message
 */
function openWhatsAppGreeting() {
  const message = `Olá! Vim pelo site da NT Eleganz e gostaria de saber mais sobre os produtos. 😊`;
  window.open(generateWhatsAppUrl(message), '_blank');
  registerLead({ type: 'atendimento', messagePreview: message });
}

/**
 * Opens WhatsApp with a specific product inquiry
 * @param {Object} product - The product object
 * @param {string} size - Selected size
 * @param {string} color - Selected color
 */
function orderProductViaWhatsApp(product, size = null, color = null, qty = null) {
  const quantity = Math.max(1, Math.floor(Number(qty) || 1));
  let message = `Olá! Quero fechar o pedido:\n\n`;
  message += `• *${product.brand} — ${product.name}*\n`;
  if (size) message += `  Tamanho: ${size}\n`;
  if (color) message += `  Cor: ${color}\n`;
  if (quantity > 1) message += `  Quantidade: ${quantity}\n`;
  message += `  Preço: ${product.price}\n\n`;
  message += `Poderia me dar mais detalhes sobre disponibilidade e envio? 🙏`;
  window.open(generateWhatsAppUrl(message), '_blank');
  registerLead({
    type: 'produto',
    productId: product?.id || '',
    productName: product?.name || '',
    productBrand: product?.brand || '',
    size: size || '',
    color: color || '',
    quantity: quantity,
    value: product?.price || '',
    messagePreview: message,
  });
  registerOrder({
    productId: product?.id || '',
    productBrand: product?.brand || '',
    productName: product?.name || '',
    size: size || '',
    color: color || '',
    value: product?.price || '',
    notes: `Pedido direto pelo site${quantity > 1 ? ` — Quantidade: ${quantity}` : ''}`,
  });
}

/**
 * Opens WhatsApp with the entire cart
 * @param {Array} cartItems - Array of cart items
 * @param {string} total - Formatted total
 */
function checkoutViaWhatsApp(cartItems, total) {
  if (!cartItems || cartItems.length === 0) return;

  let message = `Olá! Quero fechar o pedido com os seguintes itens:\n\n`;

  cartItems.forEach((item, i) => {
    message += `${i + 1}. *${item.brand} — ${item.name}*\n`;
    if (item.size) message += `   Tamanho: ${item.size}\n`;
    if (item.color) message += `   Cor: ${item.color}\n`;
    message += `   Preço: ${item.price}\n\n`;
  });

  message += `━━━━━━━━━━━━━━━\n`;
  message += `💰 *Total: ${total}*\n\n`;
  message += `Aguardo confirmação de disponibilidade e forma de pagamento. Obrigado! 🙏`;

  window.open(generateWhatsAppUrl(message), '_blank');
  registerLead({
    type: 'carrinho',
    productName: cartItems.map(item => `${item.brand} — ${item.name}`).join(', '),
    value: total || '',
    itemCount: cartItems.length,
    messagePreview: message,
  });
  registerOrder({
    productId: cartItems[0]?.id || '',
    productBrand: cartItems[0]?.brand || '',
    productName: cartItems.map(item => `${item.brand} — ${item.name}`).join(' | '),
    size: cartItems.map(item => item.size).filter(Boolean).join(', ') || '',
    color: cartItems.map(item => item.color).filter(Boolean).join(', ') || '',
    value: total || '',
    notes: [
      ...cartItems.map((item, i) => `${i + 1}. ${item.brand} — ${item.name}${item.size ? ` | Tam: ${item.size}` : ''}${item.color ? ` | Cor: ${item.color}` : ''} | ${item.price}`),
      '',
      'Origem: checkout do site (WhatsApp)',
    ].join('\n'),
  });
}

// Export globally
loadConfiguredNumber();
const api = {
  openGreeting: openWhatsAppGreeting,
  orderProduct: orderProductViaWhatsApp,
  checkout: checkoutViaWhatsApp,
  url: generateWhatsAppUrl,
};
Object.defineProperty(api, '_number', { get: () => whatsappNumber, set: value => { whatsappNumber = normalizePhoneNumber(value); } });
Object.defineProperty(api, 'number', { get: () => whatsappNumber, set: value => { whatsappNumber = normalizePhoneNumber(value); } });
window.ntWpp = api;
