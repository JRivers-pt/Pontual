// Deterministic transport fixture only. These bytes are NOT a valid biometric template.
export function syntheticTemplate(seed = 1, size = 384) {
    const bytes = Buffer.alloc(size);
    for (let i = 0; i < size; i++) bytes[i] = (i + seed) % 256;
    return bytes.toString('base64');
}
