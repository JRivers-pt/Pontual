"use client"

import * as React from "react"
import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Loader2, Clock, ShieldCheck, ArrowRight, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const formSchema = z.object({
    username: z.string().min(1, {
        message: "Nome de utilizador é obrigatório.",
    }),
    password: z.string().min(1, {
        message: "Password é obrigatória.",
    }),
})

export default function LoginPage() {
    const { status } = useSession()
    const router = useRouter()
    const [isLoading, setIsLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (status === "authenticated") {
            router.push("/")
            router.refresh()
        }
    }, [status, router])

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            username: "",
            password: "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true)
        setError(null)

        try {
            const result = await signIn("credentials", {
                username: values.username,
                password: values.password,
                redirect: false,
            })

            if (result?.error) {
                setError("Credenciais inválidas. Verifique o utilizador e a password.")
                setIsLoading(false)
                return
            }

            router.push("/")
            router.refresh()
        } catch (error) {
            setError("Ocorreu um erro ao autenticar. Tente novamente.")
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col justify-between items-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 relative overflow-hidden selection:bg-blue-600 selection:text-white">
            {/* Ambient Background Glows */}
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-gradient-to-b from-blue-400/15 via-cyan-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-t from-blue-600/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

            {/* Top Brand Pill */}
            <header className="w-full max-w-md pt-4 sm:pt-8 flex justify-center z-10">
                <a
                    href="https://iflow.pt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all text-[11px] text-slate-600 dark:text-slate-300 backdrop-blur-md"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Plataforma Cloud</span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors flex items-center gap-0.5">
                        by iFlow.pt
                        <ExternalLink className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                    </span>
                </a>
            </header>

            {/* Login Card */}
            <main className="w-full max-w-md my-auto py-6 z-10">
                <div className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-2xl dark:shadow-black/50 p-7 sm:p-9 space-y-6">
                    
                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 text-white shadow-lg shadow-blue-600/25 ring-4 ring-blue-50 dark:ring-blue-950/50">
                            <Clock className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                                Pontualidade
                            </h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                                Gestão Inteligente de Assiduidade & Ponto Cloud
                            </p>
                        </div>
                    </div>

                    {/* Form */}
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="username"
                                render={({ field }) => (
                                    <FormItem className="space-y-1.5">
                                        <FormLabel className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            Nome de Utilizador
                                        </FormLabel>
                                        <FormControl>
                                            <Input 
                                                placeholder="ex: utilizador" 
                                                {...field}
                                                className="h-11 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 focus-visible:ring-2 focus-visible:ring-blue-600 text-sm transition-all"
                                                autoComplete="username"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-[11px]" />
                                    </FormItem>
                                )}
                            />
                            
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem className="space-y-1.5">
                                        <FormLabel className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            Palavra-passe
                                        </FormLabel>
                                        <FormControl>
                                            <Input 
                                                type="password" 
                                                placeholder="••••••••" 
                                                {...field}
                                                className="h-11 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 focus-visible:ring-2 focus-visible:ring-blue-600 text-sm transition-all"
                                                autoComplete="current-password"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-[11px]" />
                                    </FormItem>
                                )}
                            />

                            {error && (
                                <div className="p-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl font-medium flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <Button 
                                type="submit" 
                                className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-sm shadow-md shadow-blue-600/20 transition-all cursor-pointer group"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        A autenticar...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-1.5 w-full">
                                        <span>Entrar no Portal</span>
                                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </span>
                                )}
                            </Button>
                        </form>
                    </Form>

                    {/* Security Badge */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-400">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Sessão encriptada e protegida</span>
                    </div>
                </div>
            </main>

            {/* Bottom Footer Credits */}
            <footer className="w-full max-w-md pb-4 sm:pb-6 text-center text-xs text-slate-400 dark:text-slate-400 space-y-1 z-10">
                <div>
                    <span>Desenvolvido &amp; Suportado por </span>
                    <a 
                        href="https://iflow.pt" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="font-bold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-400 transition-colors inline-flex items-center gap-0.5"
                    >
                        <span>iFlow.pt</span>
                    </a>
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">
                    Pontualidade SaaS Cloud • v2.4
                </div>
            </footer>
        </div>
    )
}
