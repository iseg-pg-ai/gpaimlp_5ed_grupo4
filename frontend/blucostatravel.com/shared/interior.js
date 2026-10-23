(() => {
  const form = document.querySelector('[data-journey-form]');
  if (!form) return;
  const params = new URLSearchParams(location.search);
  const suggestedJourney = params.get('journeys') || params.get('journey');
  if (suggestedJourney && form.elements.places) form.elements.places.value = suggestedJourney;
  if (params.get('travelers') && form.elements.travelers) form.elements.travelers.value = params.get('travelers');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.form-status');
    const data = Object.fromEntries(new FormData(form));
    if (!data['cf-turnstile-response']) {
      if (status) status.textContent = 'Please complete the verification before sending your note.';
      return;
    }
    button.disabled = true;
    if (status) status.textContent = 'Sending your note…';
    try {
      const response = await fetch('/api/journey-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        if (response.status === 403) throw new Error('verification');
        throw new Error('Unable to send');
      }
      form.reset();
      if (window.turnstile) window.turnstile.reset();
      if (status) status.textContent = 'Thank you. Your note has been sent to Adriana, and a copy is on its way to your inbox.';
    } catch (error) {
      if (window.turnstile) window.turnstile.reset();
      if (status) status.textContent = error.message === 'verification'
        ? 'Verification expired or could not be completed. Please try again.'
        : 'We couldn’t send your note. Please try again, or email hello@blucostatravel.com.';
    } finally {
      button.disabled = false;
    }
  });
})();
