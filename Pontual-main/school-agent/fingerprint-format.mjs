export const FORMAT_SINGLE = 'suprema-pair-v1';
export const FORMAT_MULTI = 'suprema-multifinger-v1';
const FORMAT = FORMAT_SINGLE;
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
    return JSON.stringify({ format: FORMAT_SINGLE, templateType: USB_SUPREMA_TEMPLATE_TYPE, template0, template1 });
}

export function encodeMultiFingerprint(fingers) {
    if (!Array.isArray(fingers) || fingers.length === 0 || fingers.length > 2) {
        throw new Error('INVALID_FINGERPRINT_COUNT');
    }
    const validated = fingers.map((f, idx) => {
        if (!f || typeof f !== 'object') throw new Error('INVALID_FINGERPRINT_PAIR');
        validateSupremaTemplate(f.template0);
        validateSupremaTemplate(f.template1);
        return { fingerIndex: idx, template0: f.template0, template1: f.template1 };
    });
    if (validated.length === 1) {
        return JSON.stringify({
            format: FORMAT_SINGLE,
            templateType: USB_SUPREMA_TEMPLATE_TYPE,
            template0: validated[0].template0,
            template1: validated[0].template1
        });
    }
    return JSON.stringify({
        format: FORMAT_MULTI,
        templateType: USB_SUPREMA_TEMPLATE_TYPE,
        fingers: validated
    });
}

export function decodeFingerprintTemplates(value) {
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new Error('FINGERPRINT_PAIR_REQUIRED'); }
    if (parsed?.templateType !== USB_SUPREMA_TEMPLATE_TYPE) throw new Error('FINGERPRINT_PAIR_REQUIRED');

    if (parsed?.format === FORMAT_SINGLE) {
        validateSupremaTemplate(parsed.template0);
        validateSupremaTemplate(parsed.template1);
        return [{ template0: parsed.template0, template1: parsed.template1, finger_mask: 'false' }];
    }

    if (parsed?.format === FORMAT_MULTI && Array.isArray(parsed?.fingers) && parsed.fingers.length > 0 && parsed.fingers.length <= 2) {
        return parsed.fingers.map((f) => {
            validateSupremaTemplate(f.template0);
            validateSupremaTemplate(f.template1);
            return { template0: f.template0, template1: f.template1, finger_mask: 'false' };
        });
    }

    throw new Error('FINGERPRINT_PAIR_REQUIRED');
}

export function decodeFingerprintPair(value) {
    const list = decodeFingerprintTemplates(value);
    return list[0];
}
