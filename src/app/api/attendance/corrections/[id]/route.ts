import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
        }

        // Ensure user owns this correction record before deleting
        const record = await prisma.missedPunch.findFirst({
            where: {
                id,
                userId: session.user.id
            }
        });

        if (!record) {
            return NextResponse.json({ error: 'Record not found or not authorized' }, { status: 404 });
        }

        await prisma.missedPunch.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting correction:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete correction' },
            { status: 500 }
        );
    }
}
