const messages = {
  PYTHON_UNAVAILABLE:
    "Python da tradução indisponível. Crie o ambiente .venv na raiz do projeto ou configure BLU_TRANSLATION_PYTHON e reinicie o portal.",
  TRANSLATION_DEPENDENCIES_MISSING:
    "Faltam bibliotecas da tradução local. No Python usado pelo portal, execute: python -m pip install -r translations/requirements.txt (na raiz do projeto).",
  TRANSLATION_MODELS_MISSING:
    "Faltam modelos de tradução. No Python usado pelo portal, execute: python translations/setup_models.py (na raiz do projeto). A instalação inicial requer internet.",
  TRANSLATION_TIMEOUT:
    "A tradução excedeu o tempo disponível. Tente novamente; o roteiro guardado foi preservado.",
  TRANSLATION_FAILED:
    "A tradução local falhou. Consulte o terminal do servidor para o diagnóstico; o roteiro guardado foi preservado.",
} as const;
export type TranslationErrorCode = keyof typeof messages;
export class TranslationError extends Error {
  code: TranslationErrorCode;
  constructor(code: string) {
    const known = Object.hasOwn(messages, code)
      ? (code as TranslationErrorCode)
      : "TRANSLATION_FAILED";
    super(messages[known]);
    this.code = known;
  }
}
