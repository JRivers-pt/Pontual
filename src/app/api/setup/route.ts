import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

// ONE-TIME SETUP ROUTE: Enable autoEmailReports for Gengibre
// DELETE THIS FILE after running once
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    // Basic protection
    if (secret !== "pontual-setup-2026") {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // List all users first
        const allUsers = await prisma.user.findMany({
            select: { id: true, username: true, company: true, vpEmail: true, autoEmailReports: true }
        });

        // Find Gengibre
        const gengibreUser = allUsers.find(u =>
            u.company?.toLowerCase().includes('cozinha criativa') ||
            u.company?.toLowerCase().includes('gengibre') ||
            u.username?.toLowerCase().includes('gengibre')
        );

        if (!gengibreUser) {
            return Response.json({
                error: "Gengibre user not found",
                allUsers: allUsers.map(u => ({ id: u.id, username: u.username, company: u.company }))
            }, { status: 404 });
        }

        // Update the user
        const updated = await prisma.user.update({
            where: { id: gengibreUser.id },
            data: {
                vpEmail: 'vasco@cozinhacriativa.pt',
                autoEmailReports: true,
            }
        });

        return Response.json({
            success: true,
            message: "Gengibre automated reports enabled!",
            user: {
                id: updated.id,
                username: updated.username,
                company: updated.company,
                vpEmail: updated.vpEmail,
                autoEmailReports: updated.autoEmailReports,
            },
            emailsWillBeSentTo: [
                "vasco@cozinhacriativa.pt",
                "comercial@techscire.pt"
            ]
        });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
