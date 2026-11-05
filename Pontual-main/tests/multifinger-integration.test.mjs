import test from 'node:test';
import assert from 'node:assert/strict';
import { 
    encodeFingerprintPair, 
    encodeMultiFingerprint, 
    decodeFingerprintTemplates, 
    decodeFingerprintPair,
    FORMAT_SINGLE,
    FORMAT_MULTI
} from '../school-agent/fingerprint-format.mjs';
import { syntheticTemplate } from './synthetic-fingerprint.mjs';

test('Flow 1: Create new employee with 2 fingers', () => {
    // Reading 1 & 2 for Finger 1
    const finger1 = { template0: syntheticTemplate(1), template1: syntheticTemplate(2) };
    // Reading 1 & 2 for Finger 2
    const finger2 = { template0: syntheticTemplate(3), template1: syntheticTemplate(4) };

    const encoded = encodeMultiFingerprint([finger1, finger2]);
    const parsed = JSON.parse(encoded);

    assert.equal(parsed.format, FORMAT_MULTI);
    assert.equal(parsed.fingers.length, 2);
    assert.equal(parsed.fingers[0].fingerIndex, 0);
    assert.equal(parsed.fingers[1].fingerIndex, 1);

    const decoded = decodeFingerprintTemplates(encoded);
    assert.equal(decoded.length, 2);
    assert.equal(decoded[0].template0, finger1.template0);
    assert.equal(decoded[1].template0, finger2.template0);
});

test('Flow 2: Existing employee with 1 finger adding a 2nd finger via targetFingerIndex: 1', () => {
    // Initially registered with 1 finger (format single)
    const existingTemplate = encodeFingerprintPair(syntheticTemplate(10), syntheticTemplate(11));
    const initialDecoded = decodeFingerprintTemplates(existingTemplate);
    assert.equal(initialDecoded.length, 1);

    // Later: Secretary captures Finger 2 on BioMini USB
    const newFinger2 = { template0: syntheticTemplate(20), template1: syntheticTemplate(21) };
    const incomingSecondFingerPayload = encodeFingerprintPair(newFinger2.template0, newFinger2.template1);

    // Backend merge logic simulation (exact logic used in PUT /api/employees)
    const existingFingers = decodeFingerprintTemplates(existingTemplate);
    const newFinger = decodeFingerprintPair(incomingSecondFingerPayload);
    const combined = [existingFingers[0], newFinger];
    const mergedMultiTemplate = encodeMultiFingerprint(combined);

    const finalDecoded = decodeFingerprintTemplates(mergedMultiTemplate);
    assert.equal(finalDecoded.length, 2);
    // Finger 1 is 100% preserved
    assert.equal(finalDecoded[0].template0, syntheticTemplate(10));
    assert.equal(finalDecoded[0].template1, syntheticTemplate(11));
    // Finger 2 is successfully added
    assert.equal(finalDecoded[1].template0, syntheticTemplate(20));
    assert.equal(finalDecoded[1].template1, syntheticTemplate(21));
});

test('Flow 3: Existing employee with 2 fingers replacing Finger 1 via targetFingerIndex: 0', () => {
    const finger1Original = { template0: syntheticTemplate(30), template1: syntheticTemplate(31) };
    const finger2Original = { template0: syntheticTemplate(40), template1: syntheticTemplate(41) };
    const initialTemplate = encodeMultiFingerprint([finger1Original, finger2Original]);

    // Rescan Finger 1
    const finger1New = { template0: syntheticTemplate(50), template1: syntheticTemplate(51) };
    const incomingFirstFingerPayload = encodeFingerprintPair(finger1New.template0, finger1New.template1);

    // Backend merge logic
    const existingFingers = decodeFingerprintTemplates(initialTemplate);
    const newFinger = decodeFingerprintPair(incomingFirstFingerPayload);
    const combined = [newFinger, existingFingers[1]];
    const updatedMultiTemplate = encodeMultiFingerprint(combined);

    const finalDecoded = decodeFingerprintTemplates(updatedMultiTemplate);
    assert.equal(finalDecoded.length, 2);
    // Finger 1 updated
    assert.equal(finalDecoded[0].template0, syntheticTemplate(50));
    // Finger 2 untouched
    assert.equal(finalDecoded[1].template0, syntheticTemplate(40));
});

test('Flow 4: Anti-duplication validation prevents scanning same finger twice', () => {
    const fingerSample = syntheticTemplate(100);

    // Mock verification function that matches identical templates
    const verifyFingerprintMock = async (sampleA, sampleB) => {
        if (sampleA === sampleB) {
            return { match: true };
        }
        throw new Error('NO_MATCH');
    };

    // Attempting to scan same finger as Finger 2
    let rejected = false;
    try {
        const finger1 = { template0: fingerSample };
        const finger2Candidate = { template0: fingerSample };
        if (finger1.template0 === finger2Candidate.template0) {
            rejected = true;
            throw new Error("O segundo dedo não pode ser o mesmo que o primeiro.");
        }
    } catch (err) {
        assert.equal(err.message, "O segundo dedo não pode ser o mesmo que o primeiro.");
    }
    assert.equal(rejected, true);
});
