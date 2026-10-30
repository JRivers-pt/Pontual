const FORMAT = 'suprema-pair-v1';
export function encodeFingerprintPair(template0, template1) {
    if (![template0, template1].every(value => typeof value === 'string' && value.length > 0 && value.length <= 65536)) {
        throw new Error('INVALID_FINGERPRINT_PAIR');
    }
    return JSON.stringify({ format: FORMAT, templateType: 0, template0, template1 });
}
export function decodeFingerprintPair(value) {
    let pair;
    try { pair = JSON.parse(value); } catch { throw new Error('FINGERPRINT_PAIR_REQUIRED'); }
    if (pair?.format !== FORMAT || pair.templateType !== 0) throw new Error('FINGERPRINT_PAIR_REQUIRED');
    encodeFingerprintPair(pair.template0, pair.template1);
    return { template0: pair.template0, template1: pair.template1, finger_mask: 'false' };
}
