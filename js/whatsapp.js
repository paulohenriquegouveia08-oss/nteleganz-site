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
  const message = `Olá! Vim pelo site da NT Eleganz e gostaria de saber mais sobre os produtos.`;
  window.open(generateWhatsAppUrl(message), '_blank');
  registerLead({ type: 'atendimento', messagePreview: message });
}

/**
 * Opens WhatsApp with a specific product inquiry
/**
 * Customer Profile storage helpers
 */
function getSavedCustomerProfile() {
  try {
    return JSON.parse(localStorage.getItem('nte_customer_profile') || 'null');
  } catch (e) {
    return null;
  }
}

function saveCustomerProfile(profile) {
  try {
    if (profile && typeof profile === 'object') {
      localStorage.setItem('nte_customer_profile', JSON.stringify(profile));
    }
  } catch (e) {}
}

function formatPhoneBR(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Injects modal styles once into the page
 */
function injectCheckoutModalStyles() {
  if (document.getElementById('nte-checkout-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'nte-checkout-modal-styles';
  style.textContent = `
    .nte-modal-overlay {
      position: fixed !important;
      inset: 0 !important;
      z-index: 999999 !important;
      background: rgba(0, 0, 0, 0.78) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: clamp(12px, 3vw, 24px) !important;
      box-sizing: border-box !important;
      animation: nteFadeIn 0.2s ease-out !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    .nte-modal-card {
      background: #ffffff !important;
      border: 1px solid rgba(0, 0, 0, 0.08) !important;
      border-radius: 16px !important;
      max-width: 480px !important;
      width: 100% !important;
      max-height: 90vh !important;
      overflow-y: auto !important;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2), 0 4px 16px rgba(0, 0, 0, 0.06) !important;
      color: #1a1a1a !important;
      animation: nteSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      box-sizing: border-box !important;
    }
    .nte-modal-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 18px 22px !important;
      border-bottom: 1px solid #f0ede6 !important;
      background: #faf8f5 !important;
    }
    .nte-modal-title {
      margin: 0 !important;
      font-size: 1.05rem !important;
      font-weight: 600 !important;
      color: #111111 !important;
      letter-spacing: -0.01em !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
    }
    .nte-modal-close {
      background: #f2efe9 !important;
      border: none !important;
      color: #666666 !important;
      width: 32px !important;
      height: 32px !important;
      border-radius: 8px !important;
      font-size: 1.2rem !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: all 0.15s ease !important;
    }
    .nte-modal-close:hover {
      background: #e5e0d5 !important;
      color: #111111 !important;
    }
    .nte-modal-body {
      padding: 22px !important;
      box-sizing: border-box !important;
      background: #ffffff !important;
    }
    .nte-item-summary-box {
      background: #fcfbf9 !important;
      border: 1px solid #ebd9b5 !important;
      border-radius: 12px !important;
      padding: 12px 14px !important;
      margin-bottom: 18px !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    }
    .nte-item-summary-thumb {
      width: 48px !important;
      height: 48px !important;
      border-radius: 8px !important;
      object-fit: cover !important;
      border: 1px solid #e5dcce !important;
      background: #f5f5f5 !important;
      flex-shrink: 0 !important;
    }
    .nte-form-group {
      margin-bottom: 14px !important;
    }
    .nte-form-label {
      display: block !important;
      font-size: 0.78rem !important;
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.05em !important;
      color: #555555 !important;
      margin-bottom: 6px !important;
    }
    .nte-form-label span.req {
      color: #b38e2d !important;
    }
    .nte-form-input {
      width: 100% !important;
      padding: 12px 14px !important;
      background: #fafaf9 !important;
      border: 1px solid #dcd8d0 !important;
      border-radius: 10px !important;
      color: #111111 !important;
      font-size: 0.95rem !important;
      outline: none !important;
      box-sizing: border-box !important;
      transition: border-color 0.2s, box-shadow 0.2s, background 0.2s !important;
    }
    .nte-form-input:focus {
      background: #ffffff !important;
      border-color: #c9a84c !important;
      box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.18) !important;
    }
    .nte-form-hint {
      font-size: 0.75rem !important;
      color: #777777 !important;
      margin-top: 4px !important;
      display: block !important;
    }
    .nte-lgpd-box {
      background: #faf8f5 !important;
      border: 1px solid #ebd9b5 !important;
      border-radius: 10px !important;
      padding: 12px !important;
      margin: 16px 0 20px 0 !important;
    }
    .nte-lgpd-label {
      display: flex !important;
      align-items: flex-start !important;
      gap: 10px !important;
      cursor: pointer !important;
      font-size: 0.82rem !important;
      color: #444444 !important;
      line-height: 1.45 !important;
      user-select: none !important;
    }
    .nte-lgpd-label input[type="checkbox"] {
      margin-top: 2px !important;
      width: 17px !important;
      height: 17px !important;
      accent-color: #c9a84c !important;
      cursor: pointer !important;
      flex-shrink: 0 !important;
    }
    .nte-lgpd-link {
      color: #9c7a28 !important;
      text-decoration: underline !important;
      font-weight: 600 !important;
      cursor: pointer !important;
    }
    .nte-lgpd-link:hover {
      color: #7a5e19 !important;
    }
    .nte-btn-submit-wpp {
      width: 100% !important;
      padding: 14px 20px !important;
      background: #25d366 !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 10px !important;
      font-size: 0.98rem !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 10px !important;
      transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease !important;
      box-shadow: 0 4px 15px rgba(37, 211, 102, 0.28) !important;
    }
    .nte-btn-submit-wpp:hover {
      background: #20ba59 !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 6px 20px rgba(37, 211, 102, 0.38) !important;
    }
    .nte-form-alert {
      background: #fef2f2 !important;
      border: 1px solid #fecaca !important;
      color: #b91c1c !important;
      padding: 10px 14px !important;
      border-radius: 8px !important;
      font-size: 0.82rem !important;
      margin-bottom: 14px !important;
      display: none;
    }
    @keyframes nteFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes nteSlideUp {
      from { opacity: 0; transform: translateY(12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Opens LGPD Terms Modal
 */
function openLGPDModal() {
  injectCheckoutModalStyles();
  const existing = document.getElementById('nte-lgpd-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'nte-lgpd-modal-overlay';
  overlay.className = 'nte-modal-overlay';
  overlay.style.zIndex = '1000001';

  overlay.innerHTML = `
    <div class="nte-modal-card" style="max-width:540px;">
      <div class="nte-modal-header">
        <h3 class="nte-modal-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="1.8">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>Termos de Privacidade e LGPD</span>
        </h3>
        <button class="nte-modal-close" id="nte-lgpd-close">×</button>
      </div>
      <div class="nte-modal-body" style="font-size:0.88rem;line-height:1.6;color:#333;">
        <p style="margin-top:0;">
          A <strong>NT Eleganz</strong> preza pela transparência, privacidade e segurança dos seus dados, atuando em total conformidade com a <strong>Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD)</strong>.
        </p>

        <div style="background:#faf8f4;border:1px solid #ebd9b5;border-radius:10px;padding:14px;margin:16px 0;">
          <strong style="color:#9c7a28;display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.92rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9c7a28" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Compromisso Expresso Anti-Telemarketing:
          </strong>
          <span style="color:#333;">
            Garantimos formal e expressamente que <strong>seus dados e número de telefone NUNCA serão comercializados, vendidos, alugados ou compartilhados</strong> com empresas de telemarketing, birôs de dados ou quaisquer terceiros. Seu contato é estritamente confidencial.
          </span>
        </div>

        <p><strong style="color:#111;">Finalidades Exclusivas do Uso:</strong></p>
        <ul style="padding-left:20px;margin:8px 0;display:grid;gap:6px;">
          <li>Processar a reserva e o atendimento do seu pedido com segurança;</li>
          <li>Enviar atualizações de status de envio, rastreio e confirmação via WhatsApp;</li>
          <li>Prestar atendimento personalizado e follow-up caso haja dúvidas sobre os produtos selecionados;</li>
          <li>Enviar novidades selecionadas e lançamentos exclusivos da NT Eleganz diretamente para você.</li>
        </ul>

        <p style="margin-top:14px;"><strong style="color:#111;">Seus Direitos (Art. 18 LGPD):</strong></p>
        <p style="font-size:0.82rem;color:#666;margin-bottom:18px;">
          Você pode a qualquer momento revogar o consentimento, solicitar a confirmação de tratamento ou a exclusão total dos seus dados de nossa base. Basta nos informar no WhatsApp respondendo "CANCELAR" ou entrando em contato com nosso time de atendimento.
        </p>

        <button id="nte-lgpd-accept-btn" style="
          width:100%;padding:12px;background:#c9a84c;color:#111;border:none;border-radius:10px;
          font-weight:700;font-size:0.92rem;cursor:pointer;transition:background 0.15s;
        " onmouseover="this.style.background='#dfbe65'" onmouseout="this.style.background='#c9a84c'">
          Entendi e Concordo
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    const cb = document.getElementById('nte-customer-lgpd');
    if (cb) cb.checked = true;
  };

  overlay.querySelector('#nte-lgpd-close')?.addEventListener('click', close);
  overlay.querySelector('#nte-lgpd-accept-btn')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

/**
 * Opens Customer Identification Modal before redirecting to WhatsApp
 */
function openCustomerCheckoutModal({ title, items, total, onConfirm }) {
  injectCheckoutModalStyles();
  const existing = document.getElementById('nte-checkout-modal-overlay');
  if (existing) existing.remove();

  const saved = getSavedCustomerProfile() || {};
  const firstItem = Array.isArray(items) && items.length > 0 ? items[0] : null;

  const overlay = document.createElement('div');
  overlay.id = 'nte-checkout-modal-overlay';
  overlay.className = 'nte-modal-overlay';

  const previewHtml = firstItem ? `
    <div class="nte-item-summary-box">
      ${firstItem.image ? `<img src="${firstItem.image}" alt="" class="nte-item-summary-thumb">` : `
        <div class="nte-item-summary-thumb" style="display:flex;align-items:center;justify-content:center;color:#9c7a28;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
            <path d="M3 6h18"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
      `}
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.88rem;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${firstItem.brand ? `${firstItem.brand} — ` : ''}${firstItem.name || 'Produto'}
          ${items.length > 1 ? ` <span style="color:#b38e2d;font-weight:700;">(+${items.length - 1} item${items.length > 2 ? 's' : ''})</span>` : ''}
        </div>
        <div style="font-size:0.8rem;color:#666;margin-top:2px;">
          ${firstItem.size ? `Tam: <strong>${firstItem.size}</strong> ` : ''}
          ${firstItem.color ? `| Cor: <strong>${firstItem.color}</strong> ` : ''}
        </div>
      </div>
      <div style="font-weight:700;color:#9c7a28;font-size:0.95rem;text-align:right;">
        ${total || firstItem.price || ''}
      </div>
    </div>
  ` : '';

  overlay.innerHTML = `
    <div class="nte-modal-card">
      <div class="nte-modal-header">
        <h3 class="nte-modal-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="1.8">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
            <path d="M3 6h18"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <span>${title || 'Finalizar Pedido'}</span>
        </h3>
        <button class="nte-modal-close" id="nte-checkout-close">×</button>
      </div>
      <div class="nte-modal-body">
        ${previewHtml}
        <div id="nte-form-alert" class="nte-form-alert"></div>

        <div class="nte-form-group">
          <label class="nte-form-label" for="nte-customer-name">Seu Nome Completo <span class="req">*</span></label>
          <input type="text" id="nte-customer-name" class="nte-form-input" placeholder="Ex: João da Silva" value="${saved.name || ''}" autocomplete="name" required />
        </div>

        <div class="nte-form-group">
          <label class="nte-form-label" for="nte-customer-phone">WhatsApp / Celular <span class="req">*</span></label>
          <input type="tel" id="nte-customer-phone" class="nte-form-input" placeholder="(00) 00000-0000" value="${saved.phone ? formatPhoneBR(saved.phone) : ''}" autocomplete="tel" required />
          <span class="nte-form-hint">Para confirmação do pedido e atualizações de entrega.</span>
        </div>

        <div class="nte-form-group">
          <label class="nte-form-label" for="nte-customer-email">E-mail (opcional)</label>
          <input type="email" id="nte-customer-email" class="nte-form-input" placeholder="seu@email.com" value="${saved.email || ''}" autocomplete="email" />
          <span class="nte-form-hint">Para consultar seus pedidos futuros no site.</span>
        </div>

        <div class="nte-lgpd-box">
          <label class="nte-lgpd-label">
            <input type="checkbox" id="nte-customer-lgpd" checked />
            <span>
              Concordo com os <a href="#" class="nte-lgpd-link" id="nte-open-lgpd">Termos de Privacidade e LGPD</a>, autorizando o recebimento de confirmações de pedido, atualizações e follow-up pelo WhatsApp.
            </span>
          </label>
        </div>

        <button type="button" id="nte-submit-wpp-btn" class="nte-btn-submit-wpp">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
          </svg>
          <span>Finalizar Pedido no WhatsApp</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const phoneInput = overlay.querySelector('#nte-customer-phone');
  const nameInput = overlay.querySelector('#nte-customer-name');
  const emailInput = overlay.querySelector('#nte-customer-email');
  const lgpdInput = overlay.querySelector('#nte-customer-lgpd');
  const alertEl = overlay.querySelector('#nte-form-alert');
  const submitBtn = overlay.querySelector('#nte-submit-wpp-btn');

  // Input mask
  phoneInput?.addEventListener('input', (e) => {
    e.target.value = formatPhoneBR(e.target.value);
  });

  // Open LGPD terms
  overlay.querySelector('#nte-open-lgpd')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLGPDModal();
  });

  const closeModal = () => overlay.remove();
  overlay.querySelector('#nte-checkout-close')?.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  const showError = (msg) => {
    if (alertEl) {
      alertEl.textContent = msg;
      alertEl.style.display = 'block';
    }
  };

  submitBtn?.addEventListener('click', () => {
    const name = (nameInput?.value || '').trim();
    const phoneRaw = (phoneInput?.value || '').trim();
    const cleanPhone = phoneRaw.replace(/\D/g, '');
    const email = (emailInput?.value || '').trim();
    const acceptedLGPD = Boolean(lgpdInput?.checked);

    if (!name || name.length < 2) {
      showError('Por favor, informe seu nome completo.');
      nameInput?.focus();
      return;
    }

    if (!cleanPhone || cleanPhone.length < 10) {
      showError('Por favor, informe um WhatsApp válido com DDD (mínimo 10 dígitos).');
      phoneInput?.focus();
      return;
    }

    if (!acceptedLGPD) {
      showError('Você precisa concordar com os Termos de Privacidade e LGPD para continuar.');
      return;
    }

    const customer = {
      name,
      phone: formatPhoneBR(cleanPhone),
      cleanPhone,
      email,
      lgpdConsent: true,
      consentedAt: new Date().toISOString()
    };

    saveCustomerProfile(customer);
    closeModal();

    if (typeof onConfirm === 'function') {
      onConfirm(customer);
    }
  });

  // Focus
  setTimeout(() => {
    if (!nameInput?.value) nameInput?.focus();
    else if (!phoneInput?.value) phoneInput?.focus();
  }, 100);
}

/**
 * Opens WhatsApp with a direct greeting message
 */
function openWhatsAppGreeting() {
  const message = `Olá! Vim pelo site da NT Eleganz e gostaria de saber mais sobre os produtos.`;
  window.open(generateWhatsAppUrl(message), '_blank');
  registerLead({ type: 'atendimento', messagePreview: message });
}

/**
 * Opens WhatsApp with a specific product inquiry after customer identification
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

  const brand = product?.brand ? `${product.brand} — ` : '';
  const name = product?.name || 'Produto';

  const specs = [];
  if (size) specs.push(`Tamanho: ${size}`);
  if (color) specs.push(`Cor: ${color}`);
  if (quantity > 1) specs.push(`Qtd: ${quantity}`);
  const specsText = specs.length > 0 ? specs.join(' | ') : '';

  // Intercept with identification modal
  openCustomerCheckoutModal({
    title: 'Finalizar Pedido',
    items: [{
      id: product?.id || '',
      brand: product?.brand || '',
      name: product?.name || '',
      size: size,
      color: color,
      qty: quantity,
      price: product?.price || '',
      image: itemPhoto
    }],
    total: product?.price || '',
    onConfirm: (customer) => {
      let message = `Olá! Gostaria de fechar o seguinte pedido:\n\n`;
      message += `*Pedido:* ${orderCode}\n\n`;
      message += `*Produto:*\n`;
      message += `${brand}${name}\n`;
      if (specsText) message += `${specsText}\n`;
      if (product?.price) message += `Valor: ${product.price}\n`;
      message += `\n*Total:* ${product?.price || 'A combinar'}\n\n`;
      message += `*Fotos e detalhes completos do pedido:*\n`;
      message += `${orderPageUrl}\n\n`;
      message += `Poderia me confirmar a disponibilidade e o envio?`;

      // Open WhatsApp directly on customer submit click (synchronous to click)
      window.open(generateWhatsAppUrl(message), '_blank');

      registerLead({
        type: 'produto',
        client: customer.name,
        phone: customer.phone,
        email: customer.email,
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
        client: customer.name,
        phone: customer.phone,
        email: customer.email,
        lgpdConsent: true,
        lgpdDate: customer.consentedAt || new Date().toISOString(),
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
  });
}

/**
 * Opens WhatsApp with the entire cart after customer identification
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

  const formattedItems = cartItems.map(item => ({
    id: item.id || '',
    brand: item.brand || '',
    name: item.name || 'Produto',
    size: item.size || '',
    color: item.color || '',
    qty: Number(item.qty) || 1,
    price: item.price || '',
    image: getProductImageUrl(item) || getProductCleanPhotoUrl(item) || '',
  }));

  // Intercept with identification modal
  openCustomerCheckoutModal({
    title: 'Finalizar Pedido do Carrinho',
    items: formattedItems,
    total: total,
    onConfirm: (customer) => {
      let message = `Olá! Gostaria de fechar o meu pedido:\n\n`;
      message += `*Pedido:* ${orderCode}\n\n`;
      message += `*Itens do Pedido (${cartItems.length}):*\n\n`;

      cartItems.forEach((item, i) => {
        const quantity = Math.max(1, Math.floor(Number(item.qty) || 1));
        const brand = item.brand ? `${item.brand} — ` : '';
        const name = item.name || 'Produto';

        const specs = [];
        if (item.size) specs.push(`Tamanho: ${item.size}`);
        if (item.color) specs.push(`Cor: ${item.color}`);
        if (quantity > 1) specs.push(`Qtd: ${quantity}`);
        const specsText = specs.length > 0 ? specs.join(' | ') : '';

        message += `${i + 1}. ${brand}${name}\n`;
        if (specsText) message += `${specsText}\n`;
        if (item.price) message += `Valor: ${item.price}\n`;
        message += `\n`;
      });

      message += `*Total:* ${total}\n\n`;
      message += `*Fotos e detalhes completos do pedido:*\n`;
      message += `${orderPageUrl}\n\n`;
      message += `Aguardo a confirmação de disponibilidade e o pagamento. Obrigado!`;

      // Open WhatsApp directly on customer submit click (synchronous to click)
      window.open(generateWhatsAppUrl(message), '_blank');

      registerLead({
        type: 'carrinho',
        client: customer.name,
        phone: customer.phone,
        email: customer.email,
        productName: cartItems.map(item => `${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}`).join(', '),
        value: total || '',
        itemCount: cartItems.length,
        messagePreview: message,
      });

      registerOrder({
        code: orderCode,
        client: customer.name,
        phone: customer.phone,
        email: customer.email,
        lgpdConsent: true,
        lgpdDate: customer.consentedAt || new Date().toISOString(),
        productId: cartItems[0]?.id || '',
        productBrand: cartItems[0]?.brand || '',
        productName: cartItems.map(item => `${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}`).join(' | '),
        size: cartItems.map(item => item.size).filter(Boolean).join(', ') || '',
        color: cartItems.map(item => item.color).filter(Boolean).join(', ') || '',
        quantity: cartItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0),
        value: total || '',
        imageUrl: formattedItems[0]?.image || '',
        items: formattedItems,
        notes: [
          ...cartItems.map((item, i) => {
            return `${i + 1}. ${item.brand || 'NT Eleganz'} — ${item.name || 'Produto'}${item.size ? ` | Tam: ${item.size}` : ''}${item.color ? ` | Cor: ${item.color}` : ''} | ${item.price}`;
          }),
          '',
          'Origem: checkout do carrinho (WhatsApp)',
        ].join('\n'),
      });
    }
  });
}

// Export globally
loadConfiguredNumber();
const api = {
  openGreeting: openWhatsAppGreeting,
  orderProduct: orderProductViaWhatsApp,
  checkout: checkoutViaWhatsApp,
  openCustomerModal: openCustomerCheckoutModal,
  openLGPDModal: openLGPDModal,
  getSavedProfile: getSavedCustomerProfile,
  saveProfile: saveCustomerProfile,
  formatPhoneBR: formatPhoneBR,
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

