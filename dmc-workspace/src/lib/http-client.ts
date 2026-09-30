/** Read API errors consistently, including responses that are not JSON. */
export async function responseJson<T>(response: Response): Promise<T> {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("O servidor devolveu uma resposta inválida. Tente novamente.");
  }
  if (!response.ok)
    throw new Error(typeof data?.error === "string" ? data.error : "Pedido falhou.");
  return data as T;
}
