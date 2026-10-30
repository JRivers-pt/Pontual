export type Scanner = { url: string; name: string };

export async function findUsbScanner(): Promise<Scanner> {
    let agentResponded = false;
    // Also support installations with HTTP/HTTPS ports reversed.
    for (const url of ["http://localhost:8082", "http://localhost:8081", "https://localhost:8081", "https://localhost:8082"]) {
        try {
            const response = await fetch(`${url}/api/devices`, { signal: AbortSignal.timeout(1800), cache: "no-store" });
            if (!response.ok) continue;
            const data = await response.json();
            agentResponded = true;
            const device = Array.isArray(data.Devices) && data.Devices.find((d: { fingerprint?: unknown; name?: string }) =>
                d.fingerprint === true || d.fingerprint === "true" || /biomini/i.test(d.name || ""));
            if (device) return { url, name: device.name || "BioMini" };
        } catch { /* Try the next supported local endpoint. */ }
    }
    throw new Error(agentResponded
        ? "O agente USB responde, mas não deteta o leitor. Verifique o cabo USB e o driver Suprema."
        : "O browser não consegue aceder ao USB Agent. Abra o agente neste PC e verifique as portas HTTP/HTTPS e a permissão de acesso à rede local do site.");
}

export async function captureUsbFingerprint(scanner: Scanner) {
    // Match the installed BioStar UI: ScanBiomini uses a GET with query parameters.
    const query = new URLSearchParams({ template_type: "0", enroll_quality: "80", hide_popup: "true", timestamp: String(Date.now()) });
    const response = await fetch(`${scanner.url}/api/ScanBiomini?${query}`, {
        method: "GET", cache: "no-store",
        signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`O agente USB respondeu com erro HTTP ${response.status}.`);
    const data = await response.json();
    if (typeof data.template !== "string" || !data.template.trim()) {
        throw new Error(`O agente respondeu sem capturar uma impressão digital (código ${data.retcode ?? "não indicado"}). Mantenha o dedo no leitor e tente novamente.`);
    }
    return { template: data.template, quality: typeof data.score === "number" ? data.score : null,
        image: typeof data.image?.data === "string" ? `data:image/jpeg;base64,${data.image.data}` : null };
}

export async function verifyUsbFingerprintPair(scanner: Scanner, template0: string, template1: string) {
    // Native USB Agent expects form-encoded fields, not a JSON document.
    const response = await fetch(`${scanner.url}/api/Verify`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ template1: template0, template2: template1, template_type: "0", timestamp: String(Date.now()) }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`O agente não conseguiu verificar as leituras (HTTP ${response.status}).`);
    const result = await response.json();
    if (String(result.retcode) !== "1") throw new Error("As duas leituras não foram confirmadas como sendo do mesmo dedo. Reinicie a captura e tente novamente.");
}
