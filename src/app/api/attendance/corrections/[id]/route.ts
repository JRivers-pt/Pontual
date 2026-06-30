import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const correctionId = params.id;

        // Check if the record exists and belongs to the user
        const correction = await prisma.missedPunch.findUnique({
            where: { id: correctionId }
        });

        if (!correction) {
            return NextResponse.json({ error: 'Correction not found' }, { status: 404 });
        }

        if (correction.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Delete the record
        await prisma.missedPunch.delete({
            where: { id: correctionId }
        });

        return NextResponse.json({ success: true, message: 'Correction deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting correction:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete correction' },
            { status: 500 }
        );
    }
}
