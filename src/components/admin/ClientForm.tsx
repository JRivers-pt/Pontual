"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2, PlugZap } from "lucide-react";
import Link from "next/link";

interface ClientFormProps {
    clientId?: string;
}

export function ClientForm({ clientId }: ClientFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(!!clientId);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        username: "",
        password: "",
        email: "",
        name: "",
        company: "",
        apiKey: "",
        apiSecret: "",
        apiUrl: "https://api.eu.crosschexcloud.com/",
        reportHeader: "",
        logoUrl: "",
        vpEmail: "",
        autoEmailReports: false,
        overtimeTolerance: "",
        subtractTolerance: false,
        mealBreakMinutes: "",
        mealBreakThresholdHours: "",
        exemptIds: "",
        overtimeCapHours: "",
    });

    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (clientId) {
            fetchClient();
        }
    }, [clientId]);

    const fetchClient = async () => {
        try {
            const response = await fetch(`/api/admin/clients/${clientId}`);
            if (!response.ok) throw new Error("Falha ao carregar cliente");
            const data = await response.json();
            setFormData({
                username: data.username,
                password: "", // Don't load password
                email: data.email || "",
                name: data.name || "",
                company: data.company || "",
                apiKey: data.apiKey || "",
                apiSecret: data.apiSecret || "",
                apiUrl: data.apiUrl || "https://api.eu.crosschexcloud.com/",
                reportHeader: data.reportHeader || "",
                logoUrl: data.logoUrl || "",
                vpEmail: data.vpEmail || "",
                autoEmailReports: !!data.autoEmailReports,
                overtimeTolerance: data.overtimeTolerance?.toString() || "",
                subtractTolerance: !!data.subtractTolerance,
                mealBreakMinutes: data.mealBreakMinutes?.toString() || "",
                mealBreakThresholdHours: data.mealBreakThresholdHours?.toString() || "",
                exemptIds: data.exemptIds || "",
                overtimeCapHours: data.overtimeCapHours?.toString() || "",
            });
        } catch (err) {
            setError("Erro ao carregar dados do cliente");
            console.error(err);
        } finally {
            setIsFetching(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleTestConnection = async () => {
        setTestResult(null);
        if (!formData.apiKey || !formData.apiSecret) {
            setTestResult({ ok: false, message: "Preenche a API Key e o API Secret para testar a ligação." });
            return;
        }
        setIsTesting(true);
        try {
            const response = await fetch("/api/admin/clients/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    apiKey: formData.apiKey,
                    apiSecret: formData.apiSecret,
                    apiUrl: formData.apiUrl,
                }),
            });
            const data = await response.json();
            if (response.ok && data.ok) {
                setTestResult({ ok: true, message: data.message });
            } else {
                setTestResult({ ok: false, message: data.error || "Não foi possível testar a ligação." });
            }
        } catch (err: any) {
            setTestResult({ ok: false, message: err.message || "Não foi possível testar a ligação." });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const method = clientId ? "PATCH" : "POST";
        const url = clientId ? `/api/admin/clients/${clientId}` : "/api/admin/clients";

        const payload = {
            ...formData,
            overtimeTolerance: formData.overtimeTolerance !== "" ? Number(formData.overtimeTolerance) : null,
            mealBreakMinutes: formData.mealBreakMinutes !== "" ? Number(formData.mealBreakMinutes) : null,
            mealBreakThresholdHours: formData.mealBreakThresholdHours !== "" ? Number(formData.mealBreakThresholdHours) : null,
            overtimeCapHours: formData.overtimeCapHours !== "" ? Number(formData.overtimeCapHours) : null,
        };

        try {
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Erro ao guardar cliente");
            }

            router.push("/admin/clients");
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isFetching) {
        return <div className="p-8 text-center text-neutral-500">A carregar dados...</div>;
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/clients">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <h2 className="text-2xl font-bold">{clientId ? "Editar Cliente" : "Novo Cliente"}</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Dados de Acesso</CardTitle>
                    <CardDescription>Credenciais de login para a plataforma Pontual.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                required
                                placeholder="ex: jsmith"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">{clientId ? "Nova Password (opcional)" : "Password"}</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                value={formData.password}
                                onChange={handleChange}
                                required={!clientId}
                                placeholder="********"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email (opcional)</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="cliente@email.com"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Informação da Empresa</CardTitle>
                    <CardDescription>Detalhes de exibição do cliente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome do Gestor / Responsável</Label>
                        <Input
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Nome Completo"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="company">Nome da Empresa</Label>
                        <Input
                            id="company"
                            name="company"
                            value={formData.company}
                            onChange={handleChange}
                            placeholder="Empresa Lda"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="border-blue-100 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        Credenciais CrossChex Cloud
                    </CardTitle>
                    <CardDescription>Necessário para sincronizar dados de assiduidade.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="apiKey">API Key (CloudId)</Label>
                        <Input
                            id="apiKey"
                            name="apiKey"
                            value={formData.apiKey}
                            onChange={handleChange}
                            placeholder="CrossChex API Key"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="apiSecret">API Secret</Label>
                        <Input
                            id="apiSecret"
                            name="apiSecret"
                            value={formData.apiSecret}
                            onChange={handleChange}
                            placeholder="CrossChex API Secret"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="apiUrl">API URL</Label>
                        <Input
                            id="apiUrl"
                            name="apiUrl"
                            value={formData.apiUrl}
                            onChange={handleChange}
                            placeholder="https://api.eu.crosschexcloud.com/"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleTestConnection}
                            disabled={isTesting}
                        >
                            {isTesting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    A testar...
                                </>
                            ) : (
                                <>
                                    <PlugZap className="mr-2 h-4 w-4" />
                                    Testar Ligação
                                </>
                            )}
                        </Button>
                        {testResult && (
                            <span
                                className={`text-sm ${testResult.ok
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                    }`}
                            >
                                {testResult.message}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Configurações de Relatórios</CardTitle>
                    <CardDescription>Personalização de cabeçalhos e automação de envio.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="reportHeader">Cabeçalho Personalizado (PDF)</Label>
                        <Input
                            id="reportHeader"
                            name="reportHeader"
                            value={formData.reportHeader}
                            onChange={handleChange}
                            placeholder="ex: Nome da Empresa | Departamento"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="logoUrl">URL do Logotipo (opcional)</Label>
                        <Input
                            id="logoUrl"
                            name="logoUrl"
                            value={formData.logoUrl}
                            onChange={handleChange}
                            placeholder="ex: /logos/gengibre-logo.jpg ou https://..."
                        />
                    </div>
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="autoEmailReports"
                                name="autoEmailReports"
                                checked={formData.autoEmailReports}
                                onChange={(e) => setFormData(prev => ({ ...prev, autoEmailReports: e.target.checked }))}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <Label htmlFor="autoEmailReports" className="cursor-pointer text-sm font-medium">
                                Ativar envio automático mensal por email
                            </Label>
                        </div>
                        
                        {formData.autoEmailReports && (
                            <div className="space-y-2 pl-6 animate-in fade-in slide-in-from-left-2 duration-300">
                                <Label htmlFor="vpEmail">Email do VP / Responsável</Label>
                                <Input
                                    id="vpEmail"
                                    name="vpEmail"
                                    type="email"
                                    value={formData.vpEmail}
                                    onChange={handleChange}
                                    placeholder="vp@empresa.com"
                                    required={formData.autoEmailReports}
                                />
                                <p className="text-[10px] text-neutral-500">
                                    O relatório será enviado automaticamente no primeiro dia de cada mês.
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Regras de Cálculo (opcional)</CardTitle>
                    <CardDescription>
                        Deixar em branco para usar as regras detectadas pelo nome da empresa ou o padrão.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="overtimeTolerance">Tolerância H. Extra (min)</Label>
                            <Input
                                id="overtimeTolerance"
                                name="overtimeTolerance"
                                type="number"
                                min="0"
                                value={formData.overtimeTolerance}
                                onChange={handleChange}
                                placeholder="ex: 10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mealBreakMinutes">Pausa de Refeição (min)</Label>
                            <Input
                                id="mealBreakMinutes"
                                name="mealBreakMinutes"
                                type="number"
                                min="0"
                                value={formData.mealBreakMinutes}
                                onChange={handleChange}
                                placeholder="ex: 60"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mealBreakThresholdHours">Limiar p/ pausa (h)</Label>
                            <Input
                                id="mealBreakThresholdHours"
                                name="mealBreakThresholdHours"
                                type="number"
                                min="0"
                                value={formData.mealBreakThresholdHours}
                                onChange={handleChange}
                                placeholder="ex: 6"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="overtimeCapHours">Limite Normal (h/dia)</Label>
                            <Input
                                id="overtimeCapHours"
                                name="overtimeCapHours"
                                type="number"
                                min="1"
                                value={formData.overtimeCapHours}
                                onChange={handleChange}
                                placeholder="ex: 8"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="exemptIds">IDs Isentos (vírgulas)</Label>
                            <Input
                                id="exemptIds"
                                name="exemptIds"
                                value={formData.exemptIds}
                                onChange={handleChange}
                                placeholder="ex: 11, 18"
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 pt-2">
                        <input
                            type="checkbox"
                            id="subtractTolerance"
                            name="subtractTolerance"
                            checked={formData.subtractTolerance}
                            onChange={(e) => setFormData(prev => ({ ...prev, subtractTolerance: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Label htmlFor="subtractTolerance" className="cursor-pointer text-sm font-medium">
                            Subtrair a tolerância ao total de horas extra
                        </Label>
                    </div>
                </CardContent>
            </Card>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                    {error}
                </div>
            )}

            <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" asChild disabled={isLoading}>
                    <Link href="/admin/clients">Cancelar</Link>
                </Button>
                <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            A guardar...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" />
                            Guardar Cliente
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}
