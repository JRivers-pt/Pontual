const FORMAT = 'suprema-pair-v1';
export const USB_SUPREMA_TEMPLATE_TYPE = 2001;
// Suprema's BioMini -> access-control enrollment example uses 384 bytes per sample.
// https://kb.supremainc.com/knowledge/doku.php?id=en:how_to_enroll_fingerprint_on_biomini_via_biostar_2_api
// This rejects malformed/truncated transport data; it does not validate biometric minutiae.
export function validateSupremaTemplate(value) {
    if (typeof value !== 'string' || value.length > 65536 || value.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('INVALID_FINGERPRINT_TEMPLATE');
    let decoded;
    try { decoded = atob(value); } catch { throw new Error('INVALID_FINGERPRINT_TEMPLATE'); }
    if (decoded.length < 384 || btoa(decoded) !== value) throw new Error('INVALID_FINGERPRINT_TEMPLATE');
    return value;
}
export function encodeFingerprintPair(template0, template1) {
    if (![template0, template1].every(value => typeof value === 'string' && value.length > 0 && value.length <= 65536)) {
        throw new Error('INVALID_FINGERPRINT_PAIR');
    }
    validateSupremaTemplate(template0);
    validateSupremaTemplate(template1);
    return JSON.stringify({ format: FORMAT, templateType: USB_SUPREMA_TEMPLATE_TYPE, template0, template1 });
}
export function decodeFingerprintPair(value) {
    let pair;
    try { pair = JSON.parse(value); } catch { throw new Error('FINGERPRINT_PAIR_REQUIRED'); }
    if (pair?.format !== FORMAT || pair.templateType !== USB_SUPREMA_TEMPLATE_TYPE) throw new Error('FINGERPRINT_PAIR_REQUIRED');
    encodeFingerprintPair(pair.template0, pair.template1);
    return { template0: pair.template0, template1: pair.template1, finger_mask: 'false' };
}
