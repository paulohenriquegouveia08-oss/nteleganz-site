/* ============================================
   NT ELEGANZ — MAIN JS
   ============================================ */

(function () {
  'use strict';

  const escHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── Product Data ──
  const PRODUCTS = [
    {
      id: 'polo-001',
      brand: 'Polo Ralph Lauren',
      name: 'Polo Custom Slim Fit',
      price: 'R$ 649,00',
      oldPrice: 'R$ 849,00',
      badge: 'DESTAQUE',
      image: 'assets/images/product-polo-cutout.webp',
      colors: ['#1a3a5c', '#000000', '#8b2020'],
      sizes: ['P', 'M', 'G', 'GG'],
      category: 'roupas',
      featured: true,
      desc: 'Polo clássica em piquet de algodão premium. Corte slim com bordado Polo Player em destaque.',
      slug: 'polo-ralph-lauren-custom-slim',
    },
    {
      id: 'moncler-001',
      brand: 'Moncler',
      name: 'Doudoune Maya Puffer',
      price: 'R$ 8.990,00',
      oldPrice: null,
      badge: 'LUXO',
      image: 'assets/images/product-moncler-cutout.webp',
      colors: ['#1c2b3a', '#000000', '#3a1c1c'],
      sizes: ['P', 'M', 'G', 'GG'],
      category: 'roupas',
      featured: true,
      desc: 'Jaqueta puffer icônica da Moncler, preenchida com pluma de ganso premium. Acabamento impecável.',
      slug: 'moncler-doudoune-maya',
    },
    {
      id: 'birkenstock-001',
      brand: 'Birkenstock',
      name: 'Arizona Leather',
      price: 'R$ 899,00',
      oldPrice: 'R$ 1.099,00',
      badge: 'OFERTA',
      image: 'assets/images/product-birkenstock-cutout.webp',
      colors: ['#8b6b3d', '#000000', '#d4c4a8'],
      sizes: ['38', '39', '40', '41', '42', '43'],
      category: 'calcados',
      desc: 'Sandália Arizona em couro genuíno com palmilha anatômica de cortiça e látex natural.',
      slug: 'birkenstock-arizona-leather',
    },
    {
      id: 'sundek-001',
      brand: 'Sundek',
      name: 'Short Classic Swim',
      price: 'R$ 429,00',
      oldPrice: null,
      badge: null,
      image: 'assets/images/product-sundek-cutout.webp',
      colors: ['#1a7a8a', '#1a3a8a', '#ffffff'],
      sizes: ['P', 'M', 'G', 'GG'],
      category: 'roupas',
      desc: 'Short de banho clássico Sundek com amarração ajustável e bolsos laterais com zíper.',
      slug: 'sundek-short-classic',
    },
    {
      id: 'allsaints-001',
      brand: 'All Saints',
      name: 'Kino Leather Biker',
      price: 'R$ 3.299,00',
      oldPrice: 'R$ 3.899,00',
      badge: 'BEST SELLER',
      image: 'assets/images/product-allsaints-cutout.webp',
      colors: ['#000000', '#3d2b1f'],
      sizes: ['P', 'M', 'G', 'GG'],
      category: 'roupas',
      featured: true,
      desc: 'Jaqueta biker em couro legítimo com hardware prateado. O ícone da marca All Saints.',
      slug: 'allsaints-kino-leather-biker',
    },
    {
      id: 'villebrequin-001',
      brand: 'Vilebrequin',
      name: 'Moorea Swim Trunks',
      price: 'R$ 1.190,00',
      oldPrice: null,
      badge: null,
      image: 'assets/images/product-sundek-cutout.webp',
      colors: ['#1a5c3a', '#1a3a5c', '#8b2020'],
      sizes: ['P', 'M', 'G', 'GG'],
      category: 'roupas',
      desc: 'Shorts de banho Moorea com estampa exclusiva e tecido de secagem rápida. Made in France.',
      slug: 'vilebrequin-moorea-swim',
    },
  ];
  // Catálogo de desenvolvimento. NÃO é fonte de verdade e não deve chegar ao
  // cliente: preços e imagens aqui são fictícios. Serve só de referência para
  // desenvolvimento offline e para o carrinho identificar produtos sem backend.
  window.NT_PRODUCT_DEFAULTS = PRODUCTS;

  // ── State ──
  let currentFilter = 'todos';
  // Começa vazio de propósito. Antes vinha [...PRODUCTS], e o primeiro render
  // mostrava esses produtos fictícios até o banco responder — o cliente via
  // Polo/Moncler com preço de demonstração por um instante. Enquanto o
  // catálogo não chegou, o grid mostra o skeleton do HTML.
  let ACTIVE_PRODUCTS = [];
  // Separa "ainda não carregou" de "carregou e está realmente vazio": no
  // primeiro caso o skeleton fica, no segundo a seção é escondida.
  let productsLoaded = false;

  function catalogCategory(product) {
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const explicit = normalize(product.category);
    if (['camisetas', 'shorts', 'calcados', 'hoodies'].includes(explicit)) return explicit;
    const text = normalize(`${product.name || ''} ${product.category || ''}`);
    if (/calcado|sandalia|tenis|sapato|sneaker|birkenstock/.test(text)) return 'calcados';
    if (/short|bermuda|swim|trunk/.test(text)) return 'shorts';
    if (/hood|moletom|puffer|jaqueta|jacket|biker|leather/.test(text)) return 'hoodies';
    return 'camisetas';
  }

  // ── Load products from DB (if available) ──
  async function loadProductsFromDB(options = {}) {
    if (window.ntDB) {
      const requestedMode = window.ntDB.config?.().mode || 'local';
      try {
        const result = await window.ntDB.init();
        if (requestedMode !== 'local' && result?.mode !== requestedMode) {
          ACTIVE_PRODUCTS = [];
          window.NT_PRODUCTS = ACTIVE_PRODUCTS;
          productsLoaded = true;
          return;
        }

        // Pela camada de dados, nunca lendo o snapshot do LocalStorage direto:
        // era assim que a home continuava mostrando o catálogo antigo depois
        // de um produto ser criado ou editado no painel.
        const dbProducts = await window.ntDB.products.getAll(options);

        if (Array.isArray(dbProducts)) {
          // Só o que o servidor devolveu. A lista estática local ficaria de fora
          // de propósito: ela é catálogo de demonstração, não o da loja.
          ACTIVE_PRODUCTS = dbProducts.filter(p => p.active !== false);
        }
      } catch (e) {
        console.warn('DB load failed:', e);
        if (requestedMode !== 'local') ACTIVE_PRODUCTS = [];
      }
    } else {
      ACTIVE_PRODUCTS = [];
    }
    // Catálogo consultado (com sucesso ou não): a partir daqui o skeleton sai e
    // a seção passa a refletir a resposta real, inclusive quando ela é vazia.
    productsLoaded = true;
    window.NT_PRODUCTS = ACTIVE_PRODUCTS;
  }

  // ── Get products by filter ──
  function getFilteredProducts() {
    if (currentFilter === 'todos') return ACTIVE_PRODUCTS;
    return ACTIVE_PRODUCTS.filter(p => p.category === currentFilter);
  }

  // ── Render product card HTML ──
  function respSrcset(src) {
    const m = (src || '').match(/^assets\/images\/[^?]+\.webp(?:\?.*)?$/);
    if (!m) return '';
    const base = src.replace(/\.webp(\?.*)?$/, '');
    return ` srcset="${escHtml(base)}-400.webp 1x, ${escHtml(base)}-800.webp 2x"`;
  }

  function renderProductCard(product) {
    const image = escHtml(product.image);
    const brand = escHtml(product.brand || '');
    const name = escHtml(product.name || '');
    const productUrl = (window.ntWpp?.getProductUrl ? window.ntWpp.getProductUrl(product) : `/products/?id=${escHtml(product.id)}`);
    return `
      <a class="product-card" href="${productUrl}" data-product-id="${escHtml(product.id)}" aria-label="Ver ${name}">
        <div class="product-card__image-wrap">
          <img src="${image}"${respSrcset(product.image)} alt="${brand} ${name}" loading="lazy" decoding="async">
          ${product.badge ? `<span class="product-card__badge">${escHtml(product.badge)}</span>` : ''}
        </div>
        <div class="product-card__info">
          <span class="product-card__brand">${brand}</span>
          <h3 class="product-card__name" style="transition: color var(--transition-fast);">${name}</h3>
          <div class="product-card__price-row">
            <span class="product-card__price">${escHtml(product.price)}</span>
            ${product.oldPrice ? `<span class="product-card__price--old">${escHtml(product.oldPrice)}</span>` : ''}
          </div>
        </div>
      </a>
    `;
  }

  // ── Render products grid (legacy, unused) ──
  function renderProductsGrid() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    const filtered = getFilteredProducts();
    grid.innerHTML = filtered.map(renderProductCard).join('');
}

// ── Render Mais Vendidos (bestsellers) ──
  function renderBestsellers() {
    const grid = document.getElementById('bestsellers-grid');
    const section = document.querySelector('.bestsellers-section');
    if (!grid) return;
    // Catálogo ainda não chegou: deixa os skeleton cards do HTML no lugar em vez
    // de esconder a seção. Esconder agora causaria um salto de layout, porque a
    // seção voltaria some milissegundos depois com os produtos reais.
    if (!productsLoaded) return;
    let featured = ACTIVE_PRODUCTS.filter(p => p.featured === true && p.active !== false);
    if (featured.length === 0) {
      // Sem destaque marcado, mostra os ativos do servidor: assim um produto
      // recém-criado aparece mesmo sem ter sido marcado como destaque.
      featured = ACTIVE_PRODUCTS.slice(0, 8);
    }
    if (featured.length === 0) {
      // Catálogo confirmado e vazio. Não se recorre a NT_PRODUCT_DEFAULTS aqui:
      // é catálogo fictício, e um cliente nunca deve ver preço de demonstração.
      if (section) section.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';
    grid.innerHTML = featured.map(renderProductCard).join('');
  }

function renderCatalogSections() {
    const holder = document.getElementById('catalog-product-sections');
    if (!holder) return;
    const feedbackImages = Array.from({ length: 13 }, (_, index) => `assets/images/feedback-${index + 1}.webp`);
    const feedbackModalControls = `<input class="feedback-viewer-toggle" type="radio" name="feedback-viewer" id="feedback-viewer-close" checked>`;
    const feedbackModals = feedbackImages.map((src, index) => {
      const current = index + 1;
      const previous = index === 0 ? feedbackImages.length : index;
      const next = index === feedbackImages.length - 1 ? 1 : index + 2;
      // Use original image as fallback since -400/-800 variants don't exist for all images
      return `<div class="feedback-native-modal feedback-native-modal--${current}" role="dialog" aria-modal="true" aria-label="Feedback de cliente ampliado"><label class="feedback-native-modal__backdrop" for="feedback-viewer-close" aria-label="Fechar imagem"></label><label class="feedback-native-modal__close" for="feedback-viewer-close" aria-label="Fechar imagem">×</label><label class="feedback-native-modal__nav feedback-native-modal__nav--previous" for="feedback-viewer-${previous}" aria-label="Feedback anterior">‹</label><img src="${src}" srcset="${src} 1200w" sizes="(min-width:700px) 860px, 92vw" alt="Feedback de cliente NT Eleganz ${current}" loading="lazy" decoding="async"><label class="feedback-native-modal__nav feedback-native-modal__nav--next" for="feedback-viewer-${next}" aria-label="Próximo feedback">›</label><span class="feedback-native-modal__count">${current} / ${feedbackImages.length}</span></div>`;
    }).join('');
    holder.innerHTML = `<section class="feedback-section" aria-labelledby="feedback-title">
      ${feedbackModalControls}
      <header class="feedback-section__head">
        <div>
          <span class="feedback-section__eyebrow">Quem escolhe a NT</span>
          <h2 id="feedback-title" class="feedback-section__title">Feedbacks reais</h2>
        </div>
        <span class="feedback-section__hint">Arraste para explorar <span aria-hidden="true">→</span></span>
      </header>
      <div class="feedback-section__track" role="list" aria-label="Feedbacks de clientes">
        ${feedbackImages.map((src, index) => {
          // Use original image as fallback for thumb
          const thumb = src; // variants -400.webp don't exist for all images
          return `<input class="feedback-section__card feedback-viewer-choice" type="radio" name="feedback-viewer" id="feedback-viewer-${index + 1}" aria-label="Ampliar feedback de cliente NT Eleganz ${index + 1}" style="background-image:url('${thumb}')">`;
        }).join('')}
      </div>
      ${feedbackModals}
    </section>`;
  }

  function initFeedbackGallery() {
    // Event handlers are attached by the shared media viewer after rendering.
  }

  // ── Get product by ID ──
  function getProduct(id) {
    return ACTIVE_PRODUCTS.find(p => p.id === id);
  }

  // ── Add to cart ──
  window.addToCart = function (productId, size = null, color = null) {
    const product = getProduct(productId);
    if (!product) return;
    const variant = window.ntCart?.defaultVariant?.(product) || {};
    window.ntCart?.add({ ...product, size: size || variant.size, color: color || variant.color });
  };

  // ── Buy now via WhatsApp ──
  window.buyNow = function (productId, size = null, color = null) {
    const product = getProduct(productId);
    if (!product) return;
    window.ntWpp?.orderProduct(
      product,
      size || product.sizes[0],
      color || 'Padrão'
    );
  };

  // ── Filter tabs ──
  function initFilterTabs() {
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter || 'todos';
        renderProductsGrid();
      });
    });
  }

  // ── Sticky header ──
  function initStickyHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 60);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ── Search bar ──
  function initSearch() {
    const searchBar = document.getElementById('search-bar');
    const searchBtn = document.getElementById('search-btn');
    const searchClose = document.getElementById('search-close');
    const searchInput = document.getElementById('search-input');

    if (!searchBar) return;

    searchBtn?.addEventListener('click', () => {
      searchBar.classList.add('open');
      setTimeout(() => searchInput?.focus(), 100);
    });

    searchClose?.addEventListener('click', () => {
      searchBar.classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchBar.classList.remove('open');
        window.ntMenu?.close();
        window.ntCart?.close();
      }
    });
  }

  // ── FAQ Accordion ──
  function initFAQ() {
    const items = document.querySelectorAll('.faq-item');
    items.forEach((item, i) => {
      item.style.setProperty('--i', i);
      const trigger = item.querySelector('.faq-trigger');
      if (!trigger) return;
      trigger.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        // Close all
        items.forEach(it => it.classList.remove('open'));
        // Toggle current
        if (!isOpen) item.classList.add('open');
      });
    });
  }

  // ── Page loader ──
  function hideLoader() {
    const loader = document.getElementById('page-loader');
    if (!loader) return;
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 500);
  }

  // ── Scroll reveal (GSAP or fallback) ──
  function initScrollReveal() {
    const revealWithObserver = () => {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('revealed');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
      document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    };

    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      try {
        gsap.registerPlugin(ScrollTrigger);

        // Reveal sections. The base CSS starts these elements invisible, so the
        // animation must explicitly finish at the visible state.
        gsap.utils.toArray('[data-reveal]').forEach((el) => {
          gsap.fromTo(el,
            { opacity: 0, y: 40 },
            {
              opacity: 1,
              y: 0,
              duration: 0.8,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: el,
                start: 'top 85%',
                toggleActions: 'play none none none',
              },
              onComplete: () => {
                el.classList.add('revealed');
                gsap.set(el, { clearProps: 'opacity,transform' });
              },
            }
          );
        });

        // Stagger product cards
        gsap.utils.toArray('.products-grid').forEach((grid) => {
          const cards = grid.querySelectorAll('.product-card');
          if (!cards.length) return;
          gsap.from(cards, {
            opacity: 0,
            y: 30,
            stagger: 0.08,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: grid,
              start: 'top 80%',
            },
          });
        });

      } catch (error) {
        // A CDN dep loaded partially or failed (Chrome with blocked network):
        // never leave [data-reveal] hidden. Fall back to the observer below.
        revealWithObserver();
      }
    } else {
      // Fallback: IntersectionObserver
      revealWithObserver();
    }
  }

  function initHeroCoverScroll() {
    const hero = document.querySelector('.hero-static');
    const image = hero?.querySelector('.hero-static__img-wrap img');
    const content = hero?.querySelector('.hero-quote-right');
    if (!hero || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.to(image, { scale: 1.09, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to(content, { y: -42, opacity: .35, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom 25%', scrub: true } });
  }

  // ── Mouse glow on buttons ──
  function initButtonGlow() {
    document.querySelectorAll('.btn-glow-hover').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        btn.style.setProperty('--mx', `${x}%`);
        btn.style.setProperty('--my', `${y}%`);
      });
    });
  }

  // ── WhatsApp float button ──
  function initWhatsAppFloat() {
    const btn = document.getElementById('whatsapp-float');
    if (btn) {
      btn.addEventListener('click', () => window.ntWpp?.openGreeting());
    }
  }

  // ── Init all ──
  document.addEventListener('DOMContentLoaded', async () => {
    hideLoader();
    initStickyHeader();
    initSearch();
    initFAQ();
    initFilterTabs();

    // Hydration: o HTML já vem com os skeleton cards no lugar, e a galeria de
    // feedback é estática (depende só das imagens em assets/), então entra
    // agora. O grid de produtos fica no skeleton até o catálogo chegar.
    renderCatalogSections();
    initFeedbackGallery();
    document.dispatchEvent(new Event('nte:feedbacks-ready'));

    //products.getAll() devolve o snapshot do LocalStorage sem esperar a rede,
    // então o grid real aparece já no primeiro paint de verdade.
    await loadProductsFromDB();
    renderBestsellers();

    initScrollReveal();
    initHeroCoverScroll();
    initButtonGlow();
    initWhatsAppFloat();

    // Load WhatsApp settings from storage
    try {
      const wppSettings = JSON.parse(localStorage.getItem('nte_wpp_settings') || '{}');
      if (wppSettings.number && window.ntWpp) {
        window.ntWpp._number = wppSettings.number;
      }
    } catch (e) { /* ignore */ }

  });

  // Desenha o grid com o que já está em memória. NÃO busca nada: quem traga o
  // dado novo é a camada de dados, e ela só avisa quando o conteúdo mudou de
  // fato. Assim o grid não é reconstruído a toa a cada 20s.
  const refreshStorefrontProducts = async () => {
    await loadProductsFromDB();
    // Só o grid de produtos depende do catálogo. A galeria de feedback é
    // estática e NÃO é reconstruída aqui: re-injectá-la a cada mudança
    // descartaria a seleção do visualizador de imagens.
    renderBestsellers();
  };

  // Revalidação barata: envia If-None-Match e o servidor responde 304 sem corpo
  // quando o catálogo não mudou. `reload: true` desliga justamente esse
  // mecanismo (db.js:628) e obriga a baixar o catálogo inteiro de novo — era o
  // que fazia cada aba rebaixar a lista completa a cada 20 segundos.
  const revalidateCatalog = () => { window.ntDB?.refresh?.('products'); };

  // O evento só é disparado quando a assinatura do conteúdo divergiu, e o dado
  // novo já está no cache de memória quando chega aqui. Por isso o handler
  // renderiza sem `reload`: um `reload` aqui seria um segundo download do
  // catálogo logo depois do primeiro.
  window.addEventListener('nte:products-changed', () => { refreshStorefrontProducts(); });
  window.addEventListener('storage', event => {
    if (event.key === 'nte_hydrated_products' || event.key === 'nte_products') {
      refreshStorefrontProducts();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) revalidateCatalog();
  });
  window.setInterval(() => {
    if (!document.hidden) revalidateCatalog();
  }, 20000);

})();
