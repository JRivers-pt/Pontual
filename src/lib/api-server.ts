export function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function generateTimestamp(): string {
    return new Date().toISOString().replace('Z', '+00:00');
}

/**
 * Converte erros da API CrossChex numa mensagem clara em português.
 */
export function crossChexErrorToPortuguese(status: number, data?: any): string {
    // Evitar detalhes sensíveis em produção
    const code = data?.code;
    const err = data?.error;
    const desc = data?.description;

    if (status === 401 || status === 403 || code === 401) {
        return "Credenciais CrossChex inválidas. Verifica a API Key e o API Secret no separador CrossChex Cloud.";
    }
    if (status === 429) {
        return "Limite de pedidos da API CrossChex excedido. Tenta novamente dentro de instantes.";
    }
    if (status >= 500) {
        return "O serviço CrossChex está temporariamente indisponível. Tenta novamente mais tarde.";
    }
    if (typeof err === "string" && err) {
        return `Erro CrossChex: ${err}`;
    }
    if (typeof desc === "string" && desc) {
        return `Erro CrossChex: ${desc}`;
    }
    return "Erro ao contactar a API CrossChex. Verifica a ligação e as credenciais.";
}

export async function getCrossChexToken(apiKey: string, apiSecret: string, apiUrl: string = 'https://api.eu.crosschexcloud.com/') {
    const requestBody = {
        header: {
            nameSpace: 'authorize.token',
            nameAction: 'token',
            version: '1.0',
            requestId: generateRequestId(),
            timestamp: generateTimestamp()
        },
        payload: {
            api_key: apiKey,
            api_secret: apiSecret
        }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data?.payload?.token) {
        return data.payload.token;
    }

    throw new Error(crossChexErrorToPortuguese(response.status, data));
}
