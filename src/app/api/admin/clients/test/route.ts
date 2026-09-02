import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCrossChexToken } from "@/lib/api-server";

export const POST = auth(async (req) => {
    if (!req.auth || (req.auth.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { apiKey, apiSecret, apiUrl } = body;

        if (!apiKey || !apiSecret) {
            return NextResponse.json(
                { error: "Preenche a API Key e o API Secret para testar a ligação." },
                { status: 400 }
            );
        }

        const url = apiUrl || "https://api.eu.crosschexcloud.com/";

        const token = await getCrossChexToken(apiKey, apiSecret, url);

        return NextResponse.json({
            ok: true,
            message: "Ligação à CrossChex Cloud efetuada com sucesso. As credenciais estão válidas.",
            tokenPrefix: token.substring(0, 12) + "...",
        });
    } catch (error: any) {
        const message = error?.message
            ? String(error.message)
            : "Não foi possível ligar à CrossChex Cloud. Verifica as credenciais e o URL da API.";
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
});