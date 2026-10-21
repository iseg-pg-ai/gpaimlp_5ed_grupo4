// Mensagens públicas controladas; nunca apresentar exceções brutas do fornecedor.
const errors: Record<string, { status: number; message: string }> = {
  AGENT_INVALID_RESPONSE: {
    status: 422,
    message:
      "O modelo respondeu, mas a proposta não respeitou o formato permitido. Reformule o pedido. Nada foi alterado.",
  },
  AGENT_CONTEXT_TOO_LARGE: {
    status: 413,
    message: "O contexto desta viagem excede o limite do assistente. Nada foi alterado.",
  },
  AGENT_ACCESS_DENIED: {
    status: 503,
    message:
      "A AWS recusou o acesso ao modelo. É necessário verificar as permissões do serviço. Nada foi alterado.",
  },
  AGENT_TIMEOUT: {
    status: 504,
    message: "O serviço AWS demorou demasiado a responder. Tente novamente. Nada foi alterado.",
  },
  AGENT_BUSY: {
    status: 503,
    message:
      "O serviço AWS está temporariamente ocupado. Tente novamente dentro de instantes. Nada foi alterado.",
  },
  AGENT_CONNECTION_FAILED: {
    status: 503,
    message: "Não foi possível estabelecer ligação ao serviço AWS. Nada foi alterado.",
  },
  AGENT_CONFIGURATION_ERROR: {
    status: 503,
    message: "A configuração do modelo AWS não foi aceite pelo serviço. Nada foi alterado.",
  },
  AGENT_PROCESS_UNAVAILABLE: {
    status: 503,
    message:
      "O adaptador do assistente não conseguiu iniciar. É necessário verificar a instalação do serviço. Nada foi alterado.",
  },
  AGENT_INVALID_REQUEST: {
    status: 400,
    message: "O pedido enviado ao planeador é inválido. Nada foi alterado.",
  },
  AGENT_UNAVAILABLE: {
    status: 503,
    message:
      "Não foi possível obter uma proposta do serviço AWS. Tente novamente. Nada foi alterado.",
  },
};
export function agentFailure(code: string) {
  return Object.hasOwn(errors, code)
    ? { code, ...errors[code] }
    : {
        code: "DATASET_UNAVAILABLE",
        status: 503,
        message: "O catálogo ou o adaptador Python está indisponível. Nada foi alterado.",
      };
}
