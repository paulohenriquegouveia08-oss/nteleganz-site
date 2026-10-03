/**
 * NT ELEGANZ — MEUS PEDIDOS (Área do Cliente)
 * Permite ao cliente consultar seus pedidos usando WhatsApp ou E-mail
 */

(function () {
  'use strict';

  function formatPhoneBR(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  function formatDateBR(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  }

  function getStatusBadge(status) {
    const s = String(status || 'novo').toLowerCase();
    switch (s) {
      case 'confirmado':
        return '<span style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">Confirmado ✓</span>';
      case 'enviado':
        return '<span style="background:rgba(234,179,8,0.15);color:#facc15;border:1px solid rgba(234,179,8,0.3);padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">Enviado 🚚</span>';
      case 'entregue':
        return '<span style="background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.3);padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">Entregue ✅</span>';
      case 'cancelado':
        return '<span style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">Cancelado</span>';
      default:
        return '<span style="background:rgba(201,168,76,0.15);color:#c9a84c;border:1px solid rgba(201,168,76,0.3);padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">Pendente / Em Separação ⏳</span>';
    }
  }

  function getCustomerSession() {
    try {
      return JSON.parse(localStorage.getItem('nte_customer_profile') || 'null');
    } catch {
      return null;
    }
  }

  function saveCustomerSession(data) {
    try {
      const existing = getCustomerSession() || {};
      localStorage.setItem('nte_customer_profile', JSON.stringify({ ...existing, ...data }));
    } catch {}
  }

  function clearCustomerSession() {
    try {
      localStorage.removeItem('nte_customer_profile');
    } catch {}
  }

  function injectStyles() {
    if (document.getElementById('nte-customer-orders-styles')) return;
    const style = document.createElement('style');
    style.id = 'nte-customer-orders-styles';
    style.textContent = `
      .nte-co-overlay {
        position: fixed !important;
        inset: 0 !important;
        z-index: 999998 !important;
        background: rgba(0, 0, 0, 0.8) !important;
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
      .nte-co-card {
        background: #0d0d0d !important;
        border: 1px solid rgba(201, 168, 76, 0.35) !important;
        border-radius: 16px !important;
        max-width: 580px !important;
        width: 100% !important;
        max-height: 90vh !important;
        display: flex !important;
        flex-direction: column !important;
        box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(201,168,76,0.15) !important;
        color: #f2efe9 !important;
        animation: nteSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }
      .nte-co-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 16px 20px !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        background: rgba(201, 168, 76, 0.04) !important;
      }
      .nte-co-title {
        margin: 0 !important;
        font-size: 1.1rem !important;
        font-weight: 600 !important;
        color: #f2efe9 !important;
        letter-spacing: -0.01em !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }
      .nte-co-close {
        background: rgba(255, 255, 255, 0.06) !important;
        border: none !important;
        color: #888 !important;
        width: 32px !important;
        height: 32px !important;
        border-radius: 8px !important;
        font-size: 1.3rem !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.15s ease !important;
      }
      .nte-co-close:hover {
        background: rgba(255, 255, 255, 0.12) !important;
        color: #fff !important;
      }
      .nte-co-body {
        padding: 20px !important;
        overflow-y: auto !important;
        box-sizing: border-box !important;
        flex: 1 !important;
      }
      .nte-co-order-card {
        background: rgba(255, 255, 255, 0.02) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 12px !important;
        padding: 16px !important;
        margin-bottom: 14px !important;
        transition: border-color 0.15s ease, background 0.15s ease !important;
      }
      .nte-co-order-card:hover {
        border-color: rgba(201, 168, 76, 0.3) !important;
        background: rgba(255, 255, 255, 0.03) !important;
      }
      .nte-co-order-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: flex-start !important;
        gap: 10px !important;
        flex-wrap: wrap !important;
        margin-bottom: 12px !important;
      }
      .nte-co-items-list {
        display: grid !important;
        gap: 10px !important;
        margin-bottom: 14px !important;
      }
      .nte-co-item-row {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 6px 0 !important;
      }
      .nte-co-item-thumb {
        width: 44px !important;
        height: 44px !important;
        border-radius: 8px !important;
        object-fit: cover !important;
        border: 1px solid rgba(201, 168, 76, 0.25) !important;
        background: #111 !important;
        flex-shrink: 0 !important;
      }
      .nte-co-footer-actions {
        display: flex !important;
        justify-content: flex-end !important;
        gap: 10px !important;
        flex-wrap: wrap !important;
        padding-top: 10px !important;
        border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
      }
      .nte-co-btn {
        padding: 8px 14px !important;
        border-radius: 8px !important;
        font-size: 0.85rem !important;
        font-weight: 600 !important;
        text-decoration: none !important;
        cursor: pointer !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        transition: all 0.15s ease !important;
      }
      .nte-co-btn--gold {
        background: #c9a84c !important;
        color: #000 !important;
        border: none !important;
      }
      .nte-co-btn--gold:hover {
        background: #dfbe65 !important;
      }
      .nte-co-btn--outline {
        background: transparent !important;
        color: #f2efe9 !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
      }
      .nte-co-btn--outline:hover {
        border-color: #c9a84c !important;
        color: #c9a84c !important;
      }
      .nte-co-btn--wpp {
        background: #25d366 !important;
        color: #05260f !important;
        border: none !important;
      }
      .nte-co-btn--wpp:hover {
        background: #20ba59 !important;
      }
      .nte-co-input {
        width: 100% !important;
        padding: 12px 14px !important;
        background: #141414 !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-radius: 10px !important;
        color: #f2efe9 !important;
        font-size: 0.95rem !important;
        outline: none !important;
        box-sizing: border-box !important;
        margin-bottom: 12px !important;
        transition: border-color 0.2s, box-shadow 0.2s !important;
      }
      .nte-co-input:focus {
        border-color: #c9a84c !important;
        box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.15) !important;
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchCustomerOrders(contact) {
    const isEmail = contact.includes('@');
    const param = isEmail
      ? `client_email=${encodeURIComponent(contact.trim().toLowerCase())}`
      : `client_phone=${encodeURIComponent(contact.replace(/\D/g, ''))}`;

    const res = await fetch(`/api/orders.php?${param}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Não foi possível consultar os pedidos no momento.');
    const data = await res.json();
    return Array.isArray(data.orders) ? data.orders : [];
  }

  window.nteOpenCustomerOrders = function () {
    injectStyles();
    const existing = document.getElementById('nte-customer-orders-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nte-customer-orders-modal';
    overlay.className = 'nte-co-overlay';

    const session = getCustomerSession();
    const contactValue = session?.phone || session?.cleanPhone || session?.email || '';

    overlay.innerHTML = `
      <div class="nte-co-card">
        <div class="nte-co-header">
          <h3 class="nte-co-title">
            <span>📦</span> Meus Pedidos
          </h3>
          <button class="nte-co-close" id="nte-co-close-btn">×</button>
        </div>
        <div class="nte-co-body" id="nte-co-body">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#nte-co-close-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const bodyEl = overlay.querySelector('#nte-co-body');

    if (contactValue) {
      loadAndRenderOrders(contactValue, session?.name || '');
    } else {
      renderLoginForm();
    }

    function renderLoginForm(errorMsg = '') {
      bodyEl.innerHTML = `
        <div style="text-align:center; padding:10px 0 20px 0;">
          <div style="width:52px; height:52px; border-radius:50%; background:rgba(201,168,76,0.12); border:1px solid rgba(201,168,76,0.25); color:#c9a84c; display:flex; align-items:center; justify-content:center; font-size:24px; margin:0 auto 12px auto;">
            🛍️
          </div>
          <h4 style="margin:0 0 6px 0; font-size:1.15rem; color:#f2efe9;">Consulte seus Pedidos</h4>
          <p style="margin:0; font-size:0.85rem; color:#888; line-height:1.4;">
            Informe seu número de WhatsApp ou E-mail utilizado na compra para ver o status, fotos e comprovantes.
          </p>
        </div>

        ${errorMsg ? `
          <div style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); color:#fca5a5; padding:10px 14px; border-radius:8px; font-size:0.83rem; margin-bottom:14px;">
            ${errorMsg}
          </div>
        ` : ''}

        <div>
          <label style="display:block; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; color:#aaa; margin-bottom:6px;">
            WhatsApp ou E-mail
          </label>
          <input type="text" id="nte-co-contact-input" class="nte-co-input" placeholder="(00) 00000-0000 ou seu@email.com" />
          <button id="nte-co-search-btn" class="nte-co-btn nte-co-btn--gold" style="width:100%; padding:13px; font-size:0.95rem; justify-content:center; margin-top:4px;">
            Consultar Pedidos ➔
          </button>
        </div>
      `;

      const input = bodyEl.querySelector('#nte-co-contact-input');
      const searchBtn = bodyEl.querySelector('#nte-co-search-btn');

      input?.addEventListener('input', (e) => {
        const val = e.target.value;
        if (!val.includes('@') && /^\d/.test(val)) {
          e.target.value = formatPhoneBR(val);
        }
      });

      const handleSearch = () => {
        const raw = (input?.value || '').trim();
        if (!raw || raw.length < 4) {
          renderLoginForm('Por favor, informe seu WhatsApp com DDD ou e-mail válido.');
          return;
        }
        saveCustomerSession({ phone: raw });
        loadAndRenderOrders(raw);
      };

      searchBtn?.addEventListener('click', handleSearch);
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSearch(); });
      setTimeout(() => input?.focus(), 100);
    }

    async function loadAndRenderOrders(contact, customerName = '') {
      bodyEl.innerHTML = `
        <div style="text-align:center; padding:40px 20px;">
          <div style="display:inline-block; width:32px; height:32px; border:2px solid rgba(201,168,76,0.3); border-top-color:#c9a84c; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
          <p style="margin-top:12px; font-size:0.88rem; color:#aaa;">Buscando seus pedidos...</p>
        </div>
      `;

      try {
        const orders = await fetchCustomerOrders(contact);

        if (!orders.length) {
          bodyEl.innerHTML = `
            <div style="text-align:center; padding:30px 10px;">
              <div style="font-size:36px; margin-bottom:10px;">🔍</div>
              <h4 style="margin:0 0 6px 0; color:#f2efe9;">Nenhum pedido encontrado</h4>
              <p style="font-size:0.85rem; color:#888; margin:0 0 18px 0; line-height:1.45;">
                Não localizamos pedidos registrados para <strong>${contact}</strong>.<br />
                Certifique-se de que digitou o mesmo número ou e-mail usado ao comprar.
              </p>
              <div style="display:flex; justify-content:center; gap:10px;">
                <button id="nte-co-retry-btn" class="nte-co-btn nte-co-btn--outline">
                  Tentar outro número
                </button>
                <a href="/collections/" class="nte-co-btn nte-co-btn--gold" onclick="close()">
                  Ver Coleção
                </a>
              </div>
            </div>
          `;
          bodyEl.querySelector('#nte-co-retry-btn')?.addEventListener('click', () => {
            clearCustomerSession();
            renderLoginForm();
          });
          return;
        }

        const nameToDisplay = customerName || orders[0]?.client || 'Cliente';

        bodyEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08);">
            <div>
              <div style="font-size:0.95rem; font-weight:700; color:#f2efe9;">
                Olá, ${nameToDisplay !== 'Cliente do site' ? nameToDisplay : 'Cliente'}!
              </div>
              <div style="font-size:0.8rem; color:#888;">
                ${orders.length} pedido${orders.length > 1 ? 's' : ''} encontrado${orders.length > 1 ? 's' : ''} para ${contact}
              </div>
            </div>
            <button id="nte-co-switch-btn" style="background:none; border:none; color:#c9a84c; font-size:0.8rem; text-decoration:underline; cursor:pointer; padding:4px 0;">
              Trocar contato / Sair
            </button>
          </div>

          <div style="display:grid; gap:12px;">
            ${orders.map(order => {
              const code = order.code || `#NTE-${String(order.id).slice(-4).toUpperCase()}`;
              const cleanCode = code.replace('#', '');
              const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [{
                name: order.productName || 'Produto',
                brand: order.productBrand || '',
                size: order.size || '',
                color: order.color || '',
                qty: order.quantity || 1,
                price: order.value || '',
                image: order.imageUrl || ''
              }];

              return `
                <div class="nte-co-order-card">
                  <div class="nte-co-order-header">
                    <div>
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-family:monospace; font-weight:700; color:#c9a84c; font-size:0.95rem;">${code}</span>
                        <span style="font-size:0.75rem; color:#777;">${formatDateBR(order.createdAt || order.created_at)}</span>
                      </div>
                    </div>
                    <div>
                      ${getStatusBadge(order.status)}
                    </div>
                  </div>

                  <div class="nte-co-items-list">
                    ${items.map(it => `
                      <div class="nte-co-item-row">
                        ${it.image ? `<img src="${it.image}" alt="" class="nte-co-item-thumb">` : '<div class="nte-co-item-thumb" style="display:flex;align-items:center;justify-content:center;color:#666;">🛍️</div>'}
                        <div style="flex:1; min-width:0;">
                          <div style="font-size:0.85rem; font-weight:600; color:#f2efe9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${it.brand ? `${it.brand} — ` : ''}${it.name || 'Produto'}
                          </div>
                          <div style="font-size:0.78rem; color:#888; margin-top:2px;">
                            ${it.size ? `Tam: <strong>${it.size}</strong> ` : ''}
                            ${it.color ? `| Cor: <strong>${it.color}</strong> ` : ''}
                            ${Number(it.qty) > 1 ? `| Qtd: <strong>${it.qty}</strong>` : ''}
                          </div>
                        </div>
                        <div style="font-size:0.85rem; font-weight:600; color:#c9a84c;">
                          ${it.price || ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>

                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:8px 0; border-top:1px dashed rgba(255,255,255,0.06);">
                    <span style="font-size:0.82rem; color:#aaa;">Total do Pedido:</span>
                    <strong style="color:#c9a84c; font-size:1rem;">${order.value || ''}</strong>
                  </div>

                  <div class="nte-co-footer-actions">
                    <a href="/order/${encodeURIComponent(cleanCode)}" target="_blank" class="nte-co-btn nte-co-btn--gold">
                      📄 Ver Detalhes e Fotos
                    </a>
                    <a href="https://wa.me/5575999283496?text=${encodeURIComponent(`Olá! Gostaria de informações sobre o meu pedido ${code}.`)}" target="_blank" class="nte-co-btn nte-co-btn--wpp">
                      💬 Dúvidas no WhatsApp
                    </a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        bodyEl.querySelector('#nte-co-switch-btn')?.addEventListener('click', () => {
          clearCustomerSession();
          renderLoginForm();
        });

      } catch (err) {
        renderLoginForm(err.message || 'Erro ao carregar pedidos.');
      }
    }
  };
})();
