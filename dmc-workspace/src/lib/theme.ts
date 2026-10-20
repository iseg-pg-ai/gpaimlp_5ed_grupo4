export const themeStorageKey = "blu-portal-theme";

// Executar antes da primeira pintura evita um clarão claro na preferência escura.
export const themeInitScript = `try{document.documentElement.dataset.theme=localStorage.getItem("${themeStorageKey}")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}`;
