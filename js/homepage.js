/* Homepage content controlled from the admin dashboard. */
(() => {
  'use strict';
  const defaults = {
    id:'homepage-content', announcement:'Only original products', heroTitle:'Welcome to exclusive luxury',
    heroSubtitle:'Curadoria Especializada', heroButton:'Vista o diferencial', heroLink:'/collections/',
    heroImage:'assets/images/banner.webp', galleryImage1:'assets/images/lifestyle-gallery-1.webp?v=20260909-2', galleryImage2:'assets/images/lifestyle-gallery-2.webp', galleryImage3:'assets/images/lifestyle-gallery-3.webp', galleryImage4:'assets/images/lifestyle-gallery-4.webp', galleryImage5:'assets/images/lifestyle-gallery-5.webp?v=20260909-2', galleryLink:'/collections/', sections:{ bestsellers:true, categories:true, instagram:true, lifestyle:true, lifestyleGallery:true, catalogRows:true, editorial:true, collection:true, purchase:true, faq:true },
    order:['bestsellers','categories','lifestyle','collection','catalogRows','editorial','purchase','faq','instagram'], layoutVersion:11
  };
  const selectors = { bestsellers:'.bestsellers-section', categories:'.catalog-category-section', instagram:'.instagram-section', lifestyle:'.lifestyle-section', lifestyleGallery:'.lifestyle-gallery', catalogRows:'#catalog-product-sections', editorial:'#editorial-showcase', collection:'#colecoes', purchase:'#clausula-de-compra', faq:'#faq' };
  function apply(config) {
    const data={...defaults,...config,sections:{...defaults.sections,...(config?.sections||{})}};
    if (!config?.heroLink) data.heroLink=defaults.heroLink;
    if (!config?.galleryLink) data.galleryLink=defaults.galleryLink;
    if (!config?.galleryImage1 || config.galleryImage1 === 'assets/images/lifestyle-gallery-1.webp') data.galleryImage1=defaults.galleryImage1;
    if (!config?.layoutVersion || config.layoutVersion < 11) data.order=[...defaults.order];
    const announcement=document.querySelector('.announcement-item'); if(announcement) announcement.textContent=data.announcement;
    const title=document.querySelector('.hero-quote-text'); if(title) title.textContent=data.heroTitle;
    const subtitle=document.querySelector('.hero-quote-sub'); if(subtitle) subtitle.textContent=data.heroSubtitle;
    const button=document.querySelector('.hero-quote-right .btn'); if(button){button.textContent=data.heroButton;button.href=data.heroLink||'/collections/';}
    const image=document.querySelector('.hero-static__img-wrap img'); if(image&&data.heroImage) image.src=data.heroImage;
    for(let index=1;index<=5;index+=1){const galleryImage=document.getElementById(`lifestyle-gallery-image-${index}`);if(galleryImage&&data[`galleryImage${index}`])galleryImage.src=data[`galleryImage${index}`];}
    document.querySelectorAll('[data-lifestyle-gallery-link]').forEach(link=>link.href=data.galleryLink||'/collections/');
    const first=document.querySelector('.bestsellers-section')||document.querySelector('.catalog-category-section');
    const parent=first?.parentNode;
    let cursor=first?.previousElementSibling;
    (data.order||defaults.order).forEach(key=>{const element=document.querySelector(selectors[key]);if(element&&parent){parent.insertBefore(element,cursor?cursor.nextSibling:parent.firstChild);cursor=element;}});
    Object.entries(selectors).forEach(([key,selector])=>{const element=document.querySelector(selector);if(element&&data.sections[key]===false) element.hidden=true;});
  }
  async function loadCategories() {
    const grid = document.querySelector('.catalog-category-section .how-grid');
    if (!grid) return;
    try {
      const res = await fetch('/api/categories.php', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !Array.isArray(data.categories) || !data.categories.length) return;
      const activeCats = data.categories.filter(c => c.active !== false);
      if (!activeCats.length) return;

      const defaultFolders = ['camisetas', 'shorts', 'calcados', 'hoodies'];
      grid.innerHTML = activeCats.map(cat => {
        const href = defaultFolders.includes(cat.id) ? `/collections/${cat.id}/` : `/collections/?categoria=${encodeURIComponent(cat.id)}`;
        const imgSrc = cat.image || 'assets/images/category-camisetas.webp';
        const name = cat.name || '';
        return `
          <a class="how-item" href="${href}" data-reveal>
            <span class="how-cover">
              <img src="${imgSrc}" alt="${name}" loading="lazy" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='assets/images/category-camisetas.webp'">
            </span>
            <h3 class="how-title">${name}</h3>
          </a>
        `;
      }).join('');
    } catch (e) {
      console.warn('Categorias dinâmicas indisponíveis:', e);
    }
  }
  async function load(){
    try{
      await window.ntDB?.init();
      apply(await window.ntDB?.settings.getById('homepage-content'));
    }catch(error){
      console.warn('Homepage settings unavailable:',error);
      apply(defaults);
    }
    loadCategories();
  }
  document.addEventListener('DOMContentLoaded',load);
  window.addEventListener('storage',event=>{if(event.key==='nte_settings')load();});
})();
