/* FAQ managed by the administration dashboard. */
(() => {
  'use strict';

  const FAQ_ID = 'faq-content';
  const PAYMENT_QUESTION = 'Quais são as formas de pagamento disponíveis?';
  const PAYMENT_ANSWER = 'Aceitamos PIX e cartão de crédito. As condições de pagamento são confirmadas diretamente pelo WhatsApp após a seleção do produto.';
  const SHIPPING_QUESTION = 'Enviam para todo Brasil?';
  const SHIPPING_ANSWER = 'Sim, o envio é realizado pelos correios para todo território nacional, consulte opções de envios disponíveis no fechamento da sua compra.';
  const LEGACY_SHIPPING_QUESTION = 'Qual o prazo e custo do frete?';
  const LEGACY_EXCHANGE_QUESTION = 'Posso trocar ou devolver um produto?';
  const defaults = [
    { question: 'Como funciona o processo de compra?', answer: 'É simples! Escolha o produto que deseja, adicione ao carrinho e clique em "Finalizar via WhatsApp". Você será redirecionado diretamente para uma conversa conosco com os detalhes do seu pedido já preenchidos. Nosso especialista confirma a disponibilidade e formas de pagamento.' },
    { question: 'As peças são originais e autenticadas?', answer: 'Sim, 100%. Trabalhamos apenas com peças originais de procedência comprovada. Todas as nossas grifes são autenticadas antes de chegar até você.' },
    { question: 'Quais são as formas de pagamento disponíveis?', answer: 'Aceitamos PIX e cartão de crédito. As condições de pagamento são confirmadas diretamente pelo WhatsApp após a seleção do produto.' },
    { question: SHIPPING_QUESTION, answer: SHIPPING_ANSWER },
  ];

  const escapeHtml = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let lastSnapshot = '';
  let paymentMigrationAttempted = false;

  function normalizeItems(items) {
    const validItems = Array.isArray(items) && items.length ? items : defaults;
    let changed = false;
    const normalizedItems = validItems
      .filter(item => {
        const question = String(item?.question || '').trim().toLocaleLowerCase();
        if (question === LEGACY_EXCHANGE_QUESTION.toLocaleLowerCase()) {
          changed = true;
          return false;
        }
        return true;
      })
      .map(item => {
      const question = String(item?.question || '').trim().toLocaleLowerCase();
      if (question === PAYMENT_QUESTION.toLocaleLowerCase() && item.answer !== PAYMENT_ANSWER) {
        changed = true;
        return { ...item, answer: PAYMENT_ANSWER };
      }
      if (question === SHIPPING_QUESTION.toLocaleLowerCase() || question === LEGACY_SHIPPING_QUESTION.toLocaleLowerCase()) {
        if (item.question !== SHIPPING_QUESTION || item.answer !== SHIPPING_ANSWER) changed = true;
        return { ...item, question: SHIPPING_QUESTION, answer: SHIPPING_ANSWER };
      }
      return item;
      });
    return { items: normalizedItems, changed };
  }

  function render(items) {
    const list = document.querySelector('#faq .faq-list');
    if (!list) return;
    const validItems = Array.isArray(items) && items.length ? items : defaults;
    const snapshot = JSON.stringify(validItems);
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;
    list.innerHTML = validItems.map((item, index) => `
      <div class="faq-item" role="listitem">
        <button class="faq-trigger" type="button" aria-expanded="false" aria-controls="faq-answer-${index + 1}">
          <span class="faq-question">${escapeHtml(item.question)}</span>
          <span class="faq-icon" aria-hidden="true">+</span>
        </button>
        <div class="faq-content" id="faq-answer-${index + 1}">
          <p class="faq-answer">${escapeHtml(item.answer)}</p>
        </div>
      </div>`).join('');
  }

  async function load() {
    try {
      await window.ntDB?.init();
      const data = await window.ntDB?.settings.getById(FAQ_ID);
      const normalized = normalizeItems(data?.items || defaults);
      render(normalized.items);
      if (data && normalized.changed && !paymentMigrationAttempted) {
        paymentMigrationAttempted = true;
        try {
          await window.ntDB.settings.update(FAQ_ID, { items: normalized.items });
        } catch (migrationError) {
          console.warn('A resposta atualizada da FAQ será mantida apenas nesta sessão:', migrationError);
        }
      }
    } catch (error) {
      console.warn('Não foi possível atualizar o FAQ:', error);
      if (!lastSnapshot) render(defaults);
    }
  }

  window.addEventListener('nte:settings-changed', load);
  window.addEventListener('storage', event => { if (event.key === 'nte_settings') load(); });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#faq .faq-list')?.addEventListener('click', event => {
      const trigger = event.target.closest('.faq-trigger');
      if (!trigger) return;
      const item = trigger.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('#faq .faq-item').forEach(other => {
        other.classList.remove('open');
        other.querySelector('.faq-trigger')?.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
    load();
  });
})();
