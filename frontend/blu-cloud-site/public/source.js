// Interações do site, incluindo navegação responsiva e estados do formulário de subscrição.
const button=document.querySelector('.menu');
const nav=document.querySelector('#nav');
button?.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));nav.classList.toggle('open',!open)});
nav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');button?.setAttribute('aria-expanded','false')}));
const differences=[...document.querySelectorAll('.difference details')];
const syncDifferences=()=>differences.forEach(item=>{item.open=window.innerWidth>620});
syncDifferences();
window.addEventListener('resize',syncDifferences,{passive:true});
const newsletter=document.querySelector('.newsletter-form');
if(newsletter){
  const status=newsletter.querySelector('.form-status');
  const submitButton=newsletter.querySelector('button[type="submit"]');
  const responseFrame=newsletter.closest('.newsletter-shell')?.querySelector('.newsletter-target');
  let submitted=false;
  let completed=false;
  const showNewsletterConfirmation=()=>{
    if(!submitted||completed)return;
    completed=true;
    if(status)status.textContent='Almost there. Check your inbox to confirm your subscription.';
    if(submitButton){submitButton.disabled=false;submitButton.textContent='Subscribe ↗'}
    newsletter.reset();
  };
  newsletter.addEventListener('submit',()=>{
    if(!newsletter.checkValidity())return;
    submitted=true;
    completed=false;
    if(status)status.textContent='Sending…';
    if(submitButton){submitButton.disabled=true;submitButton.textContent='Sending…'}
    window.setTimeout(showNewsletterConfirmation,5000);
  });
  responseFrame?.addEventListener('load',showNewsletterConfirmation);
}

const header=document.querySelector('.hero-nav');
let previousScroll=window.scrollY;
window.addEventListener('scroll',()=>{
  const current=Math.max(0,window.scrollY);
  const scrollingUp=current<previousScroll;
  header?.classList.toggle('nav-solid',current>48);
  if(scrollingUp) header?.classList.remove('nav-hidden');
  else header?.classList.toggle('nav-hidden',current>previousScroll&&current>160);
  previousScroll=current;
},{passive:true});

const topButton=document.querySelector('.float-top');
const updateTopButton=()=>topButton?.classList.toggle('is-visible',window.scrollY>360);
topButton?.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
window.addEventListener('scroll',updateTopButton,{passive:true});
updateTopButton();

// Keep Pinterest Save available on travel photography while excluding
// identity, accreditation and payment artwork from image discovery.
document.querySelectorAll('.wordmark img,.footer-logo img,.trust-row img,.payment-marks img').forEach(image=>image.setAttribute('data-pin-nopin','true'));
document.querySelectorAll('main img:not([data-pin-nopin])').forEach(image=>{
  if(!image.hasAttribute('data-pin-description')) image.setAttribute('data-pin-description',`${image.alt} — BLU Costa Travel Curation`);
});
