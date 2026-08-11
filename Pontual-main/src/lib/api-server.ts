export function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function generateTimestamp(): string {
    return new Date().toISOString().replace('Z', '+00:00');
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

    if (!response.ok) {
        throw new Error(`CrossChex Auth HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.payload?.token) {
        return data.payload.token;
    }
    throw new Error('No token in CrossChex response');
}
