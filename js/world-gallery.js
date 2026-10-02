(() => {
  'use strict';
  const section = document.querySelector('.world-section');
  if (!section) return;

  const reveal = () => section.classList.add('is-visible');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      reveal();
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(section);
  } else {
    reveal();
  }

  const lightbox = document.createElement('div');
  lightbox.className = 'world-lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Visualização ampliada');
  lightbox.innerHTML = '<button class="world-lightbox__close" type="button" aria-label="Fechar imagem">×</button><img class="world-lightbox__image" alt="">';
  document.body.appendChild(lightbox);
  const enlarged = lightbox.querySelector('.world-lightbox__image');
  const closeButton = lightbox.querySelector('.world-lightbox__close');
  let previousFocus = null;

  const close = () => {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
    previousFocus?.focus();
  };
  const open = card => {
    const source = card.querySelector('img');
    if (!source) return;
    previousFocus = card;
    enlarged.src = source.src;
    enlarged.alt = source.alt;
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    closeButton.focus();
  };

  section.querySelectorAll('.world-card').forEach(card => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', () => open(card));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(card); }
    });
  });
  closeButton.addEventListener('click', close);
  lightbox.addEventListener('click', event => { if (event.target === lightbox) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && lightbox.classList.contains('is-open')) close(); });

})();
