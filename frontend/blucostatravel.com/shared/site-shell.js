(() => {
  const navItems = [
    ['explore', 'Explore Portugal', '/explore-portugal/'],
    ['private', 'Private Travel', '/how-we-work/'],
    ['house', 'The BLU House', '/who-we-are/'],
    ['journal', 'The BLU Journal', '/journal/'],
    ['store', 'Store', '/store/']
  ];

  const instagramIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="icon-dot" cx="17.4" cy="6.7" r="1.1"/></svg>';
  const whatsappIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.7A8.5 8.5 0 1 1 20.5 11.7Z"/><path d="M8.1 7.6c.2-.4.4-.4.7-.4h.4c.1 0 .3 0 .4.3l1 2.3c.1.2.1.4 0 .6l-.7.9c-.1.1-.2.3 0 .6.5 1 1.3 1.8 2.3 2.4.3.2.5.2.7 0l.9-1.1c.2-.2.4-.2.6-.1l2.1 1c.3.1.4.2.4.4 0 .2-.1 1.3-.6 1.8-.5.6-1.3.9-2.1.8-1-.1-2.7-.7-4.6-2.4-2.3-2-3.1-4.1-3.2-5.1 0-.8.2-1.5.7-2Z"/></svg>';

  document.querySelectorAll('[data-site-header]').forEach(header => {
    const active = header.dataset.active || '';
    header.innerHTML = `
      <a class="wordmark" href="/" aria-label="BLU Costa home"><img src="/assets/blu-logo-transparent.png" alt="BLU Costa — Travel Curation"></a>
      <nav id="nav">${navItems.map(([key, label, href]) => `<a ${active === key ? 'class="current" aria-current="page"' : ''} href="${href}">${label}</a>`).join('')}<a class="nav-cta ${active === 'plan' ? 'current' : ''}" href="/plan-your-journey/">Plan Your Journey ↗</a></nav>
      <div class="social-links" aria-label="Contact BLU Costa">
        <a href="https://instagram.com/blucostatravel" target="_blank" rel="noreferrer" aria-label="Instagram @blucostatravel">${instagramIcon}</a>
        <a href="mailto:hello@blucostatravel.com" aria-label="Email">✉</a>
        <a href="tel:+351915784212" aria-label="Phone">☎</a>
        <a href="https://wa.me/351915784212" target="_blank" rel="noreferrer" aria-label="WhatsApp">${whatsappIcon}</a>
      </div>
      <button class="menu" aria-label="Open navigation" aria-expanded="false" aria-controls="nav"><span></span><span></span></button>`;
  });

  document.querySelectorAll('[data-site-footer]').forEach(footer => {
    footer.innerHTML = `
      <div class="footer-signup">
        <div><p class="footer-eyebrow">Letters from Portugal</p><h2>A considered note,<br>from time to time.</h2><p>From time to time, I’ll share the places, people, moments and journeys in Portugal that stay with me.</p></div>
        <div class="newsletter-shell">
          <form class="newsletter-form" action="https://assets.mailerlite.com/jsonp/2559636/forms/199412143250999007/subscribe" method="post" target="mailerlite-submission">
            <div class="newsletter-field"><input id="newsletter-email" name="fields[email]" type="email" required autocomplete="email" placeholder="Your email address" aria-label="Email address"><button type="submit">Subscribe ↗</button></div>
            <p class="newsletter-privacy">You can unsubscribe whenever you wish. Our <a href="/privacy-policy/">Privacy Policy</a> explains how we care for your details.</p>
            <label class="newsletter-consent"><input type="checkbox" required><span>Yes, send me your Letters from Portugal.</span></label>
            <input type="hidden" name="ml-submit" value="1"><input type="hidden" name="anticsrf" value="true">
            <small class="form-status" aria-live="polite"></small>
          </form>
          <iframe class="newsletter-target" name="mailerlite-submission" title="Newsletter subscription response" tabindex="-1"></iframe>
        </div>
      </div>
      <div class="footer-main">
        <div class="portfolio-download"><a class="footer-logo" href="/"><img src="/assets/blu-logo-transparent.png" alt="BLU Costa — Travel Curation"></a><p class="footer-title">View the BLU Portfolio</p><a class="portfolio-cover" href="/assets/blu-journey-portfolio-2026.pdf?v=20260923-original" target="_blank" rel="noopener noreferrer" aria-label="Open The Journey Portfolio by BLU Costa in a new tab"><img src="/assets/portfolio-cover.png" alt="The Journey Portfolio by BLU Costa — 2026 Edition"></a></div>
        <div class="footer-column contact-column"><p class="footer-title">Contact</p><address>Av. dos Cavaleiros 25<br>2790-046 Carnaxide<br>Lisboa · Portugal</address><a href="tel:+351915784212">+351 91 578 4212</a><a href="mailto:hello@blucostatravel.com">hello@blucostatravel.com</a><p class="footer-title footer-company-title">Company</p><a href="/who-we-are/">About us</a><a href="mailto:hello@blucostatravel.com?subject=Careers%20at%20BLU%20Costa">Careers</a><a href="/plan-your-journey/">Contact us</a><a class="footer-blog" href="/journal/">The BLU Journal</a></div>
        <div class="footer-column"><p class="footer-title">Explore</p><strong>Lisbon &amp; Central Portugal</strong><a href="/explore-portugal/#lisbon">Lisbon</a><a href="/explore-portugal/#sintra">Sintra &amp; Cascais</a><a href="/explore-portugal/#central">Fátima · Óbidos · Tomar</a><strong>South</strong><a href="/explore-portugal/#alentejo">Arrábida &amp; Alentejo</a><a href="/explore-portugal/#between">Algarve &amp; routes south</a></div>
        <div class="footer-column"><p class="footer-title">Explore</p><strong>Porto &amp; North</strong><a href="/explore-portugal/#porto">Porto</a><a href="/explore-portugal/#porto">Douro</a><a href="/explore-portugal/#porto">Guimarães &amp; Braga</a><strong>Private travel</strong><a href="/how-we-work/">How we work</a><a href="/plan-your-journey/">Plan your journey</a></div>
        <div class="footer-column legal-column"><p class="footer-title">Policies &amp; legal</p><a href="/legal/#booking">Booking Terms and Conditions</a><a href="/terms-of-use/">Terms of Use</a><a href="/cookie-preferences/">Cookie Preferences</a><a href="/privacy-policy/">Privacy Policy</a><a href="/data-processing/">Data Processing</a><a href="/email-opt-out/">Email Opt-out</a></div>
      </div>
      <div class="footer-bottom"><span class="registration">Portugal-based · Registered tourism operator</span><div class="payment-marks" aria-label="Accepted payment methods"><span class="payment-label">We accept</span><img src="/assets/payment-visa.png" alt="Visa"><img src="/assets/payment-mastercard.png" alt="Mastercard"><img src="/assets/payment-amex.png" alt="American Express"><img src="/assets/payment-maestro.png" alt="Maestro"><img src="/assets/payment-diners.png" alt="Diners Club"></div><small>© ${new Date().getFullYear()} BLU Costa Travel Curation</small></div>`;
  });

  if (!document.querySelector('.floating-tools')) {
    const floatingTools = document.createElement('div');
    floatingTools.className = 'floating-tools';
    floatingTools.innerHTML = `
      <a class="float-whatsapp" href="https://wa.me/351915784212" target="_blank" rel="noopener noreferrer" aria-label="Chat with BLU Costa on WhatsApp">${whatsappIcon}</a>
      <button class="float-top" type="button" aria-label="Back to top">↑</button>`;
    document.body.append(floatingTools);
  }

  const topButton = document.querySelector('.float-top');
  const updateTopButton = () => topButton?.classList.toggle('is-visible', window.scrollY > 360);
  topButton?.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));
  window.addEventListener('scroll', updateTopButton, {passive: true});
  updateTopButton();

  document.querySelectorAll('.menu').forEach(button => {
    const nav = button.closest('header')?.querySelector('nav');
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      nav?.classList.toggle('open', !open);
    });
    nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    }));
  });

  // Keep navigation available the instant a visitor changes direction upward.
  const headers = [...document.querySelectorAll('[data-site-header]')];
  if (headers.length) {
    let lastScroll = Math.max(0, window.scrollY);
    const updateHeaders = () => {
      const current = Math.max(0, window.scrollY);
      const scrollingUp = current < lastScroll;
      headers.forEach(header => {
        header.classList.toggle('nav-solid', current > 48);
        if (scrollingUp) header.classList.remove('nav-hidden');
        else header.classList.toggle('nav-hidden', current > lastScroll && current > 160);
      });
      lastScroll = current;
    };
    window.addEventListener('scroll', updateHeaders, {passive: true});
    updateHeaders();
  }

  const consentKey = 'blu_cookie_consent_v1';
  const consentVersion = '1.0';
  let consentReturnFocus = null;

  const readConsent = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(consentKey));
      return saved?.version === consentVersion ? saved : null;
    } catch {
      return null;
    }
  };

  const consentRoot = document.createElement('div');
  consentRoot.className = 'cookie-consent-root';
  consentRoot.innerHTML = `
    <section class="cookie-consent-banner" aria-labelledby="cookie-banner-title" aria-describedby="cookie-banner-copy" hidden>
      <div class="cookie-banner-copy">
        <p class="cookie-consent-kicker">A small note</p>
        <h2 id="cookie-banner-title">Cookies, not Pastéis de Nata.</h2>
        <p id="cookie-banner-copy">Essential cookies keep BLU working. Optional cookies stay off unless you choose them.</p>
        <a href="/cookie-preferences/">Cookie details</a>
      </div>
      <div class="cookie-consent-actions">
        <button type="button" class="cookie-action secondary" data-consent-manage>Choose options</button>
        <button type="button" class="cookie-action secondary" data-consent-reject>Essentials only</button>
        <button type="button" class="cookie-action primary" data-consent-accept>Accept optional cookies</button>
      </div>
    </section>
    <div class="cookie-modal-backdrop" hidden>
      <section class="cookie-preference-modal" role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title" aria-describedby="cookie-modal-copy">
        <button type="button" class="cookie-modal-close" aria-label="Close cookie preferences">×</button>
        <p class="cookie-consent-kicker">Cookie choices</p>
        <h2 id="cookie-modal-title">Make it yours.</h2>
        <p id="cookie-modal-copy">The essential bits are always on. Choose any optional cookies you would like to allow.</p>
        <div class="cookie-choice-list">
          <label class="cookie-choice is-required">
            <span><strong>Strictly necessary</strong><small>Website delivery, security and storage of this choice.</small></span>
            <input type="checkbox" checked disabled><span class="cookie-toggle" aria-hidden="true"></span><em>Always active</em>
          </label>
          <label class="cookie-choice">
            <span><strong>Analytics</strong><small>Would help us understand website performance. No analytics service is currently connected.</small></span>
            <input type="checkbox" data-consent-category="analytics"><span class="cookie-toggle" aria-hidden="true"></span>
          </label>
          <label class="cookie-choice">
            <span><strong>Preferences &amp; functionality</strong><small>Would remember optional choices or enable optional features. None are currently connected.</small></span>
            <input type="checkbox" data-consent-category="preferences"><span class="cookie-toggle" aria-hidden="true"></span>
          </label>
          <label class="cookie-choice">
            <span><strong>Marketing &amp; profiling</strong><small>Would support advertising or personalised marketing. No marketing service is currently connected.</small></span>
            <input type="checkbox" data-consent-category="marketing"><span class="cookie-toggle" aria-hidden="true"></span>
          </label>
        </div>
        <div class="cookie-modal-actions">
          <button type="button" class="cookie-action primary" data-consent-reject>Reject all</button>
          <button type="button" class="cookie-action secondary" data-consent-save>Save preferences</button>
          <button type="button" class="cookie-action primary" data-consent-accept>Accept all</button>
        </div>
      </section>
    </div>`;
  document.body.append(consentRoot);

  const consentBanner = consentRoot.querySelector('.cookie-consent-banner');
  const consentBackdrop = consentRoot.querySelector('.cookie-modal-backdrop');
  const consentModal = consentRoot.querySelector('.cookie-preference-modal');
  const categoryInputs = [...consentRoot.querySelectorAll('[data-consent-category]')];

  const setCategoryInputs = consent => {
    categoryInputs.forEach(input => {
      input.checked = Boolean(consent?.[input.dataset.consentCategory]);
    });
  };

  const closePreferences = ({restoreBanner = false} = {}) => {
    consentBackdrop.hidden = true;
    document.body.classList.remove('cookie-modal-open');
    if (restoreBanner && !readConsent()) consentBanner.hidden = false;
    consentReturnFocus?.focus?.();
    consentReturnFocus = null;
  };

  const openPreferences = trigger => {
    consentReturnFocus = trigger || document.activeElement;
    setCategoryInputs(readConsent());
    consentBanner.hidden = true;
    consentBackdrop.hidden = false;
    document.body.classList.add('cookie-modal-open');
    consentModal.querySelector('.cookie-modal-close')?.focus();
  };

  const saveConsent = preferences => {
    const consent = {
      version: consentVersion,
      necessary: true,
      analytics: Boolean(preferences.analytics),
      preferences: Boolean(preferences.preferences),
      marketing: Boolean(preferences.marketing),
      updatedAt: new Date().toISOString()
    };
    try { localStorage.setItem(consentKey, JSON.stringify(consent)); } catch {}
    consentBanner.hidden = true;
    closePreferences();
    document.dispatchEvent(new CustomEvent('blu:consent', {detail: consent}));
  };

  consentRoot.querySelectorAll('[data-consent-accept]').forEach(button => button.addEventListener('click', () => {
    saveConsent({analytics: true, preferences: true, marketing: true});
  }));
  consentRoot.querySelectorAll('[data-consent-reject]').forEach(button => button.addEventListener('click', () => {
    saveConsent({analytics: false, preferences: false, marketing: false});
  }));
  consentRoot.querySelector('[data-consent-save]')?.addEventListener('click', () => {
    saveConsent(Object.fromEntries(categoryInputs.map(input => [input.dataset.consentCategory, input.checked])));
  });
  consentRoot.querySelector('[data-consent-manage]')?.addEventListener('click', event => openPreferences(event.currentTarget));
  consentRoot.querySelector('.cookie-modal-close')?.addEventListener('click', () => closePreferences({restoreBanner: true}));
  consentBackdrop.addEventListener('click', event => {
    if (event.target === consentBackdrop) closePreferences({restoreBanner: true});
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !consentBackdrop.hidden) closePreferences({restoreBanner: true});
  });
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-cookie-settings]');
    if (!trigger) return;
    event.preventDefault();
    openPreferences(trigger);
  });

  if (!readConsent()) consentBanner.hidden = false;

  document.querySelectorAll('.newsletter-form').forEach(form => {
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type="submit"]');
    const frame = form.closest('.newsletter-shell')?.querySelector('.newsletter-target');
    let submitted = false;
    let completed = false;

    const showConfirmation = () => {
      if (!submitted || completed) return;
      completed = true;
      if (status) status.textContent = 'Almost there. Check your inbox to confirm your subscription.';
      if (button) {
        button.disabled = false;
        button.textContent = 'Subscribe ↗';
      }
      form.reset();
    };

    form.addEventListener('submit', () => {
      if (!form.checkValidity()) return;
      submitted = true;
      completed = false;
      if (status) status.textContent = 'Sending…';
      if (button) {
        button.disabled = true;
        button.textContent = 'Sending…';
      }
      window.setTimeout(showConfirmation, 5000);
    });
    frame?.addEventListener('load', showConfirmation);
  });
})();
