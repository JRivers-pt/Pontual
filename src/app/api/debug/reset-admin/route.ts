import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('secret') !== 'pontualidade2026') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const hashedPassword = await bcrypt.hash('admin123', 8);
        const admin = await prisma.user.upsert({
            where: { username: 'admin' },
            update: { password: hashedPassword, role: 'ADMIN' },
            create: { username: 'admin', email: 'admin@pontualidade.pt', name: 'System Admin', password: hashedPassword, role: 'ADMIN' }
        });
        return NextResponse.json({ success: true, message: 'Admin account reset successful.', credentials: { username: admin.username, password: 'admin123' } });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
