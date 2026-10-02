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

  // Cache instantâneo local para que se o cliente ou lojista clicar no link imediatamente
  // a página de detalhes já encontre os dados em 0ms
  try {
    const cleanCode = (order.code || '').replace('#', '').toUpperCase();
    if (cleanCode) {
      localStorage.setItem(`nte_order_${cleanCode}`, JSON.stringify(order));
      localStorage.setItem('nte_last_order', JSON.stringify(order));
    }
  } catch (e) {}

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

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getProductCleanSlug(p, all) {
  if (!p) return '';
  const base = p.slug ? slugify(p.slug) : slugify(p.name);
  const catalog = Array.isArray(all) && all.length ? all : (window.NT_PRODUCTS || []);
  if (!catalog.length) return base;

  // Encontra todos os itens no catálogo com o mesmo base slug
  const duplicates = catalog.filter(item => (item.slug ? slugify(item.slug) : slugify(item.name)) === base);
  if (duplicates.length <= 1) {
    return base;
  }

  // Desempata por cor e tamanho
  const color = p.colors && p.colors[0] ? slugify(p.colors[0]) : '';
  const size = p.sizes && p.sizes[0] ? slugify(p.sizes[0]) : '';

  let candidate = base;
  if (color && size) candidate = `${base}-${color}-${size}`;
  else if (color) candidate = `${base}-${color}`;
  else if (size) candidate = `${base}-${size}`;

  const sameCandidate = catalog.filter(item => {
    const itemBase = item.slug ? slugify(item.slug) : slugify(item.name);
    const iColor = item.colors && item.colors[0] ? slugify(item.colors[0]) : '';
    const iSize = item.sizes && item.sizes[0] ? slugify(item.sizes[0]) : '';
    let c = itemBase;
    if (iColor && iSize) c = `${itemBase}-${iColor}-${iSize}`;
    else if (iColor) c = `${itemBase}-${iColor}`;
    else if (iSize) c = `${itemBase}-${iSize}`;
    return c === candidate;
  });

  if (sameCandidate.length <= 1) {
    return candidate;
  }

  // Se ainda houver duplicata idêntica, usa sufixo curto de 3 caracteres do ID
  const suffix = String(p.id || '').slice(-3);
  return suffix ? `${candidate}-${suffix}` : candidate;
}

function getProductPageUrl(product) {
  if (!product) return '';
  const origin = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : 'https://nteleganz.com.br';

  if (typeof product === 'string') {
    const catalog = window.NT_PRODUCTS || [];
    const matched = catalog.find(p => String(p.id).toLowerCase() === product.toLowerCase());
    const slug = matched ? getProductCleanSlug(matched, catalog) : slugify(product);
    return `${origin}/products/?p=${encodeURIComponent(slug)}`;
  }

  const slug = getProductCleanSlug(product, window.NT_PRODUCTS);
  return `${origin}/products/?p=${encodeURIComponent(slug || product.id || '')}`;
}

