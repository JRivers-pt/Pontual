import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const corrections = await prisma.missedPunch.findMany({
            where: { userId: session.user.id },
            orderBy: { checktime: 'desc' }
        });

        return NextResponse.json(corrections);
    } catch (error: any) {
        console.error('Error fetching corrections:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch corrections' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { workno, firstName, lastName, checktime, checktype, device } = body;

        // Basic validation
        if (!workno || !firstName || !lastName || !checktime || checktype === undefined) {
            return NextResponse.json(
                { error: 'Missed parameters. workno, firstName, lastName, checktime, checktype are required.' },
                { status: 400 }
            );
        }

        // Create the record
        const correction = await prisma.missedPunch.create({
            data: {
                workno: String(workno),
                firstName: String(firstName),
                lastName: String(lastName),
                checktime: new Date(checktime),
                checktype: Number(checktype),
                device: device ? String(device) : 'Manual',
                userId: session.user.id
            }
        });

        return NextResponse.json(correction);
    } catch (error: any) {
        console.error('Error creating correction:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create correction' },
            { status: 500 }
        );
    }
}
