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

function getAbsoluteImageUrl(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return '';
  const trimmed = imagePath.trim();
  if (!trimmed || trimmed.startsWith('data:')) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const cleanPath = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
  const origin = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : 'https://nteleganz.com.br';
  return `${origin}/${cleanPath}`;
}

function getProductImageUrl(product) {
  if (!product) return '';
  const candidate = product.image
    || (Array.isArray(product.images) && product.images[0])
    || product.imageUrl
    || '';
  return getAbsoluteImageUrl(candidate);
}

function getProductPageUrl(productId) {
  if (!productId) return '';
  const origin = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : 'https://nteleganz.com.br';
  return `${origin}/products/?id=${encodeURIComponent(productId)}`;
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
 * @param {number} qty - Selected quantity
 */
function orderProductViaWhatsApp(product, size = null, color = null, qty = null) {
  const quantity = Math.max(1, Math.floor(Number(qty) || 1));
  const photoUrl = getProductImageUrl(product);
  const pageUrl = getProductPageUrl(product?.id);

  let message = `Olá! Quero fechar o pedido:\n\n`;
  message += `• *${product?.brand || 'NT Eleganz'} — ${product?.name || 'Produto'}*\n`;
  if (product?.id) message += `  Ref: #${product.id}\n`;
  if (size) message += `  Tamanho: ${size}\n`;
  if (color) message += `  Cor: ${color}\n`;
  if (quantity > 1) message += `  Quantidade: ${quantity}\n`;
  if (product?.price) message += `  Preço: ${product.price}\n`;
  if (photoUrl) message += `  📸 Foto da peça: ${photoUrl}\n`;
  if (pageUrl) message += `  🔗 Ver no site: ${pageUrl}\n`;
  message += `\nPoderia me dar mais detalhes sobre disponibilidade e envio? 🙏`;

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
    imageUrl: photoUrl || '',
    messagePreview: message,
  });
  registerOrder({
    productId: product?.id || '',
    productBrand: product?.brand || '',
    productName: product?.name || '',
    size: size || '',
    color: color || '',
    value: product?.price || '',
    imageUrl: photoUrl || '',
    notes: `Pedido direto pelo site${quantity > 1 ? ` — Quantidade: ${quantity}` : ''}${photoUrl ? ` — Foto: ${photoUrl}` : ''}`,
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
    const photoUrl = getProductImageUrl(item);
    const quantity = Math.max(1, Math.floor(Number(item.qty) || 1));
    message += `${i + 1}. *${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}*\n`;
    if (item.id) message += `   Ref: #${item.id}\n`;
    const details = [];
    if (item.size) details.push(`Tam: ${item.size}`);
    if (item.color) details.push(`Cor: ${item.color}`);
    if (quantity > 1) details.push(`Qtd: ${quantity}`);
    if (details.length) message += `   ${details.join(' | ')}\n`;
    if (item.price) message += `   Preço: ${item.price}\n`;
    if (photoUrl) message += `   📸 Foto: ${photoUrl}\n`;
    message += `\n`;
  });

  message += `━━━━━━━━━━━━━━━\n`;
  message += `💰 *Total: ${total}*\n\n`;
  message += `Aguardo confirmação de disponibilidade e forma de pagamento. Obrigado! 🙏`;

  window.open(generateWhatsAppUrl(message), '_blank');
  registerLead({
    type: 'carrinho',
    productName: cartItems.map(item => `${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}`).join(', '),
    value: total || '',
    itemCount: cartItems.length,
    messagePreview: message,
  });
  registerOrder({
    productId: cartItems[0]?.id || '',
    productBrand: cartItems[0]?.brand || '',
    productName: cartItems.map(item => `${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}`).join(' | '),
    size: cartItems.map(item => item.size).filter(Boolean).join(', ') || '',
    color: cartItems.map(item => item.color).filter(Boolean).join(', ') || '',
    value: total || '',
    notes: [
      ...cartItems.map((item, i) => {
        const photo = getProductImageUrl(item);
        return `${i + 1}. ${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}${item.size ? ` | Tam: ${item.size}` : ''}${item.color ? ` | Cor: ${item.color}` : ''} | ${item.price}${photo ? ` | Foto: ${photo}` : ''}`;
      }),
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
  getImageUrl: getProductImageUrl,
  getProductUrl: getProductPageUrl,
};
Object.defineProperty(api, '_number', { get: () => whatsappNumber, set: value => { whatsappNumber = normalizePhoneNumber(value); } });
Object.defineProperty(api, 'number', { get: () => whatsappNumber, set: value => { whatsappNumber = normalizePhoneNumber(value); } });
window.ntWpp = api;
