export function remoteIdentityMap(bindings: { remoteUserId: string | null; workno: string }[]) {
    const result = new Map<string, string>();
    for (const binding of bindings) {
        if (!binding.remoteUserId) continue;
        const key = binding.remoteUserId.replace(/^0+/, "") || "0";
        const existing = result.get(key);
        if (existing && existing !== binding.workno) throw new Error("Conflicting remote identity mapping");
        result.set(key, binding.workno);
    }
    return result;
}