function getProductCleanPhotoUrl(product) {
  if (!product) return '';
  const origin = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : 'https://nteleganz.com.br';

  if (typeof product === 'string') {
    const catalog = window.NT_PRODUCTS || [];
    const matched = catalog.find(p => String(p.id).toLowerCase() === product.toLowerCase());
    const slug = matched ? getProductCleanSlug(matched, catalog) : slugify(product);
    return `${origin}/foto/${encodeURIComponent(slug)}.jpg`;
  }

  const slug = getProductCleanSlug(product, window.NT_PRODUCTS);
  if (slug) {
    return `${origin}/foto/${encodeURIComponent(slug)}.jpg`;
  }
  return getProductImageUrl(product);
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
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const orderCode = `#NTE-${orderNum}`;
  const cleanCode = `NTE-${orderNum}`;
  const origin = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : 'https://nteleganz.com.br';
  const orderPageUrl = `${origin}/order/${cleanCode}`;
  const itemPhoto = getProductImageUrl(product) || getProductCleanPhotoUrl(product);

  let message = `Olá! Quero fechar o pedido:\n\n`;
  message += `🏷️ *Código do Pedido:* ${orderCode}\n\n`;
  message += `*Item Selecionado:*\n`;
  message += `• *${product?.brand ? `${product.brand} — ` : ''}${product?.name || 'Produto'}*\n`;
  if (size) message += `   Tam: ${size}\n`;
  if (color) message += `   Cor: ${color}\n`;
  if (quantity > 1) message += `   Qtd: ${quantity}\n`;
  if (product?.price) message += `   Preço: ${product.price}\n`;
  message += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💰 *Total: ${product?.price || 'A combinar'}*\n\n`;
  message += `📋 *Ver Detalhes do Pedido e Fotos:*\n`;
  message += `👉 ${orderPageUrl}\n\n`;
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
    imageUrl: itemPhoto || '',
    messagePreview: message,
  });
  registerOrder({
    code: orderCode,
    productId: product?.id || '',
    productBrand: product?.brand || '',
    productName: product?.name || '',
    size: size || '',
    color: color || '',
    quantity: quantity,
    value: product?.price || '',
    imageUrl: itemPhoto || '',
    items: [{
      id: product?.id || '',
      brand: product?.brand || '',
      name: product?.name || '',
      size: size || '',
      color: color || '',
      qty: quantity,
      price: product?.price || '',
      image: itemPhoto || '',
    }],
    notes: `Pedido direto pelo site${quantity > 1 ? ` — Qtd: ${quantity}` : ''}`,
  });
}

/**
 * Opens WhatsApp with the entire cart
 * @param {Array} cartItems - Array of cart items
 * @param {string} total - Formatted total
 */
function checkoutViaWhatsApp(cartItems, total) {
  if (!cartItems || cartItems.length === 0) return;

  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const orderCode = `#NTE-${orderNum}`;
  const cleanCode = `NTE-${orderNum}`;
  const origin = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : 'https://nteleganz.com.br';
  const orderPageUrl = `${origin}/order/${cleanCode}`;

  let message = `Olá! Quero fechar o pedido:\n\n`;
  message += `🏷️ *Código do Pedido:* ${orderCode}\n\n`;
  message += `*Itens do Pedido (${cartItems.length}):*\n`;

  cartItems.forEach((item, i) => {
    const quantity = Math.max(1, Math.floor(Number(item.qty) || 1));
    message += `${i + 1}. *${item.brand ? `${item.brand} — ` : ''}${item.name || 'Produto'}*\n`;
    const details = [];
    if (item.size) details.push(`Tam: ${item.size}`);
    if (item.color) details.push(`Cor: ${item.color}`);
    if (quantity > 1) details.push(`Qtd: ${quantity}`);
    if (details.length) message += `   ${details.join(' | ')}\n`;
    if (item.price) message += `   Preço: ${item.price}\n`;
    message += `\n`;
  });

  message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💰 *Total: ${total}*\n\n`;
  message += `📋 *Ver Detalhes do Pedido e Fotos:*\n`;
  message += `👉 ${orderPageUrl}\n\n`;
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
    code: orderCode,
    productId: cartItems[0]?.id || '',
    productBrand: cartItems[0]?.brand || '',
    productName: cartItems.map(item => `${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}`).join(' | '),
    size: cartItems.map(item => item.size).filter(Boolean).join(', ') || '',
    color: cartItems.map(item => item.color).filter(Boolean).join(', ') || '',
    quantity: cartItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0),
    value: total || '',
    imageUrl: getProductImageUrl(cartItems[0]) || getProductCleanPhotoUrl(cartItems[0]) || '',
    items: cartItems.map(item => ({
      id: item.id || '',
      brand: item.brand || '',
      name: item.name || '',
      size: item.size || '',
      color: item.color || '',
      qty: Number(item.qty) || 1,
      price: item.price || '',
      image: getProductImageUrl(item) || getProductCleanPhotoUrl(item) || '',
    })),
    notes: [
      ...cartItems.map((item, i) => {
        return `${i + 1}. ${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}${item.size ? ` | Tam: ${item.size}` : ''}${item.color ? ` | Cor: ${item.color}` : ''} | ${item.price}`;
      }),
      '',
      'Origem: checkout do carrinho (WhatsApp)',
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
  getCleanPhotoUrl: getProductCleanPhotoUrl,
  getProductUrl: getProductPageUrl,
  getCleanSlug: getProductCleanSlug,
  slugify: slugify,
};
Object.defineProperty(api, '_number', { get: () => whatsappNumber, set: value => { whatsappNumber = normalizePhoneNumber(value); } });
Object.defineProperty(api, 'number', { get: () => whatsappNumber, set: value => { whatsappNumber = normalizePhoneNumber(value); } });
window.ntWpp = api;
