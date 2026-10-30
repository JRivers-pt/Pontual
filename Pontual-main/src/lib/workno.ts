export function normalizeWorkno(value: string | number) {
    const text = String(value).trim();
    return (/^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, "") : text).padStart(4, "0");
}
