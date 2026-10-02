(() => {
  const section = document.querySelector('.purchase-terms');
  if (!section || !('IntersectionObserver' in window)) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches) return;
  const elements = [...section.querySelectorAll('[data-terms-reveal]')];
  const observer = new IntersectionObserver(entries => {
    let order = 0;
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.style.setProperty('--terms-delay', `${Math.min(order++, 4) * 110}ms`);
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });
  section.classList.add('purchase-terms--animated');
  elements.forEach(element => observer.observe(element));
  motion.addEventListener('change', event => {
    if (event.matches) {
      observer.disconnect();
      section.classList.remove('purchase-terms--animated');
    }
  });
})();
