import './clear-demo.js';
import {landingPage,landingFooter} from './landing.js';
const paths={users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9',heart:'M3 12h4l3-7 4 14 3-7h4',file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',arrow:'M5 12h14 M13 6l6 6-6 6',clock:'M12 8v5l3 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',check:'M5 12l4 4L19 6',shield:'M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7z M8 12l3 3 5-6'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.file}"/></svg>`;
document.querySelector('#app').innerHTML=`<a class="skip-link" href="#main-content">Đến nội dung chính</a><header class="site-header landing-header"><a class="site-brand" href="#gioi-thieu"><span class="logo-plus">✚</span><span><strong>VinSHC</strong><small>HỒ SƠ KHÁM NGOẠI TRÚ</small></span></a><nav aria-label="Giới thiệu VinSHC">${[['gioi-thieu','Trang chủ'],['ve-vinshc','Về VinSHC'],['tinh-nang','Tính năng'],['quy-trinh','Quy trình']].map(([id,label])=>`<a href="#${id}">${label}</a>`).join('')}</nav><div class="header-controls"><a class="primary" href="/connected.html">Đăng nhập phòng khám ${icon('arrow')}</a></div></header><main class="public-main"><div id="main-content" class="content landing-content" tabindex="-1">${landingPage(icon)}</div></main>${landingFooter()}`;
document.querySelectorAll('[data-workspace]').forEach(button=>button.onclick=()=>{window.location.href='/connected.html';});
if('IntersectionObserver' in window&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}},{threshold:0.08,rootMargin:'0px 0px -16px 0px'});
 for(const element of document.querySelectorAll('[data-reveal]')){
  if(element.getBoundingClientRect().top<window.innerHeight-16)continue;
  const siblings=[...element.parentElement.children].filter(e=>e.hasAttribute('data-reveal'));
  element.classList.add('scroll-reveal');element.style.setProperty('--reveal-delay',`${Math.min(siblings.indexOf(element),5)*80}ms`);
  element.addEventListener('focusin',()=>{element.classList.add('is-revealed');observer.unobserve(element);},{once:true});observer.observe(element);
 }
}
