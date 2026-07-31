import { prisma } from "@/lib/db";
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { company: { contains: "Vontade" } },
                    { username: { contains: "vontade" } }
                ]
            }
        });

        if (users.length === 0) return Response.json({ error: "VE User not found" });

        const corrections = await prisma.missedPunch.findMany({
            where: { userId: users[0].id },
            orderBy: { checktime: 'desc' }
        });

        return Response.json({
            client: users[0].company,
            totalCorrections: corrections.length,
            corrections: corrections
        });
    } catch (e: any) {
        return Response.json({ error: e.message });
    }
}
