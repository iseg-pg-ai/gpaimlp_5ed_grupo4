// Pré-visualização local: abre a página real da intranet (../intranet/index.html), sem copiar
// o menu nem o resto do HTML, e troca só a configuração da AWS pelos dados simulados.
// data-extra acrescenta configurações (por exemplo, a do backoffice) depois dos dados simulados.
(() => {
  const extra = (document.currentScript.dataset.extra || '').split(' ').filter(Boolean);
  const preview = new URL('.', document.currentScript.src).pathname;
  const scripts = ['mock-config.js', ...extra].map(file => `<script src="${preview}${file}"></script>`).join('');
  fetch('../intranet/index.html', { cache: 'no-store' })
    .then(response => response.text())
    .then(html => {
      const page = html
        .replace('<head>', '<head><base href="../intranet/" />')
        .replace('<script src="config.js"></script>', scripts);
      if (page === html || !page.includes('mock-config.js')) throw new Error('A página da intranet mudou: rever load.js.');
      document.open();
      document.write(page);
      document.close();
    })
    .catch(error => { document.body.textContent = error.message; });
})();
