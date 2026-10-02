/* NT Eleganz — dynamic editorial showcase */
(function () {
  'use strict';

  const escapeHTML = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
  const safeUrl = value => /^(https?:|\/|#|[\w-]+\.html)/.test(String(value || '')) ? value : '#';

  function render(config) {
    const section = document.getElementById('editorial-showcase');
    const grid = document.getElementById('editorial-grid');
    if (!section || !grid) return;
    section.hidden = true;
    grid.innerHTML = '';
    if (!config?.enabled) return;
    const cards = (config.cards || []).filter(card => card.visible !== false && !card.isDemo).sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!cards.length) return;

    document.getElementById('editorial-kicker').textContent = config.kicker || '';
    document.getElementById('editorial-title').textContent = config.title || '';
    document.getElementById('editorial-description').textContent = config.description || '';
    grid.innerHTML = cards.map(card => {
      const align = ['flex-start', 'center', 'flex-end'].includes(card.alignment) ? card.alignment : 'flex-end';
      const contentClass = card.textAlign === 'center' ? ' editorial-card__content--center' : '';
      const overlay = card.overlay === false ? 0 : Math.min(1, Math.max(0, Number(card.overlayOpacity ?? .45)));
      const body = `<div class="editorial-card__content${contentClass}" style="--editorial-align:${align}">
        ${card.title ? `<h3 class="editorial-card__title">${escapeHTML(card.title)}</h3>` : ''}
        ${card.description ? `<p class="editorial-card__description">${escapeHTML(card.description)}</p>` : ''}
        ${card.buttonText ? `<span class="editorial-card__cta">${escapeHTML(card.buttonText)}</span>` : ''}
      </div>`;
      return `<a class="editorial-card" href="${escapeHTML(safeUrl(card.link))}" style="--editorial-col:${Math.max(1, Number(card.columnSpan) || 4)};--editorial-row:${Math.max(1, Number(card.rowSpan) || 5)};--editorial-overlay:${overlay}">
        ${card.image ? `<img class="editorial-card__image" src="${escapeHTML(card.image)}" alt="${escapeHTML(card.title || '')}" loading="lazy">` : ''}
        ${overlay ? '<span class="editorial-card__overlay"></span>' : ''}${body}</a>`;
    }).join('');
    section.hidden = false;
  }

  async function load() {
    try {
      await window.ntDB?.init();
      const saved = await window.ntDB?.settings.getById('editorial-showcase');
      render(saved || window.ntEditorialDefaults?.());
    } catch (error) { console.warn('Editorial showcase unavailable:', error); }
  }
  document.addEventListener('DOMContentLoaded', load);
  window.addEventListener('storage', event => { if (event.key === 'nte_settings') load(); });
})();
