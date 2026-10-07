/* ==========================================================================
   NT ELEGANZ — LUXURY CHECKOUT ENGINE
   InfinitePay Integration • ViaCEP Auto-Fill • Dynamic Shipping • Progress Bar
   ========================================================================== */

(function () {
  'use strict';

  let currentItems = [];
  let subtotalAmount = 0;
  let selectedShipping = null;
  let availableShippingMethods = [];
  let overlayEl = null;

  // Formatador monetário BRL
  const fmtMoney = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  // Máscaras de entrada
  function maskPhone(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    if (v.length > 10) return v.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (v.length > 6) return v.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    if (v.length > 2) return v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
    return v;
  }

  function maskCPF(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
            .replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
            .replace(/(\d{3})(\d{1,3})/, '$1.$2');
  }

  function maskCEP(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 8) v = v.substring(0, 8);
    return v.replace(/^(\d{5})(\d)/, '$1-$2');
  }

  // Carrega formas de entrega configuradas no admin
  async function loadShippingMethods() {
    try {
      const res = await fetch('/api/shipping_methods.php', { cache: 'no-store' });
      const data = await res.json();
      if (data && Array.isArray(data.methods)) {
        availableShippingMethods = data.methods.filter(m => m.active !== false);
      }
    } catch (e) {
      console.warn('Usando métodos de frete de contingência:', e);
      availableShippingMethods = [
        { id: 'sedex', name: 'Sedex Express (Seguro Especial Incluso)', price: 38.0, deadline: '2 a 4 dias úteis', freeAbove: 1000 },
        { id: 'pac', name: 'Standard Especial (PAC)', price: 22.0, deadline: '5 a 8 dias úteis', freeAbove: 600 }
      ];
    }
  }

  // Consulta automática de CEP (ViaCEP)
  async function lookupCEP(cepValue) {
    const clean = (cepValue || '').replace(/\D/g, '');
    if (clean.length !== 8) return;

    const loadingEl = document.getElementById('nte-chk-cep-loading');
    if (loadingEl) loadingEl.style.display = 'block';

    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setValue('nte-chk-street', data.logradouro || '');
        setValue('nte-chk-neighborhood', data.bairro || '');
        setValue('nte-chk-city', data.localidade || '');
        setValue('nte-chk-state', data.uf || '');
        // Foca automaticamente no número para agilizar a digitação
        const numInput = document.getElementById('nte-chk-number');
        if (numInput && !numInput.value) numInput.focus();
      }
    } catch (err) {
      console.warn('Erro ao consultar CEP:', err);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      updateProgress();
    }
  }

  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // Atualização em tempo real da Barra de Progresso
  function updateProgress() {
    const fields = [
      getValue('nte-chk-name').length >= 3,
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(getValue('nte-chk-email')),
      getValue('nte-chk-phone').replace(/\D/g, '').length >= 10,
      getValue('nte-chk-cpf').replace(/\D/g, '').length === 11,
      getValue('nte-chk-cep').replace(/\D/g, '').length === 8,
      getValue('nte-chk-street').length >= 3,
      getValue('nte-chk-number').length >= 1,
      Boolean(selectedShipping)
    ];

    const completedCount = fields.filter(Boolean).length;
    const percent = Math.min(100, Math.max(12, Math.round((completedCount / fields.length) * 100)));

    const fillEl = document.getElementById('nte-chk-progress-fill');
    if (fillEl) fillEl.style.width = `${percent}%`;

    // Atualiza indicadores de etapas
    const step1 = document.getElementById('nte-step-1');
    const step2 = document.getElementById('nte-step-2');
    const step3 = document.getElementById('nte-step-3');
    const step4 = document.getElementById('nte-step-4');

    const step1Ok = fields[0] && fields[1] && fields[2] && fields[3];
    const step2Ok = fields[4] && fields[5] && fields[6];
    const step3Ok = fields[7];

    if (step1) {
      step1.classList.toggle('completed', step1Ok);
      step1.classList.toggle('active', !step1Ok);
    }
    if (step2) {
      step2.classList.toggle('completed', step2Ok);
      step2.classList.toggle('active', step1Ok && !step2Ok);
    }
    if (step3) {
      step3.classList.toggle('completed', step3Ok);
      step3.classList.toggle('active', step2Ok && !step3Ok);
    }
    if (step4) {
      step4.classList.toggle('active', step1Ok && step2Ok && step3Ok);
    }
  }

  // Renderiza opções de frete disponíveis
  function renderShippingOptions() {
    const listEl = document.getElementById('nte-chk-shipping-list');
    if (!listEl) return;

    if (!availableShippingMethods.length) {
      listEl.innerHTML = '<div style="font-size:12px;color:#777;padding:8px 0;">Nenhuma forma de entrega disponível no momento.</div>';
      return;
    }

    listEl.innerHTML = availableShippingMethods.map((m, idx) => {
      const isFree = m.freeAbove && subtotalAmount >= m.freeAbove;
      const actualPrice = isFree ? 0 : Number(m.price || 0);
      const isSelected = selectedShipping && selectedShipping.id === m.id;
      const priceLabel = actualPrice === 0 ? '<span class="nte-shipping-free">Cortesia</span>' : fmtMoney(actualPrice);

      return `
        <div class="nte-shipping-option ${isSelected ? 'selected' : ''}" data-ship-id="${m.id}">
          <div class="nte-shipping-left">
            <div class="nte-radio-custom">
              <span class="nte-radio-dot"></span>
            </div>
            <div class="nte-shipping-info">
              <h4>${escapeHTML(m.name)}</h4>
              <p>${escapeHTML(m.deadline || 'Entrega Rápida')}</p>
            </div>
          </div>
          <div class="nte-shipping-price">${priceLabel}</div>
        </div>
      `;
    }).join('');

    // Adiciona listener aos cards de frete
    listEl.querySelectorAll('.nte-shipping-option').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.shipId;
        const found = availableShippingMethods.find(m => m.id === id);
        if (found) {
          const isFree = found.freeAbove && subtotalAmount >= found.freeAbove;
          selectedShipping = {
            ...found,
            effectivePrice: isFree ? 0 : Number(found.price || 0)
          };
          renderShippingOptions();
          updateTotals();
          updateProgress();
        }
      });
    });

    // Se nenhum estiver selecionado, seleciona o primeiro por padrão
    if (!selectedShipping && availableShippingMethods.length > 0) {
      const first = availableShippingMethods[0];
      const isFree = first.freeAbove && subtotalAmount >= first.freeAbove;
      selectedShipping = {
        ...first,
        effectivePrice: isFree ? 0 : Number(first.price || 0)
      };
      renderShippingOptions();
      updateTotals();
    }
  }

  // Atualiza totais financeiros na coluna direita
  function updateTotals() {
    const shippingPrice = selectedShipping ? selectedShipping.effectivePrice : 0;
    const finalTotal = subtotalAmount + shippingPrice;

    const subEl = document.getElementById('nte-chk-subtotal');
    const shipEl = document.getElementById('nte-chk-shipping-val');
    const totEl = document.getElementById('nte-chk-total');

    if (subEl) subEl.textContent = fmtMoney(subtotalAmount);
    if (shipEl) shipEl.textContent = shippingPrice === 0 ? 'Cortesia' : fmtMoney(shippingPrice);
    if (totEl) totEl.textContent = fmtMoney(finalTotal);
  }

  // Renderiza a lista de peças da mala no resumo
  function renderCartItems() {
    const listEl = document.getElementById('nte-chk-items-list');
    const countEl = document.getElementById('nte-chk-items-count');
    if (!listEl) return;

    if (countEl) countEl.textContent = `${currentItems.length} ${currentItems.length === 1 ? 'item' : 'itens'}`;

    listEl.innerHTML = currentItems.map(item => {
      const img = item.image || (item.images && item.images[0]) || 'assets/images/logo-black.png';
      const name = escapeHTML(item.name || 'Produto');
      const brand = escapeHTML(item.brand || 'NT Eleganz');
      const size = item.size ? `Tam: ${escapeHTML(item.size)}` : '';
      const color = item.color ? `Cor: ${escapeHTML(item.color)}` : '';
      const meta = [size, color, `Qtd: ${item.qty || 1}`].filter(Boolean).join(' • ');
      const price = typeof item.price === 'string' ? item.price : fmtMoney(item.price);

      return `
        <div class="nte-summary-item">
          <img src="${escapeHTML(img)}" alt="${name}" class="nte-item-img" />
          <div class="nte-details">
            <div class="nte-item-brand">${brand}</div>
            <div class="nte-item-title">${name}</div>
            <div class="nte-item-meta">${meta}</div>
          </div>
          <div class="nte-item-price">${price}</div>
        </div>
      `;
    }).join('');
  }

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  // Constrói o HTML estrutural do modal de checkout de luxo
  function buildCheckoutModal() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'nte-checkout-overlay';
    overlayEl.innerHTML = `
      <div class="nte-checkout-modal" role="dialog" aria-modal="true" aria-labelledby="nte-chk-title">
        
        <!-- Header -->
        <div class="nte-checkout-header">
          <div class="nte-checkout-brand">
            <h2 id="nte-chk-title">NT ELEGANZ</h2>
            <span>ATEMPORAL LUXURY & CURATION</span>
          </div>
          <div class="nte-checkout-security">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
            <span>Ambiente Criptografado 256-Bit</span>
          </div>
          <button class="nte-checkout-close" id="nte-chk-close-btn" aria-label="Fechar checkout">&times;</button>
        </div>

        <!-- Barra de Progresso Dinâmica -->
        <div class="nte-progress-container">
          <div class="nte-progress-labels">
            <div class="nte-progress-step active" id="nte-step-1">
              <span class="nte-progress-step-num">1</span> Identificação
            </div>
            <div class="nte-progress-step" id="nte-step-2">
              <span class="nte-progress-step-num">2</span> Endereço
            </div>
            <div class="nte-progress-step" id="nte-step-3">
              <span class="nte-progress-step-num">3</span> Frete
            </div>
            <div class="nte-progress-step" id="nte-step-4">
              <span class="nte-progress-step-num">4</span> Pagamento
            </div>
          </div>
          <div class="nte-progress-track">
            <div class="nte-progress-fill" id="nte-chk-progress-fill"></div>
          </div>
        </div>

        <!-- Corpo: 2 Colunas -->
        <div class="nte-checkout-body">
          
          <!-- Coluna 1: Formulário de Conclusão -->
          <div class="nte-checkout-form-col">
            
            <!-- Etapa 1: Dados do Cliente -->
            <div class="nte-section-card">
              <div class="nte-section-header">
                <div class="nte-section-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div class="nte-section-title">1. Dados Pessoais & Contato</div>
              </div>
              <div class="nte-form-grid">
                <div class="nte-input-group span-2">
                  <label class="nte-label" for="nte-chk-name">Nome Completo *</label>
                  <input type="text" id="nte-chk-name" class="nte-input" placeholder="Ex: Roberto Almeida" autocomplete="name" required />
                </div>
                <div class="nte-input-group span-2">
                  <label class="nte-label" for="nte-chk-email">E-mail <span class="opt">(para confirmação do pedido)</span> *</label>
                  <input type="email" id="nte-chk-email" class="nte-input" placeholder="roberto@email.com" autocomplete="email" required />
                </div>
                <div class="nte-input-group">
                  <label class="nte-label" for="nte-chk-phone">WhatsApp / Celular *</label>
                  <input type="tel" id="nte-chk-phone" class="nte-input" placeholder="(00) 00000-0000" autocomplete="tel" required />
                </div>
                <div class="nte-input-group">
                  <label class="nte-label" for="nte-chk-cpf">CPF <span class="opt">(para envio segurado)</span> *</label>
                  <input type="text" id="nte-chk-cpf" class="nte-input" placeholder="000.000.000-00" required />
                </div>
              </div>
            </div>

            <!-- Etapa 2: Endereço de Entrega -->
            <div class="nte-section-card">
              <div class="nte-section-header">
                <div class="nte-section-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div class="nte-section-title">2. Endereço de Entrega</div>
              </div>
              <div class="nte-form-grid">
                <div class="nte-input-group span-2">
                  <label class="nte-label" for="nte-chk-cep">CEP *</label>
                  <div class="nte-input-wrapper">
                    <input type="text" id="nte-chk-cep" class="nte-input" placeholder="00000-000" maxlength="9" autocomplete="postal-code" required />
                    <button type="button" class="nte-cep-btn" id="nte-chk-cep-btn">Buscar</button>
                  </div>
                  <div class="nte-cep-loading" id="nte-chk-cep-loading">Localizando endereço com alta precisão...</div>
                </div>
                <div class="nte-input-group span-2">
                  <label class="nte-label" for="nte-chk-street">Rua / Logradouro *</label>
                  <input type="text" id="nte-chk-street" class="nte-input" placeholder="Avenida Brasil" required />
                </div>
                <div class="nte-input-group">
                  <label class="nte-label" for="nte-chk-number">Número *</label>
                  <input type="text" id="nte-chk-number" class="nte-input" placeholder="1020" required />
                </div>
                <div class="nte-input-group">
                  <label class="nte-label" for="nte-chk-complement">Complemento <span class="opt">(opcional)</span></label>
                  <input type="text" id="nte-chk-complement" class="nte-input" placeholder="Apto 42, Bloco B" />
                </div>
                <div class="nte-input-group">
                  <label class="nte-label" for="nte-chk-neighborhood">Bairro *</label>
                  <input type="text" id="nte-chk-neighborhood" class="nte-input" placeholder="Jardins" required />
                </div>
                <div class="nte-input-group">
                  <label class="nte-label" for="nte-chk-city">Cidade / Estado *</label>
                  <div style="display:flex;gap:6px;">
                    <input type="text" id="nte-chk-city" class="nte-input" style="flex:1;" placeholder="São Paulo" required />
                    <input type="text" id="nte-chk-state" class="nte-input" style="width:65px;text-transform:uppercase;" placeholder="SP" maxlength="2" required />
                  </div>
                </div>
              </div>
            </div>

            <!-- Etapa 3: Opções de Envio -->
            <div class="nte-section-card">
              <div class="nte-section-header">
                <div class="nte-section-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                </div>
                <div class="nte-section-title">3. Forma de Envio</div>
              </div>
              <div class="nte-shipping-list" id="nte-chk-shipping-list">
                <!-- Preenchido dinamicamente via API -->
              </div>
            </div>

          </div>

          <!-- Coluna 2: Resumo do Pedido & Pagamento -->
          <div class="nte-checkout-summary-col">
            <div class="nte-summary-header">
              <span>Sua Mala de Compras</span>
              <span class="nte-summary-badge" id="nte-chk-items-count">0 itens</span>
            </div>

            <!-- Lista de Produtos -->
            <div class="nte-cart-items-scroll" id="nte-chk-items-list"></div>

            <!-- Totais -->
            <div class="nte-totals-box">
              <div class="nte-total-row">
                <span>Subtotal dos Produtos</span>
                <span id="nte-chk-subtotal">R$ 0,00</span>
              </div>
              <div class="nte-total-row">
                <span>Frete e Seguro</span>
                <span id="nte-chk-shipping-val">Calculando...</span>
              </div>
              <div class="nte-total-row final">
                <span>Total a Pagar</span>
                <span class="val" id="nte-chk-total">R$ 0,00</span>
              </div>
            </div>

            <!-- Botões de Ação -->
            <button type="button" class="nte-btn-infinite" id="nte-chk-pay-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5zm4 4h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>
              Pagar com Pix ou Cartão até 12x
            </button>

            <button type="button" class="nte-btn-wpp-alt" id="nte-chk-wpp-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/></svg>
              Concluir com Concierge no WhatsApp
            </button>

            <div class="nte-trust-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
              Garantia de Autenticidade & Embalagem Selada
            </div>

          </div>

        </div>

      </div>
    `;

    document.body.appendChild(overlayEl);

    // Eventos de Fechamento
    overlayEl.querySelector('#nte-chk-close-btn').addEventListener('click', closeCheckout);
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) closeCheckout();
    });

    // Mascaramento de campos
    const phoneInput = document.getElementById('nte-chk-phone');
    if (phoneInput) phoneInput.addEventListener('input', e => { e.target.value = maskPhone(e.target.value); updateProgress(); });

    const cpfInput = document.getElementById('nte-chk-cpf');
    if (cpfInput) cpfInput.addEventListener('input', e => { e.target.value = maskCPF(e.target.value); updateProgress(); });

    const cepInput = document.getElementById('nte-chk-cep');
    if (cepInput) {
      cepInput.addEventListener('input', e => {
        e.target.value = maskCEP(e.target.value);
        if (e.target.value.replace(/\D/g, '').length === 8) {
          lookupCEP(e.target.value);
        }
        updateProgress();
      });
    }

    const cepBtn = document.getElementById('nte-chk-cep-btn');
    if (cepBtn) cepBtn.addEventListener('click', () => lookupCEP(getValue('nte-chk-cep')));

    // Listeners gerais para barra de progresso
    ['nte-chk-name', 'nte-chk-email', 'nte-chk-street', 'nte-chk-number', 'nte-chk-complement', 'nte-chk-neighborhood', 'nte-chk-city', 'nte-chk-state'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateProgress);
    });

    // Botão de Pagamento InfinitePay
    const payBtn = document.getElementById('nte-chk-pay-btn');
    if (payBtn) payBtn.addEventListener('click', processInfinitePayCheckout);

    // Botão de Fechamento via WhatsApp
    const wppBtn = document.getElementById('nte-chk-wpp-btn');
    if (wppBtn) wppBtn.addEventListener('click', processWhatsAppFallback);
  }

  // Validação dos campos obrigatórios
  function validateFields() {
    const name = getValue('nte-chk-name');
    const email = getValue('nte-chk-email');
    const phone = getValue('nte-chk-phone').replace(/\D/g, '');
    const cpf = getValue('nte-chk-cpf').replace(/\D/g, '');
    const cep = getValue('nte-chk-cep').replace(/\D/g, '');
    const street = getValue('nte-chk-street');
    const number = getValue('nte-chk-number');

    if (!name || name.length < 3) {
      alert('Por favor, informe seu Nome Completo.');
      document.getElementById('nte-chk-name')?.focus();
      return false;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Por favor, informe um E-mail válido para receber a confirmação.');
      document.getElementById('nte-chk-email')?.focus();
      return false;
    }
    if (phone.length < 10) {
      alert('Por favor, informe um número de WhatsApp ou celular válido com DDD.');
      document.getElementById('nte-chk-phone')?.focus();
      return false;
    }
    if (cpf.length !== 11) {
      alert('Por favor, informe seu CPF (11 dígitos) para a emissão do envio segurado.');
      document.getElementById('nte-chk-cpf')?.focus();
      return false;
    }
    if (cep.length !== 8) {
      alert('Por favor, informe um CEP válido com 8 dígitos.');
      document.getElementById('nte-chk-cep')?.focus();
      return false;
    }
    if (!street || !number) {
      alert('Por favor, preencha o endereço de entrega e o número.');
      document.getElementById('nte-chk-number')?.focus();
      return false;
    }
    if (!selectedShipping) {
      alert('Por favor, selecione uma forma de envio.');
      return false;
    }
    return true;
  }

  function getCustomerPayload() {
    return {
      name: getValue('nte-chk-name'),
      email: getValue('nte-chk-email'),
      phone: getValue('nte-chk-phone'),
      cpf: getValue('nte-chk-cpf'),
      address: {
        cep: getValue('nte-chk-cep'),
        street: getValue('nte-chk-street'),
        number: getValue('nte-chk-number'),
        complement: getValue('nte-chk-complement'),
        neighborhood: getValue('nte-chk-neighborhood'),
        city: getValue('nte-chk-city'),
        state: getValue('nte-chk-state')
      }
    };
  }

  // Finalização oficial via InfinitePay
  async function processInfinitePayCheckout() {
    if (!validateFields()) return;

    const payBtn = document.getElementById('nte-chk-pay-btn');
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
        Gerando Sessão de Pagamento Seguro...
      `;
    }

    const payload = {
      customer: getCustomerPayload(),
      items: currentItems,
      shipping: selectedShipping,
      value: fmtMoney(subtotalAmount + (selectedShipping?.effectivePrice || 0))
    };

    try {
      const res = await fetch('/api/infinitepay.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (!res.ok || !result.checkoutUrl) {
        throw new Error(result.error || result.details || 'Falha ao conectar com o gateway.');
      }

      // Salva dados no storage para facilidade futura
      try {
        localStorage.setItem('nte_saved_customer', JSON.stringify(payload.customer));
      } catch (e) {}

      // Limpa o carrinho
      if (window.ntCart && typeof window.ntCart.clear === 'function') {
        window.ntCart.clear();
      }

      // Redireciona imediatamente para o checkout seguro InfinitePay da NT Eleganz
      window.location.href = result.checkoutUrl;

    } catch (err) {
      console.error('Erro no checkout InfinitePay:', err);
      alert('Não foi possível gerar a sessão de pagamento no momento: ' + err.message + '\n\nVocê também pode concluir via WhatsApp.');
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.innerHTML = 'Tentar Novamente (InfinitePay)';
      }
    }
  }

  // Fallback via WhatsApp com o pedido já detalhado
  async function processWhatsAppFallback() {
    if (!validateFields()) return;
    const customer = getCustomerPayload();
    const shippingName = selectedShipping?.name || 'Envio';
    const totalVal = fmtMoney(subtotalAmount + (selectedShipping?.effectivePrice || 0));

    // Salva o pedido na API antes de redirecionar
    const orderPayload = {
      clientName: customer.name,
      phone: customer.phone,
      email: customer.email,
      customer: customer,
      items: currentItems,
      shipping: selectedShipping,
      value: totalVal,
      status: 'novo',
      paymentMethod: 'whatsapp'
    };

    let orderCode = '#NTE-' + Math.floor(1000 + Math.random() * 9000);
    try {
      const r = await fetch('/api/orders.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const created = await r.json();
      if (created?.order?.code) orderCode = created.order.code;
    } catch (e) {}

    // Monta a mensagem nobre para a Concierge
    const lines = [
      `*NT ELEGANZ — NOVO PEDIDO ${orderCode}*`,
      ``,
      `*Cliente:* ${customer.name}`,
      `*WhatsApp:* ${customer.phone}`,
      `*E-mail:* ${customer.email}`,
      `*Endereço:* ${customer.address.street}, ${customer.address.number} - ${customer.address.city}/${customer.address.state} (CEP: ${customer.address.cep})`,
      `*Frete Escolhido:* ${shippingName}`,
      ``,
      `*Peças:*`
    ];
    currentItems.forEach(i => {
      lines.push(`• ${i.qty}x ${i.brand} - ${i.name} (${i.size || 'Tam Único'}) — ${i.price}`);
    });
    lines.push(``);
    lines.push(`*Total Geral:* ${totalVal}`);
    lines.push(`_Gostaria de concluir o pagamento com a equipe._`);

    const waNumber = '5575999283496';
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(lines.join('\n'))}`;

    // Limpa o carrinho e redireciona
    if (window.ntCart && typeof window.ntCart.clear === 'function') {
      window.ntCart.clear();
    }
    window.location.href = waUrl;
  }

  function parsePrice(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const clean = String(val).replace(/[^\d,.]/g, '');
    if (clean.includes(',')) {
      return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(clean) || 0;
  }

  // Recupera dados salvos de compras anteriores
  function prefillSavedCustomer() {
    try {
      const savedRaw = localStorage.getItem('nte_saved_customer');
      if (savedRaw) {
        const c = JSON.parse(savedRaw);
        if (c.name) setValue('nte-chk-name', c.name);
        if (c.email) setValue('nte-chk-email', c.email);
        if (c.phone) setValue('nte-chk-phone', c.phone);
        if (c.cpf) setValue('nte-chk-cpf', c.cpf);
        if (c.address) {
          if (c.address.cep) setValue('nte-chk-cep', c.address.cep);
          if (c.address.street) setValue('nte-chk-street', c.address.street);
          if (c.address.number) setValue('nte-chk-number', c.address.number);
          if (c.address.complement) setValue('nte-chk-complement', c.address.complement);
          if (c.address.neighborhood) setValue('nte-chk-neighborhood', c.address.neighborhood);
          if (c.address.city) setValue('nte-chk-city', c.address.city);
          if (c.address.state) setValue('nte-chk-state', c.address.state);
        }
      }
    } catch (e) {}
  }

  // ── API Pública ──
  window.nteCheckout = {
    async open(items, total) {
      if (!items || !items.length) {
        alert('Sua mala de compras está vazia.');
        return;
      }
      currentItems = [...items];

      // Calcula subtotal
      subtotalAmount = currentItems.reduce((acc, item) => {
        const p = parsePrice(item.price);
        const q = item.qty || 1;
        return acc + (p * q);
      }, 0);

      buildCheckoutModal();
      prefillSavedCustomer();
      renderCartItems();
      await loadShippingMethods();
      renderShippingOptions();
      updateTotals();
      updateProgress();

      // Exibe com transição de luxo
      requestAnimationFrame(() => {
        if (overlayEl) {
          overlayEl.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      });
    },

    close() {
      closeCheckout();
    }
  };

  function closeCheckout() {
    if (overlayEl) {
      overlayEl.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

})();
