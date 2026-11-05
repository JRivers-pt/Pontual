import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "A palavra-passe atual é obrigatória."),
    newPassword: z.string().min(8, "A nova palavra-passe deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(1, "A confirmação da nova palavra-passe é obrigatória."),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "A confirmação da nova palavra-passe não coincide.",
    path: ["confirmPassword"],
});

test('changePasswordSchema validation rules', () => {
    // Missing fields
    assert.equal(changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'Password123', confirmPassword: 'Password123' }).success, false);
    
    // Too short (< 8 chars)
    assert.equal(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'short', confirmPassword: 'short' }).success, false);
    
    // Mismatch
    assert.equal(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'Password123', confirmPassword: 'Password456' }).success, false);
    
    // Valid
    const valid = changePasswordSchema.safeParse({ currentPassword: 'CMB2026', newPassword: 'SegurancaNova2026!', confirmPassword: 'SegurancaNova2026!' });
    assert.equal(valid.success, true);
});

test('password verification and hash update simulation', async () => {
    const genericPassword = 'CMB2026';
    const initialHash = await bcrypt.hash(genericPassword, 8);

    const userInDb = {
        id: 'cmtt7wi6v0001ujmgcm4ajoki',
        username: 'CMB1',
        password: initialHash,
        mustChangePassword: true,
    };

    // 1. Wrong current password fails
    const isCurrentMatchWrong = await bcrypt.compare('WrongPassword', userInDb.password);
    assert.equal(isCurrentMatchWrong, false);

    // 2. Right current password succeeds
    const isCurrentMatchRight = await bcrypt.compare(genericPassword, userInDb.password);
    assert.equal(isCurrentMatchRight, true);

    // 3. New password cannot be same as generic password
    const newPasswordCandidate = 'CMB2026';
    const isSame = await bcrypt.compare(newPasswordCandidate, userInDb.password);
    assert.equal(isSame, true, 'Should detect that new password is same as old password');

    // 4. Update to new personal password
    const validNewPassword = 'MeuLoginSeguro#2026';
    const newHashed = await bcrypt.hash(validNewPassword, 10);
    userInDb.password = newHashed;
    userInDb.mustChangePassword = false;

    // Verify user is now unlocked and can log in with new password
    assert.equal(userInDb.mustChangePassword, false);
    assert.equal(await bcrypt.compare(validNewPassword, userInDb.password), true);
    assert.equal(await bcrypt.compare(genericPassword, userInDb.password), false);
});

test('route protection rule for first login', () => {
    function getRedirectRoute(isLoggedIn, mustChangePassword, pathname) {
        const isOnLogin = pathname === '/login';
        const isOnPasswordChange = pathname === '/change-password';

        if (!isLoggedIn) {
            return '/login';
        }

        if (mustChangePassword) {
            if (!isOnPasswordChange) {
                return '/change-password';
            }
            return null; // Allowed to stay on /change-password
        }

        if (!mustChangePassword && isOnPasswordChange) {
            return '/'; // Already has personal password, redirect away from /change-password
        }

        if (isOnLogin) {
            return '/';
        }

        return null; // Allowed
    }

    // Unauthenticated user attempting to access dashboard -> redirect to /login
    assert.equal(getRedirectRoute(false, false, '/'), '/login');
    assert.equal(getRedirectRoute(false, true, '/reports'), '/login');

    // Secondary user on first login with mustChangePassword = true
    assert.equal(getRedirectRoute(true, true, '/'), '/change-password');
    assert.equal(getRedirectRoute(true, true, '/reports'), '/change-password');
    assert.equal(getRedirectRoute(true, true, '/employees'), '/change-password');
    assert.equal(getRedirectRoute(true, true, '/change-password'), null); // Stays on change password

    // Normal user or CMB Master with mustChangePassword = false
    assert.equal(getRedirectRoute(true, false, '/'), null); // Allowed to view dashboard
    assert.equal(getRedirectRoute(true, false, '/reports'), null);
    assert.equal(getRedirectRoute(true, false, '/change-password'), '/'); // Redirected to dashboard
});
