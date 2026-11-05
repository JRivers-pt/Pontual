"use client";

import * as React from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { 
    KeyRound, 
    ShieldAlert, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    Eye, 
    EyeOff, 
    LogOut,
    Lock,
    ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ChangePasswordPage() {
    const { data: session, status, update } = useSession();
    const router = useRouter();

    const [currentPassword, setCurrentPassword] = React.useState("");
    const [newPassword, setNewPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [showPasswords, setShowPasswords] = React.useState(false);

    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

    // If session is authenticated and user does NOT need to change password, redirect to dashboard
    React.useEffect(() => {
        if (status === "authenticated" && !(session?.user as any)?.mustChangePassword) {
            router.push("/");
        }
    }, [status, session, router]);

    const username = (session?.user as any)?.username || session?.user?.name || "Utilizador";
    const userDisplayName = session?.user?.name || username;

    const hasMinLength = newPassword.length >= 8;
    const hasLetterAndNumber = /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
    const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
    const isDifferent = newPassword.length > 0 && currentPassword.length > 0 && newPassword !== currentPassword;

    const canSubmit = hasMinLength && passwordsMatch && currentPassword.length > 0 && !isLoading;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!currentPassword) {
            setError("Por favor, introduza a sua palavra-passe provisória atual.");
            return;
        }

        if (!hasMinLength) {
            setError("A nova palavra-passe tem de ter pelo menos 8 caracteres.");
            return;
        }

        if (!passwordsMatch) {
            setError("A confirmação da nova palavra-passe não coincide.");
            return;
        }

        if (currentPassword === newPassword) {
            setError("A nova palavra-passe deve ser diferente da palavra-passe provisória.");
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch("/api/user/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmPassword,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Ocorreu um erro ao atualizar a palavra-passe.");
                setIsLoading(false);
                return;
            }

            setSuccessMessage("Palavra-passe pessoal definida com sucesso! A entrar no sistema...");

            // Update client session token
            if (update) {
                await update({ mustChangePassword: false });
            }

            // Redirect smoothly to dashboard
            setTimeout(() => {
                router.push("/");
                router.refresh();
            }, 1000);
        } catch (err) {
            setError("Erro de comunicação com o servidor. Verifique a ligação à internet.");
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex flex-col justify-between items-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 relative overflow-hidden selection:bg-blue-600 selection:text-white">
            {/* Ambient Background Glows */}
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-gradient-to-b from-blue-400/20 via-indigo-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-t from-blue-600/15 via-cyan-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

            {/* Header / Brand */}
            <header className="w-full max-w-md pt-4 sm:pt-6 flex justify-center z-10">
                <a
                    href="https://iflow.pt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all text-[11px] text-slate-600 dark:text-slate-300 backdrop-blur-md"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Plataforma Pontualidade Cloud</span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors flex items-center gap-0.5">
                        by iFlow.pt
                        <ExternalLink className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                    </span>
                </a>
            </header>

            {/* Main Form Container */}
            <main className="w-full max-w-md my-auto py-6 z-10">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800/90 shadow-xl shadow-slate-200/50 dark:shadow-none p-6 sm:p-8 backdrop-blur-sm">
                    {/* Badge and Title */}
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/40 mb-3 shadow-xs">
                            <KeyRound className="h-6 w-6" />
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                            Definir Palavra-passe Pessoal
                        </h1>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                            Primeiro acesso com credenciais provisórias
                        </p>
                    </div>

                    {/* Account Info Pill */}
                    <div className="mb-6 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                            <div>
                                <span className="text-slate-500 dark:text-slate-400">Conta: </span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">{username}</span>
                            </div>
                        </div>
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate max-w-[170px]">
                            {userDisplayName !== username ? userDisplayName : "Colégio Manuel Bernardes"}
                        </span>
                    </div>

                    {/* Notice */}
                    <div className="mb-5 p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex gap-2.5 items-start text-xs text-amber-800 dark:text-amber-300">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Por razões de segurança e conformidade RGPD, é obrigatório substituir a palavra-passe genérica por uma palavra-passe pessoal antes de aceder ao sistema.
                        </span>
                    </div>

                    {/* Error Alert */}
                    {error && (
                        <div className="mb-5 p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2.5 text-xs text-red-700 dark:text-red-400 animate-in fade-in duration-200">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Success Alert */}
                    {successMessage && (
                        <div className="mb-5 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-400 animate-in fade-in duration-200">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Current generic password */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex justify-between items-center">
                                <span>Palavra-passe Atual (Provisória)</span>
                            </label>
                            <div className="relative">
                                <Input
                                    type={showPasswords ? "text" : "password"}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Ex: CMB2026"
                                    required
                                    className="h-11 rounded-xl pr-10 text-sm bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords(!showPasswords)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    tabIndex={-1}
                                >
                                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* New personal password */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Nova Palavra-passe Pessoal
                            </label>
                            <Input
                                type={showPasswords ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Mínimo de 8 caracteres"
                                required
                                className="h-11 rounded-xl text-sm bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 transition-all"
                            />
                        </div>

                        {/* Confirm new password */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Confirmar Nova Palavra-passe
                            </label>
                            <Input
                                type={showPasswords ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Repita a nova palavra-passe"
                                required
                                className="h-11 rounded-xl text-sm bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 transition-all"
                            />
                        </div>

                        {/* Password Requirements Checklist */}
                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-[11px] space-y-1.5">
                            <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-400 dark:text-slate-500"}`}>
                                <CheckCircle2 className={`w-3.5 h-3.5 ${hasMinLength ? "opacity-100" : "opacity-40"}`} />
                                <span>Pelo menos 8 caracteres</span>
                            </div>
                            <div className={`flex items-center gap-1.5 ${hasLetterAndNumber ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-400 dark:text-slate-500"}`}>
                                <CheckCircle2 className={`w-3.5 h-3.5 ${hasLetterAndNumber ? "opacity-100" : "opacity-40"}`} />
                                <span>Combinação de letras e algarismos</span>
                            </div>
                            <div className={`flex items-center gap-1.5 ${passwordsMatch ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-400 dark:text-slate-500"}`}>
                                <CheckCircle2 className={`w-3.5 h-3.5 ${passwordsMatch ? "opacity-100" : "opacity-40"}`} />
                                <span>As duas palavras-passe coincidem</span>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={!canSubmit}
                            className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold shadow-md shadow-blue-500/20 transition-all text-sm mt-2 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    A guardar palavra-passe...
                                </>
                            ) : (
                                "Guardar Palavra-passe e Aceder"
                            )}
                        </Button>
                    </form>

                    {/* Sign out link */}
                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                        <button
                            type="button"
                            onClick={() => signOut({ callbackUrl: "/login" })}
                            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Sair e terminar sessão</span>
                        </button>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="w-full max-w-md pb-4 text-center z-10 text-[11px] text-slate-400 dark:text-slate-500">
                <p>© {new Date().getFullYear()} Pontualidade Cloud • Todos os direitos reservados</p>
            </footer>
        </div>
    );
}
