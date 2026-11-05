import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "A palavra-passe atual é obrigatória."),
    newPassword: z.string().min(8, "A nova palavra-passe deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(1, "A confirmação da nova palavra-passe é obrigatória."),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "A confirmação da nova palavra-passe não coincide.",
    path: ["confirmPassword"],
});

export const POST = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Sessão não autorizada ou expirada." }, { status: 401 });
    }

    try {
        const body = await req.json();
        const parsed = changePasswordSchema.safeParse(body);

        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || "Dados inválidos.";
            return NextResponse.json({ error: firstError }, { status: 400 });
        }

        const { currentPassword, newPassword } = parsed.data;
        const userId = req.auth.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, password: true, mustChangePassword: true }
        });

        if (!user) {
            return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
        }

        // Verify current password
        const isCurrentMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentMatch) {
            return NextResponse.json({ error: "A palavra-passe atual introduzida está incorreta." }, { status: 400 });
        }

        // Prevent reusing same password
        const isSame = await bcrypt.compare(newPassword, user.password);
        if (isSame) {
            return NextResponse.json({ error: "A nova palavra-passe não pode ser igual à palavra-passe provisória." }, { status: 400 });
        }

        // Hash and update
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                mustChangePassword: false,
            }
        });

        return NextResponse.json({
            success: true,
            message: "Palavra-passe alterada com sucesso! A redirecionar para a plataforma..."
        });
    } catch (error) {
        console.error("Erro ao alterar palavra-passe:", error);
        return NextResponse.json({ error: "Ocorreu um erro interno ao atualizar a palavra-passe." }, { status: 500 });
    }
});
