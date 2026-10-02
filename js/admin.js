/* ============================================
   NT ELEGANZ — ADMIN DASHBOARD LOGIC
   ============================================ */

(function () {
  'use strict';

  // ── State ──
  let allProducts = [];
  let allOrders = [];
  let allLeads = [];
  let knownLeadIds = new Set();
  let leadsInitialized = false;
  let editingSizes = [];
  let editingColors = [];
  let pendingImages = [];
  let confirmCallback = null;
  let currentDBMode = 'local';
  let productCurrentPage = 1;
  let productPageSize = 20;

  // ── Loader ──
  let loaderTimer = null;
  const LOADER_DELAY_MS = 300;

  function showLoader() {
    const loader = document.getElementById('admin-loader');
    if (loader) loader.classList.remove('hidden');
  }

  function hideLoader() {
    const loader = document.getElementById('admin-loader');
    if (loader) loader.classList.add('hidden');
  }

  function scheduleLoader() {
    clearTimeout(loaderTimer);
    loaderTimer = setTimeout(showLoader, LOADER_DELAY_MS);
  }

  function cancelLoader() {
    clearTimeout(loaderTimer);
    hideLoader();
  }

  // ── Format helpers ──
  const fmt = {
    currency(val) {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    },
    parsePrice(str) {
      if (!str) return 0;
      return parseFloat(String(str).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    },
    date(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },
  };

  function setupPriceInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.priceFormatted) return;
    input.dataset.priceFormatted = 'true';

    function rawOf(value) {
      const s = String(value || '').replace(/[^\d,]/g, '');
      const i = s.indexOf(',');
      if (i === -1) return s;
      return s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
    }

    function toDisplay(raw) {
      if (!raw) return '';
      const i = raw.indexOf(',');
      const wholeRaw = i === -1 ? raw : raw.slice(0, i);
      const cents = i === -1 ? '' : raw.slice(i + 1);
      const wholeNum = parseInt(wholeRaw.replace(/\D/g, '') || '0', 10);
      const whole = (Number.isFinite(wholeNum) ? wholeNum : 0).toLocaleString('pt-BR');
      return 'R$ ' + whole + (i === -1 ? ',00' : ',' + cents);
    }

    let raw = rawOf(input.value);

    function render() {
      input.value = toDisplay(raw);
      const c = input.value.length;
      input.setSelectionRange(c, c);
    }

    input.addEventListener('beforeinput', function (e) {
      if (e.inputType === 'deleteContentBackward') {
        e.preventDefault();
        raw = raw.slice(0, -1);
        render();
        return;
      }
      const d = e.data;
      if (d === null || d === undefined) return;
      e.preventDefault();
      const i = raw.indexOf(',');
      const isComma = d === ',';
      if (isComma) {
        if (i !== -1) return;
        raw += ',';
      } else if (/^\d$/.test(d)) {
        if (i !== -1) {
          if (raw.slice(i + 1).length >= 2) return;
        } else if (raw.length >= 9) {
          return;
        }
        raw += d;
      } else {
        return;
      }
      render();
    });

    input.addEventListener('input', function () {
      const next = rawOf(this.value);
      if (next !== raw) { raw = next; }
      render();
    });

    input.addEventListener('blur', function () {
      if (raw && raw.includes(',')) {
        const i = raw.indexOf(',');
        let cents = raw.slice(i + 1);
        if (cents.length === 1) raw = raw + '0';
        else if (cents.length === 0) raw = raw + '00';
      }
      render();
    });

    input.addEventListener('focus', function () {
      raw = rawOf(this.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') this.blur();
    });

    render();
  }

  function productCategory(product) {
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const explicit = normalize(product.category);
    if (['camisetas', 'shorts', 'calcados', 'hoodies'].includes(explicit)) return explicit;
    const text = normalize(`${product.name || ''} ${product.category || ''}`);
    if (/calcado|sandalia|tenis|sapato|sneaker|birkenstock/.test(text)) return 'calcados';
    if (/short|bermuda|swim|trunk/.test(text)) return 'shorts';
    if (/hood|moletom|puffer|jaqueta|jacket|biker|leather/.test(text)) return 'hoodies';
    return 'camisetas';
  }

  const categoryLabel = value => ({ camisetas: 'Camisetas', shorts: 'Shorts', calcados: 'Calçados', hoodies: 'Hoodies' })[value] || value;

  // ── Panel Navigation ──
  const PANEL_TITLES = {
    overview: 'Visão Geral',
    financeiro: 'Financeiro',
    produtos: 'Produtos',
    faq: 'Perguntas frequentes',
    pedidos: 'Pedidos',
    leads: 'Leads do WhatsApp',

    configuracoes: 'Configurações',
  };

  window.showPanel = async function (panelId, navEl) {
    // Update panels
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + panelId)?.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (navEl) navEl.classList.add('active');

    // Update topbar title
    document.getElementById('topbar-title').textContent = PANEL_TITLES[panelId] || '';
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.body.classList.remove('admin-menu-open');
    const mobileMenuButton = document.querySelector('.mobile-menu-button');
    mobileMenuButton?.setAttribute('aria-expanded', 'false');

    // Show loader for slow panel loads
    scheduleLoader();

    try {
      // Load panel data
      if (panelId === 'overview') await loadOverview();
      if (panelId === 'financeiro') await loadFinanceiro();
      if (panelId === 'produtos') syncProducts();
      if (panelId === 'faq') loadFaq();

      if (panelId === 'pedidos') refreshOrders();
      if (panelId === 'leads') {
        renderLeadsTable();
        markLeadsRead();
      }
      if (panelId === 'configuracoes') loadSettings();
    } finally {
      cancelLoader();
    }
  };

  // ── FAQ ──
  const FAQ_ID = 'faq-content';
  const DEFAULT_FAQ = [
    { question: 'Como funciona o processo de compra?', answer: 'É simples! Escolha o produto que deseja, adicione ao carrinho e clique em "Finalizar via WhatsApp". Você será redirecionado diretamente para uma conversa conosco com os detalhes do seu pedido já preenchidos. Nosso especialista confirma a disponibilidade e formas de pagamento.' },
    { question: 'As peças são originais e autenticadas?', answer: 'Sim, 100%. Trabalhamos apenas com peças originais de procedência comprovada. Todas as nossas grifes são autenticadas antes de chegar até você.' },
    { question: 'Quais são as formas de pagamento disponíveis?', answer: 'Aceitamos PIX e cartão de crédito. As condições de pagamento são confirmadas diretamente pelo WhatsApp após a seleção do produto.' },
    { question: 'Enviam para todo Brasil?', answer: 'Sim, o envio é realizado pelos correios para todo território nacional, consulte opções de envios disponíveis no fechamento da sua compra.' },
  ];
  let faqItems = [];

  function renderFaqEditor() {
    const list = document.getElementById('faq-admin-list');
    if (!list) return;
    if (!faqItems.length) {
      list.innerHTML = '<div class="empty-state"><p>Nenhuma pergunta cadastrada</p><small>Adicione a primeira pergunta para exibi-la no site.</small></div>';
      return;
    }
    list.innerHTML = faqItems.map((item, index) => `
      <article class="faq-admin-item">
        <div class="faq-admin-item__header">
          <span class="faq-admin-number">${String(index + 1).padStart(2, '0')}</span>
          <strong>${escHtml(item.question || 'Nova pergunta')}</strong>
          <div class="faq-admin-actions">
            <button class="btn btn-secondary btn-sm btn-icon-only" type="button" onclick="moveFaqItem(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Mover para cima" aria-label="Mover pergunta para cima">↑</button>
            <button class="btn btn-secondary btn-sm btn-icon-only" type="button" onclick="moveFaqItem(${index}, 1)" ${index === faqItems.length - 1 ? 'disabled' : ''} title="Mover para baixo" aria-label="Mover pergunta para baixo">↓</button>
            <button class="btn btn-danger btn-sm" type="button" onclick="removeFaqItem(${index})">Excluir</button>
          </div>
        </div>
        <div class="faq-admin-fields">
          <div class="form-group"><label for="faq-question-${index}">Pergunta</label><input class="form-control" id="faq-question-${index}" value="${escHtml(item.question)}" oninput="updateFaqItem(${index}, 'question', this.value)"></div>
          <div class="form-group"><label for="faq-answer-${index}">Resposta</label><textarea class="form-control" id="faq-answer-${index}" rows="4" oninput="updateFaqItem(${index}, 'answer', this.value)">${escHtml(item.answer)}</textarea></div>
        </div>
      </article>`).join('');
  }

  async function loadFaq() {
    try {
      const data = await window.ntDB?.settings.getById(FAQ_ID);
      faqItems = (Array.isArray(data?.items) ? data.items : DEFAULT_FAQ).map(item => ({ question: item.question || '', answer: item.answer || '' }));
      renderFaqEditor();
    } catch (error) {
      showToast('!', 'Não foi possível carregar o FAQ', error.message);
    }
  }

  window.updateFaqItem = (index, field, value) => { if (faqItems[index]) faqItems[index][field] = value; };
  window.addFaqItem = () => { faqItems.push({ question: '', answer: '' }); renderFaqEditor(); document.getElementById(`faq-question-${faqItems.length - 1}`)?.focus(); };
  window.removeFaqItem = index => { faqItems.splice(index, 1); renderFaqEditor(); };
  window.moveFaqItem = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= faqItems.length) return;
    [faqItems[index], faqItems[target]] = [faqItems[target], faqItems[index]];
    renderFaqEditor();
  };
  window.saveFaq = async function () {
    const items = faqItems.map(item => ({ question: item.question.trim(), answer: item.answer.trim() }));
    if (!items.length || items.some(item => !item.question || !item.answer)) {
      showToast('!', 'Preencha todas as perguntas e respostas', 'Nenhum campo pode ficar vazio.');
      return;
    }
    const button = document.getElementById('faq-save-button');
    if (button) { button.disabled = true; button.textContent = 'Salvando…'; }
    try {
      const existing = await window.ntDB.settings.getById(FAQ_ID);
      if (existing) await window.ntDB.settings.update(FAQ_ID, { items });
      else await window.ntDB.settings.add({ id: FAQ_ID, items });
      faqItems = items;
      renderFaqEditor();
      showToast('✓', 'FAQ atualizado', `${items.length} pergunta${items.length === 1 ? '' : 's'} publicada${items.length === 1 ? '' : 's'}.`);
    } catch (error) {
      showToast('!', 'Não foi possível salvar o FAQ', error.message);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Salvar alterações'; }
    }
  };

  // ── Init ──
  async function init() {
    scheduleLoader();

    try {
      // Force modal visibility via global CSS (last resort against CSS conflicts)
      if (!document.getElementById('admin-modal-force-css')) {
        const style = document.createElement('style');
        style.id = 'admin-modal-force-css';
        style.textContent = `
          .modal-overlay.open,
          .modal-overlay.open .modal {
            opacity: 1 !important;
            visibility: visible !important;
            display: flex !important;
          }
          .modal-overlay.open .modal {
            opacity: 1 !important;
            visibility: visible !important;
            position: relative !important;
            z-index: 201 !important;
            background: var(--bg-surface) !important;
            border: 1px solid var(--border) !important;
          }
          .modal-overlay {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          /* Animations for dynamic modals */
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `;
        document.head.appendChild(style);
      }
      // Init db
      const dbResult = await window.ntDB?.init();
      if (dbResult) {
        currentDBMode = dbResult.mode;
        const labels = { local: 'LocalStorage', firebase: 'Firebase', supabase: 'Supabase', hostinger: 'Hostinger (produtos)' };
        document.getElementById('db-mode-label').textContent = labels[dbResult.mode] || 'Local';
        if (dbResult.mode !== 'supabase' && window.ntDB.config?.().mode === 'supabase') {
          throw new Error(dbResult.error || 'Não foi possível conectar ao Supabase. O painel não será salvo no LocalStorage.');
        }
      }

      // Set username
      const username = window.ntAuth?.getUsername() || 'admin';
      const el = document.getElementById('sidebar-username');
      const avatar = document.getElementById('sidebar-avatar');
      if (el) el.textContent = username;
      if (avatar) avatar.textContent = username.charAt(0).toUpperCase();

      // Load data. Os produtos vêm com force para o painel abrir mostrando o
      // estado real do servidor, não o snapshot em cache do navegador.
      allProducts = await window.ntDB?.products.reload() || [];
      allOrders = await window.ntDB?.orders.getAll() || [];
      await refreshLeads(false);

      // Load overview
      loadOverview();

    // Mobile sidebar toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-button');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.querySelector('.mobile-sidebar-backdrop');
    if (mobileMenuBtn && sidebar && backdrop) {
      mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('open', isOpen);
        mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
        document.body.classList.toggle('admin-menu-open', isOpen);
      });
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        backdrop.classList.remove('open');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('admin-menu-open');
      });
    }

    // Desktop sidebar collapse/expand toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const adminMain = document.querySelector('.admin-main');
    if (sidebarToggle && sidebar && adminMain) {
      sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = sidebar.classList.toggle('collapsed');
        adminMain.classList.toggle('sidebar-collapsed', isCollapsed);
        sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
      });
    }

    // Nav items - event delegation (works with inline onclick as fallback)
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
      sidebarNav.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem && !navItem.classList.contains('nav-section-label')) {
          const panelId = navItem.dataset.panel;
          if (panelId) showPanel(panelId, navItem);
        }
      });
    }

  } catch (error) {
    console.error('Erro ao inicializar admin:', error);
    showToast('!', 'Erro ao carregar painel', error.message);
  } finally {
    cancelLoader();
  }
  }

  // ══════════════════════════════════════════
  //  WHATSAPP LEADS
  // ══════════════════════════════════════════
  function unreadLeads() {
    return allLeads.filter(lead => !lead.readAt).length;
  }

  function updateLeadNotifications() {
    const count = unreadLeads();
    ['leads-nav-badge', 'leads-topbar-badge'].forEach(id => {
      const badge = document.getElementById(id);
      if (!badge) return;
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
    });
    document.getElementById('leads-topbar-button')?.classList.toggle('has-notifications', count > 0);
  }

  function leadInterest(lead) {
    if (lead.productName) return lead.productBrand ? `${lead.productBrand} — ${lead.productName}` : lead.productName;
    if (lead.type === 'atendimento') return 'Atendimento geral';
    if (lead.type === 'carrinho') return `${lead.itemCount || ''} item(ns) no carrinho`;
    return 'Contato pelo site';
  }

  function renderLeadsTable() {
    const tbody = document.getElementById('leads-tbody');
    if (!tbody) return;
    const filter = document.getElementById('lead-filter-status')?.value || '';
    const leads = [...allLeads]
      .filter(lead => !filter || lead.status === filter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!leads.length) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>Nenhum lead encontrado</p><small>Os contatos iniciados pelo WhatsApp aparecerão aqui.</small></div></td></tr>';
      return;
    }
    tbody.innerHTML = leads.map(lead => `
      <tr>
        <td><strong style="color:var(--text-primary); font-weight:500;">${escHtml(lead.client || 'Novo contato')}</strong><br><span style="font-size:11px;color:var(--text-muted);">${escHtml(lead.page || 'Site')}</span></td>
        <td>${escHtml(leadInterest(lead))}${lead.value ? `<br><span style="font-size:11px;color:var(--text-muted);">${escHtml(lead.value)}</span>` : ''}</td>
        <td><span class="badge badge-info">WhatsApp</span></td>
        <td><select class="admin-select" style="font-size:10px; padding:4px 24px 4px 6px;" onchange="updateLeadStatus('${escHtml(lead.id)}', this.value)">${['novo','em_atendimento','convertido','arquivado'].map(status => `<option value="${status}" ${lead.status === status ? 'selected' : ''}>${status === 'em_atendimento' ? 'Em atendimento' : status.charAt(0).toUpperCase() + status.slice(1)}</option>`).join('')}</select></td>
        <td style="font-size:11px;">${fmt.date(lead.createdAt)}</td>
      </tr>`).join('');
  }

  async function markLeadsRead() {
    const unread = allLeads.filter(lead => !lead.readAt);
    if (!unread.length) return;
    const readAt = new Date().toISOString();
    unread.forEach(lead => { lead.readAt = readAt; });
    updateLeadNotifications();
    try { await Promise.all(unread.map(lead => window.ntDB.leads.update(lead.id, { readAt }))); }
    catch (error) { console.warn('Não foi possível confirmar a leitura dos leads:', error); }
  }

  window.refreshLeads = async function (manual = false) {
    try {
      const leads = await window.ntDB?.leads?.getAll() || [];
      const ids = new Set(leads.map(lead => lead.id));
      const newLeads = leads.filter(lead => !knownLeadIds.has(lead.id));
      allLeads = leads;
      knownLeadIds = ids;
      updateLeadNotifications();
      renderLeadsTable();
      if (leadsInitialized && newLeads.length) showToast('🔔', `${newLeads.length} novo${newLeads.length > 1 ? 's' : ''} lead${newLeads.length > 1 ? 's' : ''}`, leadInterest(newLeads[0]));
      if (manual) showToast('↻', 'Leads atualizados', `${leads.length} contato(s) registrado(s)`);
      leadsInitialized = true;
    } catch (error) {
      console.warn('Não foi possível carregar os leads:', error);
      if (manual) showToast('!', 'Falha ao atualizar leads', 'Verifique a conexão do banco de dados.');
    }
  };

  window.filterLeads = renderLeadsTable;
  window.updateLeadStatus = async function (id, status) {
    const lead = allLeads.find(item => item.id === id);
    if (!lead) return;
    try {
      await window.ntDB.leads.update(id, { status });
      lead.status = status;
      renderLeadsTable();
      showToast('✓', 'Lead atualizado', status === 'em_atendimento' ? 'Em atendimento' : status);
    } catch (error) { showToast('!', 'Não foi possível atualizar o lead', error.message); }
  };

  // ══════════════════════════════════════════
  //  OVERVIEW PANEL
  // ══════════════════════════════════════════

  async function loadOverview() {
    const totalRevenue = allOrders
      .filter(o => o.status !== 'cancelado')
      .reduce((sum, o) => sum + fmt.parsePrice(o.value), 0);

    const activeProducts = allProducts.filter(p => p.active !== false).length;
    const ticketMedio = allOrders.length > 0 ? totalRevenue / allOrders.filter(o => o.status !== 'cancelado').length : 0;

    // KPI Cards
    setText('kpi-revenue', fmt.currency(totalRevenue));
    setText('kpi-orders', allOrders.length);
    setText('kpi-products', activeProducts);
    setText('kpi-ticket', fmt.currency(ticketMedio));

    // Month orders trend
    const thisMonth = allOrders.filter(o => {
      const d = new Date(o.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    setText('kpi-orders-trend', `${thisMonth} este mês`);

    // Revenue chart
    await drawRevenueChart('revenue-chart');

    // Recent orders
    renderRecentOrders();
  }

  function getOrderThumbnail(o) {
    if (!o) return '';
    if (o.imageUrl && typeof o.imageUrl === 'string' && o.imageUrl.trim() !== '') {
      return o.imageUrl;
    }
    if (Array.isArray(o.items) && o.items[0]?.image) {
      return o.items[0].image;
    }
    if (o.productId && allProducts.length) {
      const p = allProducts.find(x => String(x.id) === String(o.productId));
      if (p) return p.image || (Array.isArray(p.images) && p.images[0]) || '';
    }
    if (o.productName && allProducts.length) {
      const p = allProducts.find(x => x.name && x.name.toLowerCase() === o.productName.toLowerCase());
      if (p) return p.image || (Array.isArray(p.images) && p.images[0]) || '';
    }
    return '';
  }

  function renderRecentOrders() {
    const tbody = document.getElementById('recent-orders-body');
    if (!tbody) return;

    const recent = [...allOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>Nenhum pedido registrado</p><small>Registre o primeiro pedido na seção Pedidos</small></div></td></tr>`;
      return;
    }

    tbody.innerHTML = recent.map(o => {
      const code = escHtml(o.code || ('#NTE-' + String(o.id).slice(-4).toUpperCase()));
      const thumb = getOrderThumbnail(o);
      const thumbHtml = thumb
        ? `<img src="${escHtml(thumb)}" alt="" style="width:36px; height:36px; border-radius:6px; object-fit:cover; border:1px solid rgba(201,168,76,0.3); background:#111; cursor:pointer;" onclick="window.open('${escHtml(thumb)}', '_blank')" onerror="this.onerror=null; this.src='../assets/images/logo.png'; this.style.opacity='0.4';" />`
        : `<div style="width:36px; height:36px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:center; color:var(--text-muted);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
      return `
        <tr>
          <td><span class="badge badge-gold" style="font-family:monospace; font-size:11px; font-weight:700;">${code}</span></td>
          <td>${thumbHtml}</td>
          <td style="color:var(--text-primary); font-weight:500;">${escHtml(o.client || '—')}</td>
          <td>${escHtml(o.productName || '—')}</td>
          <td style="color:var(--gold); font-weight:600;">${escHtml(o.value || '—')}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${fmt.date(o.createdAt)}</td>
        </tr>
      `;
    }).join('');
  }

  // ══════════════════════════════════════════
  //  FINANCEIRO PANEL
  // ══════════════════════════════════════════

  async function loadFinanceiro() {
    const now = new Date();
    const confirmed = allOrders.filter(o => o.status === 'confirmado' || o.status === 'enviado' || o.status === 'entregue');

    // This month revenue
    const mesRevenue = confirmed.filter(o => {
      const d = new Date(o.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((sum, o) => sum + fmt.parsePrice(o.value), 0);

    setText('fin-mes', fmt.currency(mesRevenue));
    setText('fin-confirmados', confirmed.length);

    // Top product
    const productCounts = {};
    allOrders.forEach(o => {
      if (o.productName) productCounts[o.productName] = (productCounts[o.productName] || 0) + 1;
    });
    const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0];
    setText('fin-top', topProduct ? topProduct[0] : '—');

    // Chart
    await drawRevenueChart('fin-chart');

    // Status breakdown
    const statusBreak = document.getElementById('status-breakdown');
    const statuses = ['novo', 'confirmado', 'enviado', 'entregue', 'cancelado'];
    statusBreak.innerHTML = statuses.map(s => {
      const count = allOrders.filter(o => o.status === s).length;
      const pct = allOrders.length > 0 ? Math.round((count / allOrders.length) * 100) : 0;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            ${statusBadge(s)}
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <div style="flex:1; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:var(--gold); transition:width 0.5s ease;"></div>
            </div>
            <span style="font-size:12px; color:var(--text-secondary); min-width:30px; text-align:right;">${count}</span>
          </div>
        </div>
      `;
    }).join('');

    // Brand breakdown
    const brandBreak = document.getElementById('brand-breakdown');
    const brandCounts = {};
    allOrders.forEach(o => {
      if (o.productBrand) brandCounts[o.productBrand] = (brandCounts[o.productBrand] || 0) + 1;
    });
    const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCount = sorted[0]?.[1] || 1;
    brandBreak.innerHTML = sorted.length > 0
      ? sorted.map(([brand, count]) => `
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:var(--gold); min-width:120px;">${escHtml(brand)}</span>
            <div style="flex:1; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
              <div style="height:100%; width:${Math.round((count / maxCount) * 100)}%; background:linear-gradient(90deg, var(--gold-dark), var(--gold)); transition:width 0.5s ease;"></div>
            </div>
            <span style="font-size:12px; color:var(--text-secondary);">${count}</span>
          </div>
        `).join('')
      : '<div class="empty-state" style="padding:20px;"><small>Nenhum pedido ainda</small></div>';
  }

  // ── Revenue Chart ──
  let revenueChartInstance = null;
  let finChartInstance = null;
  let chartJsLoaded = false;
  let chartJsLoading = null;

  async function loadChartJs() {
    if (chartJsLoaded) return true;
    if (chartJsLoading) return chartJsLoading;

    chartJsLoading = (async () => {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Falha ao carregar Chart.js'));
          document.head.appendChild(script);
        });
        chartJsLoaded = true;
        return true;
      } catch (error) {
        console.warn('Chart.js não pôde ser carregado:', error);
        chartJsLoaded = false;
        return false;
      } finally {
        chartJsLoading = null;
      }
    })();

    return chartJsLoading;
  }

  async function drawRevenueChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Lazy-load Chart.js
    const loaded = await loadChartJs();
    if (!loaded) return;

    // Build last 6 months
    const months = [];
    const revenues = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));
      const revenue = allOrders
        .filter(o => {
          const od = new Date(o.createdAt);
          return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear() && o.status !== 'cancelado';
        })
        .reduce((sum, o) => sum + fmt.parsePrice(o.value), 0);
      revenues.push(revenue);
    }

    // Destroy existing
    if (canvasId === 'revenue-chart' && revenueChartInstance) { revenueChartInstance.destroy(); }
    if (canvasId === 'fin-chart' && finChartInstance) { finChartInstance.destroy(); }

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Receita (R$)',
          data: revenues,
          borderColor: '#c9a84c',
          backgroundColor: 'rgba(201, 168, 76, 0.08)',
          pointBackgroundColor: '#c9a84c',
          pointBorderColor: '#080808',
          pointBorderWidth: 2,
          pointRadius: 5,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#141414',
            borderColor: 'rgba(201,168,76,0.3)',
            borderWidth: 1,
            titleColor: '#c9a84c',
            bodyColor: '#8a8784',
            callbacks: {
              label: ctx => `R$ ${ctx.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(201,168,76,0.05)', borderColor: 'rgba(201,168,76,0.1)' },
            ticks: { color: '#4a4846', font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(201,168,76,0.05)', borderColor: 'rgba(201,168,76,0.1)' },
            ticks: {
              color: '#4a4846',
              font: { size: 11 },
              callback: v => 'R$ ' + v.toLocaleString('pt-BR'),
            },
            beginAtZero: true,
          },
        },
      },
    });

    if (canvasId === 'revenue-chart') revenueChartInstance = chart;
    if (canvasId === 'fin-chart') finChartInstance = chart;
  }

  // ══════════════════════════════════════════
  //  PRODUCTS TABLE
  // ══════════════════════════════════════════

  window.filterProducts = function () {
    const search = (document.getElementById('product-search')?.value || '').toLowerCase();
    const brand = document.getElementById('product-filter-brand')?.value || '';
    const cat = document.getElementById('product-filter-cat')?.value || '';
    const status = document.getElementById('product-filter-status')?.value || '';

    const filtered = allProducts.filter(p => {
      const matchSearch = !search || [p.name, p.brand, p.desc].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(search);
      const matchBrand = !brand || p.brand === brand;
      const matchCat = !cat || productCategory(p) === cat;
      const matchStatus = !status
        || (status === 'active' && p.active !== false)
        || (status === 'inactive' && p.active === false)
        || (status === 'featured' && (p.featured || p.destaque));
      return matchSearch && matchBrand && matchCat && matchStatus;
    });

    setText('products-result-count', `${filtered.length} ${filtered.length === 1 ? 'resultado' : 'resultados'}`);
    const clearButton = document.getElementById('product-clear-filters');
    if (clearButton) clearButton.hidden = !(search || brand || cat || status);

    // Reset to first page when filters change
    productCurrentPage = 1;
    renderProductsTableData(filtered);
    updatePaginationControls(filtered.length);
  };

  window.clearProductFilters = function () {
    ['product-search', 'product-filter-brand', 'product-filter-cat', 'product-filter-status'].forEach(id => {
      const field = document.getElementById(id);
      if (field) field.value = '';
    });
    filterProducts();
  };

  function renderProductsTable() {
    // Populate brand filter
    const brandFilter = document.getElementById('product-filter-brand');
    if (brandFilter) {
      const brands = [...new Set(allProducts.map(p => p.brand))].sort();
      brandFilter.innerHTML = `<option value="">Todas as marcas</option>` + brands.map(b => `<option value="${escHtml(b)}">${escHtml(b)}</option>`).join('');
    }
    setText('products-summary-total', allProducts.length);
    setText('products-summary-active', allProducts.filter(p => p.active !== false).length);
    setText('products-summary-featured', allProducts.filter(p => p.featured || p.destaque).length);
    setText('products-summary-inactive', allProducts.filter(p => p.active === false).length);
    filterProducts();
  }

  async function syncProducts(showLoaderFlag = false, options = {}) {
    if (showLoaderFlag) scheduleLoader();
    try {
      // `force` desliga o cache: um produto salvo (ou alterado em outro
      // dispositivo) precisa aparecer na tabela, não o que está em memória.
      allProducts = options.force
        ? await window.ntDB?.products.reload() || []
        : await window.ntDB?.products.getAll() || [];
      renderProductsTable();
      setText('kpi-products', allProducts.filter(p => p.active !== false).length);
    } finally {
      if (showLoaderFlag) cancelLoader();
    }
  }

  async function refreshOrders() {
    try {
      allOrders = await window.ntDB?.orders.getAll() || [];
    } catch (error) {
      console.warn('Não foi possível carregar os pedidos:', error);
      showToast('!', 'Falha ao carregar pedidos', error.message);
      return;
    }
    renderOrdersTable();
    loadOverview();
  }

  function renderProductsTableData(products) {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;

    if (products.length === 0) {
      const hasFilters = ['product-search', 'product-filter-brand', 'product-filter-cat', 'product-filter-status'].some(id => document.getElementById(id)?.value);
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/></svg><p>${hasFilters ? 'Nenhum produto corresponde aos filtros' : 'Seu catálogo está vazio'}</p><small>${hasFilters ? 'Ajuste ou limpe os filtros para ver outros itens.' : 'Crie o primeiro produto para publicá-lo na loja.'}</small>${hasFilters ? '<button class="btn btn-secondary btn-sm empty-state__action" onclick="clearProductFilters()">Limpar filtros</button>' : '<button class="btn btn-primary btn-sm empty-state__action" onclick="openProductModal()">Criar produto</button>'}</div></td></tr>`;
      updatePaginationControls(0);
      return;
    }

    // Pagination
    const start = (productCurrentPage - 1) * productPageSize;
    const end = start + productPageSize;
    const pageProducts = products.slice(start, end);

    tbody.innerHTML = pageProducts.map(p => `
      <tr data-id="${p.id}">
        <td>
          <img class="product-thumb" src="${escHtml(p.image || 'data:image/svg+xml,<svg/>')}" alt="${escHtml(p.name)}"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'44\\' height=\\'56\\'/%3E'" />
        </td>
        <td>
          <div class="table-brand">${escHtml(p.brand || '—')}</div>
          <div class="table-name">${escHtml(p.name || '—')}</div>
        </td>
        <td>
          <span style="color:var(--text-primary); font-weight:600;">${escHtml(p.price || '—')}</span>
          ${p.oldPrice ? `<br><span style="font-size:11px; color:var(--text-muted); text-decoration:line-through;">${escHtml(p.oldPrice)}</span>` : ''}
        </td>
        <td>${escHtml(categoryLabel(productCategory(p)))}</td>
        <td>
          ${p.featured ? '<span class="badge badge-gold" title="Mais Vendidos">🏆 Mais</span> ' : ''}
          ${p.destaque ? '<span class="badge badge-gold" title="Destaque">✨ Dest.</span>' : ''}
          ${!p.featured && !p.destaque ? '<span style="color:var(--text-muted);font-size:11px;">—</span>' : ''}
        </td>
        <td>
          ${p.active !== false
            ? '<span class="badge badge-success">Ativo</span>'
            : '<span class="badge badge-muted">Inativo</span>'}
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm btn-icon-only" type="button" onclick="editProduct(this.dataset.productId)" data-product-id="${escHtml(p.id)}" title="Editar" aria-label="Editar ${escHtml(p.name || 'produto')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-danger btn-sm btn-icon-only" type="button" onclick="deleteProduct(this.dataset.productId)" data-product-id="${escHtml(p.id)}" title="Excluir definitivamente" aria-label="Excluir ${escHtml(p.name || 'produto')} definitivamente">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    updatePaginationControls(products.length);
  }

  function updatePaginationControls(totalItems) {
    const totalPages = Math.ceil(totalItems / productPageSize) || 1;
    const prevBtn = document.getElementById('pagination-prev');
    const nextBtn = document.getElementById('pagination-next');
    const info = document.getElementById('pagination-info');

    if (prevBtn) prevBtn.disabled = productCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = productCurrentPage >= totalPages;
    if (info) info.textContent = `Página ${productCurrentPage} de ${totalPages} (${totalItems} itens)`;
  }

  window.changeProductPage = function (delta) {
    const totalItems = parseInt(document.getElementById('pagination-info')?.textContent?.match(/\((\d+) itens\)/)||[0,0])[1] || 0;
    const totalPages = Math.ceil(totalItems / productPageSize) || 1;
    const newPage = productCurrentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
      productCurrentPage = newPage;
      filterProducts(); // Re-render with new page
    }
  };

  window.changeProductPageSize = function (size) {
    productPageSize = parseInt(size, 10);
    productCurrentPage = 1;
    filterProducts();
  };

  // ── Product Modal ──
  window.openProductModal = function (productId = null) {
    editingSizes = [];
    editingColors = [];
    pendingImages = [];

    document.getElementById('product-edit-id').value = productId || '';
    document.getElementById('product-modal-title').textContent = productId ? 'Editar Produto' : 'Novo Produto';

    // Clear form
    ['p-brand', 'p-name', 'p-price', 'p-old-price', 'p-badge', 'p-desc', 'p-image-url'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('p-category').value = 'camisetas';
    document.getElementById('p-stock').value = '';
    document.getElementById('p-active').value = 'true';
    renderImagePreviews();
    updateSizeSuggestions();
    const pFeat = document.getElementById('p-featured');
    const pDest = document.getElementById('p-destaque');
    if (pFeat) pFeat.checked = false;
    if (pDest) pDest.checked = false;

    clearTagsInput('sizes');
    clearTagsInput('colors');

    setupPriceInput('p-price');
    setupPriceInput('p-old-price');

    if (productId) {
      const p = allProducts.find(p => p.id === productId);
      if (p) fillProductForm(p);
    }

    // Apply modern minimalist styles (matching order modals)
    const modal = document.getElementById('product-modal');
    if (modal) {
      modal.classList.add('open');
      modal.style.cssText = `
        position: fixed !important;
        inset: 0 !important;
        z-index: 9999 !important;
        background: rgba(0, 0, 0, 0.55) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: clamp(16px, 4vw, 24px) !important;
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif) !important;
        animation: fadeIn 0.2s ease-out !important;
      `;
      
      const modalChild = modal.querySelector('.modal');
      if (modalChild) {
        modalChild.style.cssText = `
          background: var(--bg-surface, #0f0f0f) !important;
          border: 1px solid var(--border, rgba(201, 168, 76, 0.3)) !important;
          border-radius: 16px !important;
          max-width: min(900px, 95vw) !important;
          width: 100% !important;
          max-height: min(90vh, 820px) !important;
          overflow: hidden !important;
          box-shadow: 
            0 4px 24px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(201, 168, 76, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
          color: var(--text-primary, #f2efe9) !important;
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
          display: flex !important;
          flex-direction: column !important;
        `;
        
        // Style header
        const header = modalChild.querySelector('.modal-header');
        if (header) {
          header.style.cssText = `
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 18px 24px !important;
            border-bottom: 1px solid var(--border, rgba(201, 168, 76, 0.2)) !important;
            background: rgba(201, 168, 76, 0.03) !important;
            flex-shrink: 0 !important;
          `;
          const title = header.querySelector('.modal-title');
          if (title) {
            title.style.cssText = `
              margin: 0 !important;
              font-size: 1.05rem !important;
              font-weight: 600 !important;
              color: var(--text-primary, #f2efe9) !important;
              letter-spacing: 0.01em !important;
            `;
          }
          const closeBtn = header.querySelector('.modal-close');
          if (closeBtn) {
            closeBtn.style.cssText = `
              width: 36px !important;
              height: 36px !important;
              border: none !important;
              border-radius: 10px !important;
              background: var(--bg-hover, rgba(255,255,255,0.04)) !important;
              color: var(--text-muted, #888) !important;
              font-size: 1.35rem !important;
              cursor: pointer !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              transition: all 0.15s ease !important;
            `;
            closeBtn.setAttribute('onmouseover', "this.style.background='var(--bg-hover,rgba(255,255,255,0.08))'");
            closeBtn.setAttribute('onmouseout', "this.style.background='var(--bg-hover,rgba(255,255,255,0.04))'");
          }
        }
        
        // Style body (make scrollable)
        const body = modalChild.querySelector('.modal-body');
        if (body) {
          body.style.cssText = `
            flex: 1 !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            padding: 24px !important;
            min-height: 0 !important;
          `;
        }
        
        // Style footer
        const footer = modalChild.querySelector('.modal-footer');
        if (footer) {
          footer.style.cssText = `
            display: flex !important;
            justify-content: flex-end !important;
            gap: 12px !important;
            padding: 18px 24px !important;
            border-top: 1px solid var(--border, rgba(201, 168, 76, 0.2)) !important;
            background: rgba(201, 168, 76, 0.03) !important;
            flex-shrink: 0 !important;
          `;
          const cancelBtn = footer.querySelector('.btn-secondary');
          if (cancelBtn) {
            cancelBtn.style.cssText = `
              padding: 12px 24px !important;
              border: 1px solid rgba(201, 168, 76, 0.2) !important;
              border-radius: 10px !important;
              background: transparent !important;
              color: #bbb !important;
              cursor: pointer !important;
              font-size: .9rem !important;
              font-weight: 500 !important;
              transition: all 0.15s ease !important;
            `;
            cancelBtn.setAttribute('onmouseover', "this.style.borderColor='#c9a84c'; this.style.color='#c9a84c'");
            cancelBtn.setAttribute('onmouseout', "this.style.borderColor='rgba(201, 168, 76, 0.2)'; this.style.color='#bbb'");
          }
          const saveBtn = footer.querySelector('#product-save-button, .btn-primary');
          if (saveBtn) {
            saveBtn.style.cssText = `
              padding: 12px 24px !important;
              border: none !important;
              border-radius: 10px !important;
              background: #c9a84c !important;
              color: #0f0f0f !important;
              font-weight: 600 !important;
              cursor: pointer !important;
              font-size: .9rem !important;
              box-shadow: 0 2px 8px rgba(201, 168, 76, 0.3) !important;
              transition: background-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease !important;
            `;
            saveBtn.setAttribute('onmouseover', "this.style.backgroundColor='#b8963e'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 16px rgba(201,168,76,0.4)'");
            saveBtn.setAttribute('onmouseout', "this.style.backgroundColor='#c9a84c'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(201,168,76,0.3)'");
          }
        }
      }
    }
  };

  function fillProductForm(p) {
    setValue('p-brand', p.brand);
    setValue('p-name', p.name);
    setValue('p-price', p.price && !String(p.price).startsWith('R$') ? 'R$ ' + String(p.price).replace(/^R\$\s*/, '') : p.price);
    setValue('p-old-price', p.oldPrice && !String(p.oldPrice).startsWith('R$') ? 'R$ ' + String(p.oldPrice).replace(/^R\$\s*/, '') : p.oldPrice || '');
    setValue('p-badge', p.badge || '');
    setValue('p-desc', p.desc || '');
    setValue('p-category', productCategory(p));
    setValue('p-stock', Number.isFinite(Number(p.stock)) ? p.stock : '');
    setValue('p-active', String(p.active !== false));

    // Images
    pendingImages = [...new Set((Array.isArray(p.images) && p.images.length ? p.images : [p.image]).filter(Boolean))];
    setValue('p-image-url', pendingImages.filter(image => !image.startsWith('data:image/')).join('\n'));
    renderImagePreviews();

    // Sizes
    editingSizes = Array.isArray(p.sizes) ? [...p.sizes] : [];
    renderTags('sizes', editingSizes);
    updateSizeSuggestions();

    // Colors
    editingColors = Array.isArray(p.colors) ? [...p.colors] : [];
    renderTags('colors', editingColors);

    // Sections
    const pFeat = document.getElementById('p-featured');
    const pDest = document.getElementById('p-destaque');
    if (pFeat) pFeat.checked = !!p.featured;
    if (pDest) pDest.checked = !!p.destaque;
  }

  window.closeProductModal = function () {
    const modal = document.getElementById('product-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.cssText = '';
      const modalChild = modal.querySelector('.modal');
      if (modalChild) modalChild.style.cssText = '';
    }
  };

  window.saveProduct = async function () {
    const id = document.getElementById('product-edit-id').value;
    syncImageUrls();

    const productId = id || (Date.now().toString(36) + Math.random().toString(36).slice(2));
    const storedImages = [];
    const uploadWarnings = [];
    for (let i = 0; i < pendingImages.length; i++) {
      const image = pendingImages[i];
      if (image.startsWith('data:image/')) {
        try {
          storedImages.push(await uploadProductImage(image, productId, i));
        } catch (error) {
          storedImages.push(image);
          uploadWarnings.push(`Foto ${i + 1}: ${error.message}`);
        }
      } else {
        storedImages.push(image);
      }
    }
    if (uploadWarnings.length) {
      console.warn('Algumas fotos ficaram em base64:', uploadWarnings);
      alert('Algumas fotos não puderam ser enviadas e foram mantidas em base64.\n• ' + uploadWarnings.join('\n• '));
    }

    const productData = {
      id: productId,
      brand: getVal('p-brand'),
      name: getVal('p-name'),
      price: getVal('p-price'),
      oldPrice: getVal('p-old-price') || null,
      badge: getVal('p-badge') || null,
      desc: getVal('p-desc'),
      category: getVal('p-category'),
      stock: Number(getVal('p-stock')),
      inStock: Number(getVal('p-stock')) > 0,
      available: getVal('p-active') === 'true' && Number(getVal('p-stock')) > 0,
      priceNum: fmt.parsePrice(getVal('p-price')),
      active: getVal('p-active') === 'true',
      sizes: [...editingSizes],
      colors: [...editingColors],
      image: storedImages[0] || '',
      images: [...storedImages],
      slug: (getVal('p-name') || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      featured: document.getElementById('p-featured')?.checked || false,
      destaque: document.getElementById('p-destaque')?.checked || false,
    };

    if (!productData.brand || !productData.name || !productData.price || getVal('p-stock') === '' || !Number.isInteger(productData.stock) || productData.stock < 0) {
      alert('Preencha Marca, Nome, Preço e um estoque válido (zero ou maior).');
      return;
    }

    try {
      const saveButton = document.getElementById('product-save-button');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Salvando…'; }
      let savedProduct;
      if (id) {
        savedProduct = await window.ntDB.products.update(id, productData);
      } else {
        savedProduct = await window.ntDB.products.add(productData);
      }

      closeProductModal();
      // Aplica na hora o registro devolvido pela API, inclusive no update: sem
      // isso a linha antiga continuava na tela até o próximo sync.
      if (savedProduct) {
        if (id) {
          allProducts = allProducts.map(p => (p.id === id ? savedProduct : p));
        } else {
          allProducts = [savedProduct, ...allProducts.filter(p => p.id !== savedProduct.id)];
        }
      }
      if (!id) clearProductFilters();
      try {
        await syncProducts(true, { force: true });
      } catch (syncError) {
        renderProductsTable();
        console.warn('Produto salvo, mas a lista não pôde ser sincronizada:', syncError);
      }
      showToast('✦', id ? 'Produto atualizado!' : 'Produto adicionado!', productData.name);
    } catch (e) {
      alert('Erro ao salvar produto: ' + e.message);
    } finally {
      const saveButton = document.getElementById('product-save-button');
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Salvar Produto'; }
    }
  };

  window.editProduct = function (id) {
    openProductModal(id);
  };

  window.deleteProduct = async function (id) {
    const p = allProducts.find(product => product.id === id);
    if (!p) { alert('Produto não encontrado.'); return; }
    try {
      await window.ntDB.products.delete(id);
      allProducts = allProducts.filter(product => product.id !== id);
      renderProductsTable();
      setText('kpi-products', allProducts.filter(product => product.active !== false).length);
      showToast('✓', 'Produto excluído', p.name || '');
    } catch (e) {
      console.error('Falha ao excluir produto:', e);
      alert('Não foi possível excluir: ' + e.message);
    }
  };

  // ── Tags Input ──
  window.addTag = function (e, type) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const input = document.getElementById(type + '-input');
    const val = input.value.trim();
    if (!val) return;

    if (type === 'sizes') {
      editingSizes.push(val);
      renderTags('sizes', editingSizes);
      renderStockBySize();
    } else if (type === 'colors') {
      editingColors.push(val);
      renderTags('colors', editingColors);
    }
    input.value = '';
  };

  function renderTags(type, tags) {
    const container = document.getElementById(type + '-tags');
    const input = document.getElementById(type + '-input');
    const tagEls = container.querySelectorAll('.tag');
    tagEls.forEach(t => t.remove());

    tags.forEach((tag, i) => {
      const el = document.createElement('div');
      el.className = 'tag';
      el.innerHTML = `${escHtml(tag)}<span class="tag-remove" onclick="removeTag('${type}', ${i})">×</span>`;
      container.insertBefore(el, input);
    });

    // Update color preview
    if (type === 'colors') {
      const preview = document.getElementById('color-chips-preview');
      if (preview) {
        preview.innerHTML = tags.map((c, i) => `
          <div class="color-chip" style="background:${escHtml(c)}; border-color:${escHtml(c)};" title="${escHtml(c)}">
            <span class="remove-chip" onclick="removeTag('colors', ${i})">×</span>
          </div>
        `).join('');
      }
    }
  }

  window.removeTag = function (type, idx) {
    if (type === 'sizes') {
      editingSizes.splice(idx, 1);
      renderTags('sizes', editingSizes);
    } else {
      editingColors.splice(idx, 1);
      renderTags('colors', editingColors);
    }
  };

  const SIZE_PRESETS = {
    camisetas: { label: 'Tamanhos',  options: ['PP', 'P', 'M', 'G', 'GG', 'XG'] },
    shorts: { label: 'Tamanhos', options: ['PP', 'P', 'M', 'G', 'GG', 'XG'] },
    hoodies: { label: 'Tamanhos', options: ['PP', 'P', 'M', 'G', 'GG', 'XG'] },
    calcados: { label: 'Numeração', options: ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] },
  };

  function updateSizeSuggestions() {
    const container = document.getElementById('size-suggestions');
    if (!container) return;
    const category = document.getElementById('p-category')?.value || 'camisetas';
    const preset = SIZE_PRESETS[category] || SIZE_PRESETS.camisetas;
    const label = document.getElementById('sizes-label');
    if (label) label.textContent = `${preset.label} Disponíveis`;
    container.setAttribute('aria-label', `Sugestões de ${preset.label.toLowerCase()}`);
    container.innerHTML = preset.options.map(size => `<button type="button" class="size-suggestion" onclick="addSuggestedSize('${size}')">${size}</button>`).join('');
  }

  window.addSuggestedSize = function (size) {
    if (!editingSizes.includes(size)) editingSizes.push(size);
    renderTags('sizes', editingSizes);
  };

  function clearTagsInput(type) {
    const container = document.getElementById(type + '-tags');
    if (!container) return;
    container.querySelectorAll('.tag').forEach(t => t.remove());
    const input = document.getElementById(type + '-input');
    if (input) input.value = '';
    if (type === 'colors') {
      const prev = document.getElementById('color-chips-preview');
      if (prev) prev.innerHTML = '';
    }
  }

  // ── Image Upload ──
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target.result);
      reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function resizeImageToWebP(dataUrl, maxSide = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          if (dataUrl.startsWith('data:image/webp') && img.naturalWidth <= maxSide && img.naturalHeight <= maxSide) {
            return resolve(dataUrl);
          }
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          const width = Math.max(1, Math.round(img.naturalWidth * scale));
          const height = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/webp', quality));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Não foi possível decodificar a imagem para redimensionamento.'));
      img.src = dataUrl;
    });
  }

  async function getUploadAuthHeader() {
    try {
      const client = window.ntAuth?.getClient && await window.ntAuth.getClient();
      const session = client?.auth?.getSession && await client.auth.getSession();
      const token = session?.data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : null;
    } catch (error) {
      console.warn('Sem sessão para autenticar o upload:', error);
      return null;
    }
  }

  async function uploadProductImage(dataUrl, productId, index) {
    const baseUrl = window.location.origin;
    const uploadEndpoint = `${baseUrl}/upload.php`;
    const authHeader = await getUploadAuthHeader();
    
    const response = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
      body: JSON.stringify({ image: dataUrl, productId, index })
    });
    
    const result = await response.json();
    
    if (!response.ok || result.error) {
      throw new Error(result.error || `Erro no upload (HTTP ${response.status})`);
    }
    
    return result.url;
  }

  function imageUrlsFromField() {
    return (document.getElementById('p-image-url')?.value || '')
      .split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  }

  function syncImageUrls() {
    const uploaded = pendingImages.filter(image => image.startsWith('data:image/'));
    pendingImages = [...new Set([...uploaded, ...imageUrlsFromField()])].slice(0, 8);
    renderImagePreviews();
  }

  function renderImagePreviews() {
    const grid = document.getElementById('img-preview-grid');
    if (!grid) return;
    grid.innerHTML = pendingImages.map((image, index) => `
      <div class="img-preview-item">
        <img src="${escHtml(image)}" alt="Foto ${index + 1} do produto" />
        ${index === 0 ? '<span class="img-preview-primary">Principal</span>' : ''}
        <button type="button" class="img-preview-remove" onclick="removeProductImage(${index})" aria-label="Remover foto ${index + 1}">×</button>
      </div>
    `).join('');
  }

  window.handleImageUpload = async function (e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    if (pendingImages.length + files.length > 8) {
      alert('Você pode cadastrar até 8 imagens por produto.');
      e.target.value = '';
      return;
    }
    const oversized = files.find(file => file.size > 20 * 1024 * 1024);
    if (oversized) {
      alert(`A imagem ${oversized.name} ultrapassa o limite de 20MB.`);
      e.target.value = '';
      return;
    }
    try {
      const processedImages = [];
      for (const file of files) {
        const dataUrl = await readImage(file);
        processedImages.push(await resizeImageToWebP(dataUrl));
      }
      pendingImages.push(...processedImages);
      pendingImages = [...new Set(pendingImages)].slice(0, 8);
      renderImagePreviews();
    } catch (error) { alert(error.message); }
    e.target.value = '';
  };

  window.previewImageUrl = function () { syncImageUrls(); };

  window.removeProductImage = function (index) {
    pendingImages.splice(index, 1);
    setValue('p-image-url', pendingImages.filter(image => !image.startsWith('data:image/')).join('\n'));
    renderImagePreviews();
  };

  // ══════════════════════════════════════════
  //  ORDERS TABLE
  // ══════════════════════════════════════════

  window.filterOrders = function () {
    const status = document.getElementById('order-filter-status')?.value || '';
    const filtered = allOrders.filter(o => !status || o.status === status);
    renderOrdersTableData(filtered);
  };

  function renderOrdersTable() {
    renderOrdersTableData([...allOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }

  function renderOrdersTableData(orders) {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16"/></svg><p>Nenhum pedido encontrado</p><small>Registre pedidos recebidos pelo WhatsApp</small></div></td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map((o) => {
      const code = escHtml(o.code || ('#NTE-' + String(o.id).slice(-4).toUpperCase()));
      const thumb = getOrderThumbnail(o);
      const hasMultiple = Array.isArray(o.items) && o.items.length > 1;
      const thumbHtml = thumb 
        ? `<div style="position:relative; width:44px; height:44px; flex-shrink:0;">
             <img src="${escHtml(thumb)}" alt="" style="width:44px; height:44px; border-radius:8px; object-fit:cover; border:1px solid rgba(201,168,76,0.3); background:#111; cursor:pointer;" onclick="window.open('${escHtml(thumb)}', '_blank')" onerror="this.onerror=null; this.src='../assets/images/logo.png'; this.style.opacity='0.4';" />
             ${hasMultiple ? `<span style="position:absolute; bottom:-3px; right:-3px; background:var(--gold,#c9a84c); color:#000; font-size:9px; font-weight:800; border-radius:10px; padding:1px 5px; line-height:1.2;">+${o.items.length}</span>` : ''}
           </div>`
        : `<div style="width:44px; height:44px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:center; color:var(--text-muted);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;

      let productDetails = '';
      if (hasMultiple) {
        productDetails = `<span style="color:var(--gold); font-size:11px; text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">${o.items.length} itens no pedido</span><br>`;
        productDetails += `<span style="font-size:12px; color:var(--text-secondary);">${escHtml(o.items.map(it => `${it.qty || 1}x ${it.name}`).join(', '))}</span>`;
      } else {
        if (o.productBrand) {
          productDetails += `<span style="color:var(--gold); font-size:11px; text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">${escHtml(o.productBrand)}</span><br>`;
        }
        productDetails += `<span style="color:var(--text-primary); font-weight:500;">${escHtml(o.productName || '—')}</span>`;
      }

      return `
      <tr>
        <td>
          <span class="badge badge-gold" style="font-family:monospace; font-size:11px; font-weight:700; letter-spacing:0.05em;">${code}</span>
        </td>
        <td>${thumbHtml}</td>
        <td>
          ${o.source === 'site' ? '<span class="badge badge-gold" title="Pedido feito pelo site" style="margin-right:6px;">🌐 Site</span>' : ''}
          <span style="color:var(--text-primary); font-weight:500;">${escHtml(o.client || '—')}</span>
          ${o.phone ? `<br><a href="https://wa.me/${o.phone.replace(/\\D/g, '')}" target="_blank" style="font-size:11px; color:var(--text-muted); text-decoration:none; display:inline-flex; align-items:center; gap:3px;">💬 ${escHtml(o.phone)}</a>` : ''}
        </td>
        <td>${productDetails}</td>
        <td>${escHtml([o.size, o.color].filter(Boolean).join(' / ') || '—')}</td>
        <td style="color:var(--gold, #c9a84c); font-weight:600;">${escHtml(o.value || '—')}</td>
        <td>
          <select class="admin-select" style="font-size:11px; padding:4px 24px 4px 6px;" onchange="updateOrderStatus('${o.id}', this.value)">
            ${['novo','confirmado','enviado','entregue','cancelado'].map(s =>
              `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
            ).join('')}
          </select>
        </td>
        <td style="font-size:11px;">${fmt.date(o.createdAt)}</td>
        <td>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); editOrder('${o.id}')" title="Ver / Editar" style="padding:6px 10px; font-size:12px; white-space:nowrap;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:middle;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Ver</span>
            </button>
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); confirmDeleteOrder('${o.id}')" title="Excluir" style="padding:6px 10px; font-size:12px; white-space:nowrap;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:middle;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              <span>Excluir</span>
            </button>
          </div>
        </td>
      </tr>
    `}).join('');
  }

  window.updateOrderStatus = async function (id, status) {
    await window.ntDB.orders.update(id, { status });
    const o = allOrders.find(o => o.id === id);
    if (o) o.status = status;
    showToast('✓', 'Status atualizado', status);
  };

  // ── Order Modal (Dynamic - bypasses all CSS conflicts) ──
window.openOrderModal = function (orderId = null) {
    // Remove any existing dynamic modal
    const existing = document.getElementById('dynamic-order-modal');
    if (existing) existing.remove();
    
    document.getElementById('order-edit-id').value = orderId || '';
    
    // Build modal dynamically (bypass all CSS)
    const overlay = document.createElement('div');
    overlay.id = 'dynamic-order-modal';
    overlay.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      z-index: 99999 !important;
      background: rgba(0, 0, 0, 0.55) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: clamp(16px, 4vw, 24px) !important;
      font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif) !important;
      animation: fadeIn 0.2s ease-out !important;
    `;
    overlay.onclick = (e) => { if (e.target === overlay) closeDynamicOrderModal(); };
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--bg-surface, #0f0f0f) !important;
      border: 1px solid var(--border, rgba(201, 168, 76, 0.3)) !important;
      border-radius: 16px !important;
      max-width: min(720px, 95vw) !important;
      width: 100% !important;
      max-height: min(90vh, 820px) !important;
      overflow: hidden !important;
      box-shadow: 
        0 4px 24px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(201, 168, 76, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
      color: var(--text-primary, #f2efe9) !important;
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 18px 24px !important;
      border-bottom: 1px solid var(--border, rgba(201, 168, 76, 0.2)) !important;
      background: rgba(201, 168, 76, 0.03) !important;
    `;
    header.innerHTML = `
      <h3 style="margin:0;font-size:1.05rem;font-weight:600;color:var(--text-primary, #f2efe9);letter-spacing:0.01em;">${orderId ? 'Editar Pedido' : 'Registrar Pedido'}</h3>
      <button onclick="closeDynamicOrderModal()" style="
        width: 36px !important;
        height: 36px !important;
        border: none !important;
        border-radius: 10px !important;
        background: var(--bg-hover, rgba(255,255,255,0.04)) !important;
        color: var(--text-muted, #888) !important;
        font-size: 1.35rem !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.15s ease !important;
      " onmouseover="this.style.background='var(--bg-hover,rgba(255,255,255,0.08))'" onmouseout="this.style.background='var(--bg-hover,rgba(255,255,255,0.04))'">×</button>
    `;
    
    // Body
    const body = document.createElement('div');
    body.style.cssText = `padding: 24px !important; max-height: 65vh !important; overflow-y: auto !important; background: var(--bg-surface, #0f0f0f) !important;`;
    
    // Build form
    let orderData = {};
    if (orderId) {
      const o = allOrders.find(o => o.id === orderId);
      if (o) orderData = o;
    }

    const productsHtml = allProducts.filter(p => p.active !== false).map(p =>
      `<option value="${p.id}" ${String(p.id) === String(orderData.productId) ? 'selected' : ''} data-brand="${escHtml(p.brand)}" data-name="${escHtml(p.name)}" data-price="${escHtml(p.price)}" data-image="${escHtml(p.image || (p.images && p.images[0]) || '')}">${escHtml(p.brand)} — ${escHtml(p.name)}</option>`
    ).join('');

    const orderThumb = getOrderThumbnail(orderData);
    const orderCodeBadge = orderData.code
      ? `<span class="badge badge-gold" style="font-family:monospace;font-size:13px;padding:4px 10px;font-weight:700;">${escHtml(orderData.code)}</span>`
      : (orderId ? `<span class="badge badge-gold" style="font-family:monospace;font-size:13px;padding:4px 10px;font-weight:700;">#NTE-${String(orderId).slice(-4).toUpperCase()}</span>` : '');

    const headerPreview = (orderCodeBadge || orderThumb) ? `
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:18px; padding:12px 14px; border-radius:10px; background:rgba(201,168,76,0.06); border:1px solid rgba(201,168,76,0.2);">
        ${orderThumb ? `<img src="${escHtml(orderThumb)}" alt="" style="width:48px; height:48px; border-radius:8px; object-fit:cover; border:1px solid rgba(201,168,76,0.3); background:#111; cursor:pointer;" onclick="window.open('${escHtml(orderThumb)}', '_blank')" title="Clique para ver imagem">` : ''}
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            ${orderCodeBadge}
            <span style="font-size:12px; color:var(--text-muted);">${orderData.createdAt ? fmt.date(orderData.createdAt) : ''}</span>
            ${orderData.source === 'site' ? '<span class="badge badge-gold" style="font-size:10px;">🌐 Site</span>' : ''}
            ${orderData.code ? `<a href="/order/${encodeURIComponent(orderData.code.replace('#',''))}" target="_blank" class="badge" style="background:rgba(255,255,255,0.08);color:var(--text-primary);text-decoration:none;font-size:11px;padding:3px 8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;display:inline-flex;align-items:center;gap:4px;" title="Abrir página detalhada do pedido">🔗 Ver no Site</a>` : ''}
          </div>
          <div style="font-size:13px; font-weight:600; color:var(--text-primary); margin-top:4px;">${escHtml(orderData.productName || 'Detalhes do Pedido')}</div>
        </div>
      </div>
    ` : '';

    const itemsPreview = (Array.isArray(orderData.items) && orderData.items.length > 0) ? `
      <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border,rgba(201,168,76,0.2));border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="font-size:.8rem;font-weight:600;color:var(--gold,#c9a84c);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Itens do Pedido (${orderData.items.length})</div>
        <div style="display:grid;gap:12px;">
          ${orderData.items.map((it, idx) => `
            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:${idx < orderData.items.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none'};">
              ${it.image ? `<img src="${escHtml(it.image)}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid rgba(201,168,76,0.3);background:#111;cursor:pointer;" onclick="window.open('${escHtml(it.image)}', '_blank')" title="Clique para abrir foto em alta resolução">` : `<div style="width:48px;height:48px;border-radius:8px;background:#222;display:flex;align-items:center;justify-content:center;color:#666;">🖼️</div>`}
              <div style="flex:1;">
                <div style="font-weight:600;font-size:.9rem;color:var(--text-primary);">${escHtml(it.brand ? `${it.brand} — ` : '')}${escHtml(it.name || 'Produto')}</div>
                <div style="font-size:.8rem;color:var(--text-muted);margin-top:2px;">
                  ${it.size ? `Tam: <strong>${escHtml(it.size)}</strong> ` : ''}
                  ${it.color ? `| Cor: <strong>${escHtml(it.color)}</strong> ` : ''}
                  | Qtd: <strong>${escHtml(String(it.qty || 1))}</strong>
                </div>
              </div>
              <div style="font-weight:700;color:var(--gold,#c9a84c);font-size:.95rem;">${escHtml(it.price || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';
    
    body.innerHTML = `
      <input type="hidden" id="order-edit-id" value="${orderId || ''}">
      <div style="display:grid;gap:16px;">
        ${headerPreview}
        ${itemsPreview}
        <div>
          <label style="display:block;margin-bottom:6px;font-size:.8rem;font-weight:500;color:var(--text-muted, #888);text-transform:uppercase;letter-spacing:0.05em;">Nome do Cliente *</label>
          <input type="text" id="o-client" value="${escHtml(orderData.client || '')}" placeholder="João Silva" style="width:100%;padding:12px 14px;border:1px solid var(--border, rgba(201,168,76,0.2));border-radius:10px;background:var(--bg-input, #0a0a0a);color:var(--text-primary, #f2efe9);font-size:.95rem;outline:none;transition:border-color 0.15s, box-shadow 0.15s;" onfocus="this.style.borderColor='var(--gold, #c9a84c)';this.style.boxShadow='0 0 0 3px rgba(201,168,76,0.15)'" onblur="this.style.borderColor='var(--border, rgba(201,168,76,0.2))';this.style.boxShadow='none'">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-size:.8rem;font-weight:500;color:var(--text-muted, #888);text-transform:uppercase;letter-spacing:0.05em;">WhatsApp do Cliente</label>
          <input type="text" id="o-phone" value="${escHtml(orderData.phone || '')}" placeholder="5511999999999" style="width:100%;padding:12px 14px;border:1px solid var(--border, rgba(201,168,76,0.2));border-radius:10px;background:var(--bg-input, #0a0a0a);color:var(--text-primary, #f2efe9);font-size:.95rem;outline:none;transition:border-color 0.15s, box-shadow 0.15s;" onfocus="this.style.borderColor='var(--gold, #c9a84c)';this.style.boxShadow='0 0 0 3px rgba(201,168,76,0.15)'" onblur="this.style.borderColor='var(--border, rgba(201,168,76,0.2))';this.style.boxShadow='none'">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-size:.8rem;font-weight:500;color:var(--text-muted, #888);text-transform:uppercase;letter-spacing:0.05em;">Produto *</label>
          <select id="o-product" style="width:100%;padding:12px 14px;border:1px solid var(--border, rgba(201,168,76,0.2));border-radius:10px;background:var(--bg-input, #0a0a0a);color:var(--text-primary, #f2efe9);font-size:.95rem;outline:none;cursor:pointer;transition:border-color 0.15s, box-shadow 0.15s;" onfocus="this.style.borderColor='var(--gold, #c9a84c)';this.style.boxShadow='0 0 0 3px rgba(201,168,76,0.15)'" onblur="this.style.borderColor='var(--border, rgba(201,168,76,0.2))';this.style.boxShadow='none'">${productsHtml}</select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label style="display:block;margin-bottom:6px;font-size:.8rem;font-weight:500;color:var(--text-muted, #888);text-transform:uppercase;letter-spacing:0.05em;">Tamanho</label>
            <input type="text" id="o-size" value="${escHtml(orderData.size || '')}" placeholder="M" style="width:100%;padding:12px 14px;border:1px solid var(--border, rgba(201,168,76,0.2));border-radius:10px;background:var(--bg-input, #0a0a0a);color:var(--text-primary, #f2efe9);font-size:.95rem;outline:none;transition:border-color 0.15s, box-shadow 0.15s;" onfocus="this.style.borderColor='var(--gold, #c9a84c)';this.style.boxShadow='0 0 0 3px rgba(201,168,76,0.15)'" onblur="this.style.borderColor='var(--border, rgba(201,168,76,0.2))';this.style.boxShadow='none'">
          </div>
          <div>
            <label style="display:block;margin-bottom:6px;font-size:.8rem;font-weight:500;color:var(--text-muted, #888);text-transform:uppercase;letter-spacing:0.05em;">Cor</label>
            <input type="text" id="o-color" value="${escHtml(orderData.color || '')}" placeholder="Preto" style="width:100%;padding:12px 14px;border:1px solid var(--border, rgba(201,168,76,0.2));border-radius:10px;background:var(--bg-input, #0a0a0a);color:var(--text-primary, #f2efe9);font-size:.95rem;outline:none;transition:border-color 0.15s, box-shadow 0.15s;" onfocus="this.style.borderColor='var(--gold, #c9a84c)';this.style.boxShadow='0 0 0 3px rgba(201,168,76,0.15)'" onblur="this.style.borderColor='var(--border, rgba(201,168,76,0.2))';this.style.boxShadow='none'">
          </div>
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-size:.8rem;font-weight:500;color:var(--text-muted, #888);text-transform:uppercase;letter-spacing:0.05em;">Valor (R$) *</label>
          <input type="text" id="o-value" value="${escHtml((orderData.value || '').replace('R$ ', ''))}" placeholder="649,00" style="width:100%;padding:12px 14px;border:1px solid var(--border, rgba(201,168,76,0.2));border-radius:10px;background:var(--bg-input, #0a0a0a);color:var(--text-primary, #f2efe9);font-size:.95rem;outline:none;transition:border-color 0.15s, box-shadow 0.15s;" onfocus="this.style.borderColor='var(--gold, #c9a84c)';this.style.boxShadow='0 0 0 3px rgba(201,168,76,0.15)'" onblur="this.style.borderColor='var(--border, rgba(201,168,76,0.2))';this.style.boxShadow='none'">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-size:.8rem;font-weight:500;color:var(--text-muted, #888);text-transform:uppercase;letter-spacing:0.05em;">Status</label>
          <select id="o-status" style="width:100%;padding:12px 14px;border:1px solid var(--border, rgba(201,168,76,0.2));border-radius:10px;background:var(--bg-input, #0a0a0a);color:var(--text-primary, #f2efe9);font-size:.95rem;outline:none;cursor:pointer;transition:border-color 0.15s, box-shadow 0.15s;" onfocus="this.style.borderColor='var(--gold, #c9a84c)';this.style.boxShadow='0 0 0 3px rgba(201,168,76,0.15)'" onblur="this.style.borderColor='var(--border, rgba(201,168,76,0.2))';this.style.boxShadow='none'">
            <option value="novo" ${orderData.status === 'novo' ? 'selected' : ''}>Novo</option>
            <option value="confirmado" ${orderData.status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
            <option value="enviado" ${orderData.status === 'enviado' ? 'selected' : ''}>Enviado</option>
            <option value="entregue" ${orderData.status === 'entregue' ? 'selected' : ''}>Entregue</option>
            <option value="cancelado" ${orderData.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-size:.8rem;font-weight:500;color:var(--text-muted, #888);text-transform:uppercase;letter-spacing:0.05em;">Observações</label>
          <textarea id="o-notes" placeholder="Notas sobre o pedido..." style="width:100%;min-height:100px;padding:12px 14px;border:1px solid var(--border, rgba(201,168,76,0.2));border-radius:10px;background:var(--bg-input, #0a0a0a);color:var(--text-primary, #f2efe9);font-size:.95rem;outline:none;resize:vertical;transition:border-color 0.15s, box-shadow 0.15s;line-height:1.5;font-family:inherit;" onfocus="this.style.borderColor='var(--gold, #c9a84c)';this.style.boxShadow='0 0 0 3px rgba(201,168,76,0.15)'" onblur="this.style.borderColor='var(--border, rgba(201,168,76,0.2))';this.style.boxShadow='none'">${escHtml(orderData.notes || '')}</textarea>
        </div>
      </div>
    `;
    
    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      display:flex !important; justify-content:flex-end !important; gap:12px !important;
      padding:18px 24px !important; border-top:1px solid var(--border, rgba(201,168,76,0.2)) !important;
      background: rgba(201, 168, 76, 0.03) !important;
    `;
    footer.innerHTML = `
      <button onclick="closeDynamicOrderModal()" style="
        padding:12px 24px !important;
        border:1px solid rgba(201,168,76,0.2) !important;
        border-radius:10px !important;
        background:transparent !important;
        color:#bbb !important;
        cursor:pointer !important;
        font-size:.9rem !important;
        font-weight:500 !important;
        transition:all 0.15s ease !important;
      " onmouseover="this.style.borderColor='#c9a84c';this.style.color='#c9a84c'" onmouseout="this.style.borderColor='rgba(201,168,76,0.2)';this.style.color='#bbb'">Cancelar</button>
      <button onclick="saveDynamicOrder()" style="
        padding:12px 24px !important;
        border:none !important;
        border-radius:10px !important;
        background:#c9a84c !important;
        color:#0f0f0f !important;
        font-weight:600 !important;
        cursor:pointer !important;
        font-size:.9rem !important;
        box-shadow:0 2px 8px rgba(201,168,76,0.3) !important;
        transition:background-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease !important;
      " onmouseover="this.style.backgroundColor='#b8963e';this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 16px rgba(201,168,76,0.4)'" onmouseout="this.style.backgroundColor='#c9a84c';this.style.transform='translateY(0)';this.style.boxShadow='0 2px 8px rgba(201,168,76,0.3)'">Salvar Pedido</button>
    `;
    
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Auto-fill value on product select
    setTimeout(() => {
      const sel = document.getElementById('o-product');
      if (sel) {
        sel.onchange = () => {
          const opt = sel.selectedOptions[0];
          if (opt && opt.dataset.price) {
            document.getElementById('o-value').value = opt.dataset.price.replace('R$ ', '');
          }
        };
        if (orderData.productId) {
          sel.value = orderData.productId;
          const opt = sel.selectedOptions[0];
          if (opt && opt.dataset.price) {
            document.getElementById('o-value').value = opt.dataset.price.replace('R$ ', '');
          }
        }
      }
    }, 0);
  };

  window.closeDynamicOrderModal = function () {
    const modal = document.getElementById('dynamic-order-modal');
    if (modal) modal.remove();
  };

  window.saveDynamicOrder = async function () {
    const id = document.getElementById('order-edit-id').value;
    const sel = document.getElementById('o-product');
    const opt = sel?.selectedOptions[0];

    const orderData = {
      client: getVal('o-client'),
      phone: getVal('o-phone'),
      productId: sel?.value || '',
      productName: opt?.dataset.name || '',
      productBrand: opt?.dataset.brand || '',
      imageUrl: opt?.dataset.image || '',
      size: getVal('o-size'),
      color: getVal('o-color'),
      value: getVal('o-value'),
      status: getVal('o-status'),
      notes: getVal('o-notes'),
    };

    if (!orderData.client || !orderData.value) {
      alert('Preencha Nome do Cliente e Valor.');
      return;
    }

    try {
      if (id) {
        const existing = allOrders.find(o => o.id === id) || {};
        const merged = { ...existing, ...orderData };
        if (existing.imageUrl && !orderData.imageUrl) merged.imageUrl = existing.imageUrl;
        await window.ntDB.orders.update(id, merged);
        const idx = allOrders.findIndex(o => o.id === id);
        if (idx !== -1) allOrders[idx] = { ...allOrders[idx], ...merged };
      } else {
        const newO = await window.ntDB.orders.add(orderData);
        allOrders.push(newO);
      }

      closeDynamicOrderModal();
      renderOrdersTable();
      showToast('📦', id ? 'Pedido atualizado!' : 'Pedido registrado!', orderData.client);
    } catch (e) {
      alert('Erro ao salvar pedido: ' + e.message);
    }
  };

  window.closeOrderModal = function () {
    const modal = document.getElementById('order-modal');
    if (modal) {
      modal.classList.remove('open');
      // Clear nuclear inline styles
      modal.style.cssText = '';
      document.body.style.removeProperty('opacity');
      document.body.style.removeProperty('visibility');
    }
  };

  window.editOrder = function (id) {
    openOrderModal(id);
  };

  window.saveOrder = async function () {
    const id = document.getElementById('order-edit-id').value;
    const sel = document.getElementById('o-product');
    const opt = sel.selectedOptions[0];

    const orderData = {
      client: getVal('o-client'),
      phone: getVal('o-phone'),
      productId: sel.value,
      productName: opt?.dataset.name || '',
      productBrand: opt?.dataset.brand || '',
      size: getVal('o-size'),
      color: getVal('o-color'),
      value: getVal('o-value'),
      status: getVal('o-status'),
      notes: getVal('o-notes'),
    };

    if (!orderData.client || !orderData.value) {
      alert('Preencha Nome do Cliente e Valor.');
      return;
    }

    try {
      if (id) {
        await window.ntDB.orders.update(id, orderData);
        const idx = allOrders.findIndex(o => o.id === id);
        if (idx !== -1) allOrders[idx] = { ...allOrders[idx], ...orderData };
      } else {
        const newO = await window.ntDB.orders.add(orderData);
        allOrders.push(newO);
      }

      closeOrderModal();
      renderOrdersTable();
      showToast('📦', id ? 'Pedido atualizado!' : 'Pedido registrado!', orderData.client);
    } catch (e) {
      alert('Erro ao salvar pedido: ' + e.message);
    }
  };

  window.confirmDeleteOrder = function (id) {
    const o = allOrders.find(o => o.id === id);
    if (!o) {
      showToast('!', 'Pedido não encontrado', 'Recarregue a página e tente novamente.');
      return;
    }
    showConfirm(`Excluir pedido de "${o.client || ''}"?`, async () => {
      try {
        await window.ntDB.orders.delete(id);
        allOrders = allOrders.filter(o => o.id !== id);
        renderOrdersTable();
        showToast('🗑️', 'Pedido excluído', o.client || '');
      } catch (e) {
        console.error('Falha ao excluir o pedido:', e);
        showToast('✘', 'Falha ao excluir', e.message);
        alert('Erro ao excluir: ' + e.message);
      }
    });
  };

  // ══════════════════════════════════════════
  //  SETTINGS
  // ══════════════════════════════════════════

  function loadSettings() {
    const config = window.ntDB?.config() || {};
    const wppSettings = JSON.parse(localStorage.getItem('nte_wpp_settings') || '{}');

    // Set current DB mode
    currentDBMode = config.mode || 'local';
    document.querySelectorAll('.db-mode-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.mode === currentDBMode);
    });
    selectDBMode(currentDBMode, null, false);

    // Fill Firebase fields
    if (config.firebase) {
      setValue('fb-api-key', config.firebase.apiKey || '');
      setValue('fb-auth-domain', config.firebase.authDomain || '');
      setValue('fb-project-id', config.firebase.projectId || '');
      setValue('fb-storage-bucket', config.firebase.storageBucket || '');
      setValue('fb-app-id', config.firebase.appId || '');
    }

    // Fill Supabase fields
    if (config.supabase) {
      setValue('sb-url', config.supabase.url || '');
      setValue('sb-anon-key', config.supabase.anonKey || '');
    }

    // WhatsApp
    setValue('wpp-number', wppSettings.number || '5575999283496');
    setValue('wpp-greeting', wppSettings.greeting || 'Olá! Vim pelo site da NT Eleganz e gostaria de saber mais sobre os produtos.');

    // Username
    setValue('new-username', window.ntAuth?.getUsername() || 'admin');
  }

  window.selectDBMode = function (mode, el, updateDOM = true) {
    currentDBMode = mode;
    if (el && updateDOM) {
      document.querySelectorAll('.db-mode-option').forEach(opt => opt.classList.remove('active'));
      el.classList.add('active');
    }

    document.getElementById('firebase-fields').classList.toggle('visible', mode === 'firebase');
    document.getElementById('supabase-fields').classList.toggle('visible', mode === 'supabase');
  };

  window.saveDBConfig = async function () {
    const alertEl = document.getElementById('db-alert');
    let config = { mode: currentDBMode };

    if (currentDBMode === 'firebase') {
      config.firebase = {
        apiKey: getVal('fb-api-key'),
        authDomain: getVal('fb-auth-domain'),
        projectId: getVal('fb-project-id'),
        storageBucket: getVal('fb-storage-bucket'),
        appId: getVal('fb-app-id'),
      };
    } else if (currentDBMode === 'supabase') {
      config.supabase = {
        url: getVal('sb-url'),
        anonKey: getVal('sb-anon-key'),
      };
    }

    try {
      const result = await window.ntDB.setConfig(config);
      if (currentDBMode !== 'local' && (!result?.ok || result.mode !== currentDBMode)) {
        throw new Error(result?.error || 'Não foi possível conectar ao banco selecionado. Revise as credenciais.');
      }
      allProducts = await window.ntDB.products.getAll();
      await syncProducts(true);
      const labels = { local: 'LocalStorage', firebase: 'Firebase', supabase: 'Supabase', hostinger: 'Hostinger (produtos)' };
      document.getElementById('db-mode-label').textContent = labels[currentDBMode];
      alertEl.innerHTML = `<div class="alert alert-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Configuração salva! Banco: ${labels[currentDBMode]}</div>`;
      showToast('✦', 'DB configurado!', labels[currentDBMode]);
    } catch (e) {
      alertEl.innerHTML = `<div class="alert alert-danger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Erro: ${e.message}</div>`;
    }
  };

  window.testDBConnection = async function () {
    const btn = document.getElementById('test-db-btn');
    btn.textContent = 'Testando...';
    btn.disabled = true;
    const alertEl = document.getElementById('db-alert');

    try {
      const products = await window.ntDB.products.getAll();
      alertEl.innerHTML = `<div class="alert alert-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Conexão OK! ${products.length} produto(s) encontrado(s).</div>`;
    } catch (e) {
      alertEl.innerHTML = `<div class="alert alert-danger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>Falha na conexão: ${e.message}</div>`;
    } finally {
      btn.textContent = 'Testar Conexão';
      btn.disabled = false;
    }
  };

  window.saveCredentials = async function () {
    const alertEl = document.getElementById('cred-alert');
    const newUser = getVal('new-username');
    const currentPass = getVal('current-pass');
    const newPass = getVal('new-pass');
    const confirmPass = getVal('confirm-pass');

    if (!currentPass) {
      alertEl.innerHTML = '<div class="alert alert-danger">Informe a senha atual.</div>';
      return;
    }

    if (newPass && newPass !== confirmPass) {
      alertEl.innerHTML = '<div class="alert alert-danger">As novas senhas não coincidem.</div>';
      return;
    }

    let result = { success: true };

    if (newUser && newUser !== window.ntAuth?.getUsername()) {
      result = await window.ntAuth.changeUsername(currentPass, newUser);
    }

    if (result.success && newPass) {
      result = await window.ntAuth.changePassword(currentPass, newPass);
    }

    if (result.success) {
      alertEl.innerHTML = '<div class="alert alert-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Credenciais atualizadas com sucesso!</div>';
      document.getElementById('sidebar-username').textContent = newUser || window.ntAuth?.getUsername();
      document.getElementById('sidebar-avatar').textContent = (newUser || 'A').charAt(0).toUpperCase();
      setValue('current-pass', '');
      setValue('new-pass', '');
      setValue('confirm-pass', '');
    } else {
      alertEl.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
    }
  };

  window.saveWhatsApp = function () {
    const alertEl = document.getElementById('wpp-alert');
    const settings = {
      number: getVal('wpp-number'),
      greeting: getVal('wpp-greeting'),
    };
    localStorage.setItem('nte_wpp_settings', JSON.stringify(settings));
    alertEl.innerHTML = '<div class="alert alert-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>WhatsApp atualizado!</div>';
    showToast('💬', 'WhatsApp salvo!', settings.number);
  };

  // ── Export / Import ──
  window.exportData = function () {
    window.ntDB?.export();
    showToast('💾', 'Exportando dados...', 'arquivo JSON sendo baixado');
  };

  window.importData = async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await window.ntDB?.import(file);
      allProducts = await window.ntDB.products.getAll();
      allOrders = await window.ntDB.orders.getAll();
      showToast('✦', 'Dados importados!', `${allProducts.length} produtos, ${allOrders.length} pedidos`);
      loadOverview();
    } catch (err) {
      alert('Erro ao importar: ' + err.message);
    }
  };

  // ══════════════════════════════════════════
  //  UTILITIES
  // ══════════════════════════════════════════

  function statusBadge(status) {
    const map = {
      novo: 'badge-info',
      confirmado: 'badge-warning',
      enviado: 'badge-gold',
      entregue: 'badge-success',
      cancelado: 'badge-danger',
    };
    const cls = map[status] || 'badge-muted';
    const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    return `<span class="badge ${cls}">${escHtml(label)}</span>`;
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function getVal(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // ── Confirm Modal ──
window.showConfirm = function (msg, callback) {
    
    // Remove any existing dynamic confirm modal
    const existing = document.getElementById('dynamic-confirm-modal');
    if (existing) existing.remove();
    
    confirmCallback = callback;
    
    // Build modal dynamically (bypass all CSS)
    const overlay = document.createElement('div');
    overlay.id = 'dynamic-confirm-modal';
    overlay.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      z-index: 99999 !important;
      background: rgba(0,0,0,0.6) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 20px !important;
      font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif) !important;
    `;
    overlay.onclick = (e) => { if (e.target === overlay) closeDynamicConfirmModal(); };
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--bg-surface, #0f0f0f) !important;
      border: 1px solid var(--border, rgba(201, 168, 76, 0.3)) !important;
      border-radius: 16px !important;
      max-width: min(420px, 90vw) !important;
      width: 100% !important;
      overflow: hidden !important;
      box-shadow: 
        0 4px 24px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(201, 168, 76, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
      color: var(--text-primary, #f2efe9) !important;
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    `;
    
    // Header
    const overlayEl = document.createElement('div');
    overlayEl.id = 'dynamic-confirm-modal';
    overlayEl.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      z-index: 99999 !important;
      background: rgba(0, 0, 0, 0.55) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: clamp(16px, 4vw, 24px) !important;
      font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif) !important;
      animation: fadeIn 0.2s ease-out !important;
    `;
    overlayEl.onclick = (e) => { if (e.target === overlayEl) closeDynamicConfirmModal(); };
    
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `
      background: var(--bg-surface, #1a1a1a) !important;
      border: 2px solid var(--gold, #c9a84c) !important;
      border-radius: var(--radius-xl, 12px) !important;
      max-width: 420px !important;
      width: 100% !important;
      overflow: hidden !important;
      box-shadow: var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.7)) !important;
      color: var(--text-primary, #f2efe9) !important;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 16px 20px !important;
      border-bottom: 1px solid var(--border, rgba(201, 168, 76, 0.2)) !important;
      background: rgba(201, 168, 76, 0.03) !important;
    `;
    header.innerHTML = `
      <h3 style="margin:0;font-size:1rem;font-weight:600;color:var(--text-primary, #f2efe9);letter-spacing:0.01em;">Confirmar</h3>
      <button onclick="closeDynamicConfirmModal()" style="
        width: 32px !important;
        height: 32px !important;
        border: none !important;
        border-radius: 8px !important;
        background: var(--bg-hover, rgba(255,255,255,0.04)) !important;
        color: var(--text-muted, #888) !important;
        font-size: 1.25rem !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.15s ease !important;
      " onmouseover="this.style.background='var(--bg-hover,rgba(255,255,255,0.08))'" onmouseout="this.style.background='var(--bg-hover,rgba(255,255,255,0.04))'">×</button>
    `;
    
    // Body
    const body = document.createElement('div');
    body.style.cssText = `padding: 20px 24px !important; text-align: center !important;`;
    body.innerHTML = `
      <p style="margin:0;color:var(--text-secondary, #bbb);line-height:1.6;font-size:.9rem;">${escHtml(msg)}</p>
    `;
    
    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      display:flex !important; justify-content:center !important; gap:10px !important;
      padding:16px 20px !important; border-top:1px solid var(--border, rgba(201,168,76,0.2)) !important;
      background: rgba(201, 168, 76, 0.03) !important;
    `;
    footer.innerHTML = `
      <button onclick="closeDynamicConfirmModal()" style="
        padding:10px 20px !important;
        border:1px solid rgba(201,168,76,0.2) !important;
        border-radius:8px !important;
        background:transparent !important;
        color:#bbb !important;
        cursor:pointer !important;
        font-size:.85rem !important;
        font-weight:500 !important;
        transition:all 0.15s ease !important;
      " onmouseover="this.style.borderColor='#c9a84c';this.style.color='#c9a84c'" onmouseout="this.style.borderColor='rgba(201,168,76,0.2)';this.style.color='#bbb'">Cancelar</button>
      <button onclick="confirmDynamicConfirm()" style="
        padding:10px 20px !important;
        border:none !important;
        border-radius:8px !important;
        background:#e03e3e !important;
        color:#fff !important;
        font-weight:600 !important;
        cursor:pointer !important;
        font-size:.85rem !important;
        box-shadow:0 2px 8px rgba(224,62,62,0.3) !important;
        transition:background-color 0.15s ease !important;
      " onmouseover="this.style.backgroundColor='#c02e2e'" onmouseout="this.style.backgroundColor='#e03e3e'">Confirmar exclusão</button>
    `;
    
    modalEl.style.cssText = `
      background: var(--bg-surface, #1a1a1a) !important;
      border: 2px solid var(--gold, #c9a84c) !important;
      border-radius: var(--radius-xl, 12px) !important;
      max-width: 420px !important;
      width: 100% !important;
      overflow: hidden !important;
      box-shadow: var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.7)) !important;
      color: var(--text-primary, #f2efe9) !important;
    `;
    
    modalEl.appendChild(header);
    modalEl.appendChild(body);
    modalEl.appendChild(footer);
    
    overlayEl.appendChild(modalEl);
    document.body.appendChild(overlayEl);
    
    return true;
  };

  window.closeDynamicConfirmModal = function () {
    const modal = document.getElementById('dynamic-confirm-modal');
    if (modal) modal.remove();
  };

  window.confirmDynamicConfirm = async function () {
    const cb = confirmCallback;
    if (cb) {
      closeDynamicConfirmModal();
      try { await cb(); } catch (e) { console.error('Confirm callback error:', e); alert('Erro: ' + e.message); }
    }
  };

  window.closeConfirm = function () {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
      modal.classList.remove('open');
      // Clear inline styles we forced with !important
      modal.style.removeProperty('opacity');
      modal.style.removeProperty('visibility');
      modal.style.removeProperty('pointer-events');
      // Clear child modal styles
      const modalChild = modal.querySelector('.modal');
      if (modalChild) {
        modalChild.style.removeProperty('opacity');
        modalChild.style.removeProperty('visibility');
        modalChild.style.removeProperty('position');
        modalChild.style.removeProperty('z-index');
      }
      const parent = modal.parentElement;
      if (parent) {
        parent.style.removeProperty('opacity');
        parent.style.removeProperty('visibility');
      }
      document.body.style.removeProperty('opacity');
      document.body.style.removeProperty('visibility');
    }
    confirmCallback = null;
  };

  // ── Toast ──
  function showToast(icon, title, msg) {
    let container = document.getElementById('admin-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'admin-toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div>
        <div class="toast-title">${escHtml(title)}</div>
        ${msg ? `<div class="toast-desc">${escHtml(msg)}</div>` : ''}
      </div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ── Start ──
  // Uma alteração feita nesta aba já foi aplicada em allProducts, então
  // sincronizar de novo aqui seria trabalho duplicado. Alterações vindas de
  // outra aba/dispositivo chegam com detail.external e precisam ser buscadas.
  window.addEventListener('nte:products-changed', event => {
    if (event?.detail?.source === 'current-window') return;
    syncProducts(false, { force: true });
  });
  window.addEventListener('nte:leads-changed', () => { refreshLeads(); });
  window.addEventListener('nte:orders-changed', () => { refreshOrders(); });
  window.addEventListener('storage', event => {
    if (event.key === 'nte_hydrated_products' || event.key === 'nte_products') syncProducts(false, { force: true });
    if (event.key === 'nte_leads') refreshLeads();
    if (event.key === 'nte_orders') refreshOrders();
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('p-category')?.addEventListener('change', updateSizeSuggestions);
    document.querySelectorAll('.nav-item').forEach(item => {
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.click();
        }
      });
    });
    Promise.resolve(window.ntAuth?.requireAuth?.()).then(authenticated => {
      if (!authenticated) return;
      return init();
    }).then(() => {
      if (!window.ntAuth?.getUsername()) return;
      // Cloud data sources do not share the browser storage event. Polling keeps
      // an open dashboard current without needing an additional realtime service.
      window.setInterval(() => refreshLeads(), 30000);
      window.setInterval(() => {
        if (!document.hidden && currentDBMode !== 'local') syncProducts(false, { force: true });
      }, 20000);
      window.setInterval(() => {
        if (!document.hidden && currentDBMode !== 'local') refreshOrders();
      }, 25000);
    }).catch(error => {
      console.error('Não foi possível iniciar a dashboard:', error);
      hideLoader();
      showToast('!', 'Falha ao iniciar a dashboard', error?.message || 'Verifique a configuração do banco de dados.');
    });
  });

  // Watchdog: em redes móveis a autenticação/Supabase pode pendurar e manter o
  // loader infinito sem nenhuma explicação. Se o boot não concluir em 12s,
  // esconde o spinner e expõe o erro real (ou orientação) na tela.
  window.setTimeout(() => {
    const loader = document.getElementById('admin-loader');
    if (!loader || loader.classList.contains('hidden')) return;
    hideLoader();
    const errEl = document.getElementById('login-error') || document.querySelector('.login-error');
    const msg = 'A autenticação está demorando mais que o esperado. Verifique sua conexão (rede móvel) e tente novamente.';
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.add('visible');
      return;
    }
    showToast('!', 'Conexão lenta', msg);
  }, 12000);

})();
