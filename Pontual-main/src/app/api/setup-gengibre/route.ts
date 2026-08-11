import { prisma } from "@/lib/db";

export async function GET() {
    try {
        // Find by username or company
        const existing = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: 'Gengibre' },
                    { company: { contains: 'Cozinha Criativa' } }
                ]
            }
        });

        if (!existing) {
            return Response.json({ success: false, error: "Utilizador Gengibre não encontrado." });
        }

        const user = await prisma.user.update({
            where: { id: existing.id },
            data: {
                vpEmail: 'gengibre@cozinhacriativa.pt',
                autoEmailReports: true,
                reportHeader: 'Pontual | Cozinha Criativa (Gengibre)'
            }
        });
        return Response.json({ success: true, message: "Gengibre configurada com sucesso!", email: user.vpEmail });
    } catch (e: any) {
        return Response.json({ success: false, error: e.message });
    }
}
