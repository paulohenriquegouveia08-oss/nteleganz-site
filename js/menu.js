/* ============================================
   NT ELEGANZ — MENU SPHERE (GSAP)
   ============================================ */

(function () {
  'use strict';

  let isOpen = false;
  let tl = null;

  function buildTimeline() {
    const orb    = document.querySelector('.menu-orb');
    const links  = document.querySelectorAll('.orb-link');
    const footer = document.querySelector('.menu-orb-footer');
    if (!orb || typeof gsap === 'undefined') return null;

    if (tl) tl.kill();

    tl = gsap.timeline({ paused: true });

    // 1) Expand orb from bottom-left corner via clip-path
    tl.fromTo(orb,
      { clipPath: 'circle(0% at 0% 100%)' },
      {
        clipPath: 'circle(150% at 0% 100%)',
        duration: 0.7,
        ease: 'power3.inOut',
      }
    );

    // 2) Stagger nav links sliding up
    tl.fromTo(links,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        stagger: 0.075,
        ease: 'power2.out',
      },
      '-=0.35'
    );

    // 3) Footer (socials + close) fade in
    tl.fromTo(footer,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' },
      '-=0.2'
    );

    return tl;
  }

  function open() {
    if (isOpen) return;
    isOpen = true;

    document.body.classList.add('menu-open');
    document.body.style.overflow = 'hidden';

    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) hamburger.classList.add('active');

    // Make orb interactive before animating
    const orb = document.querySelector('.menu-orb');
    if (orb) orb.style.pointerEvents = 'all';

    const drawer = document.getElementById('menu-drawer');
    const overlay = document.getElementById('overlay-backdrop');
    if (!orb && drawer) {
      drawer.classList.add('open');
      overlay?.classList.add('open');
      return;
    }

    const t = buildTimeline();
    if (t) t.play();
    else if (orb) {
      document.getElementById('menu-sphere')?.classList.add('open');
      orb.style.clipPath = 'circle(150% at 0% 100%)';
      document.querySelectorAll('.orb-link').forEach(link => { link.style.opacity='1'; link.style.transform='none'; });
      const footer=document.querySelector('.menu-orb-footer');
      if (footer) { footer.style.opacity='1'; footer.style.transform='none'; }
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;

    document.body.classList.remove('menu-open');
    document.body.style.overflow = '';

    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) hamburger.classList.remove('active');

    const drawer = document.getElementById('menu-drawer');
    const overlay = document.getElementById('overlay-backdrop');
    if (!document.querySelector('.menu-orb') && drawer) {
      drawer.classList.remove('open');
      overlay?.classList.remove('open');
      return;
    }

    if (tl) {
      tl.reverse().then(() => {
        const orb = document.querySelector('.menu-orb');
        if (orb) orb.style.pointerEvents = 'none';
      });
    } else {
      document.getElementById('menu-sphere')?.classList.remove('open');
      const orb=document.querySelector('.menu-orb');
      if (orb) { orb.style.clipPath='circle(0% at 0% 100%)'; orb.style.pointerEvents='none'; }
    }
  }

  function toggle() {
    isOpen ? close() : open();
  }

  window.ntMenu = { open, close, toggle, isOpen: () => isOpen };

  document.addEventListener('DOMContentLoaded', () => {
    // Hamburger button
    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) hamburger.addEventListener('click', toggle);

    // Full-screen backdrop close
    const backdrop = document.getElementById('menu-sphere-close');
    if (backdrop) backdrop.addEventListener('click', close);

    // X button inside orb
    const orbClose = document.getElementById('orb-close-btn');
    if (orbClose) orbClose.addEventListener('click', close);

    document.getElementById('menu-close-btn')?.addEventListener('click', close);
    document.getElementById('overlay-backdrop')?.addEventListener('click', close);

    // Close on nav link click
    document.querySelectorAll('.orb-link').forEach(link => {
      link.addEventListener('click', close);
    });

    // ESC key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen) close();
    });
  });
})();
