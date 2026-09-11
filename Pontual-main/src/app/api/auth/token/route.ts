import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

function generateTimestamp(): string {
    return new Date().toISOString().replace('Z', '+00:00');
}

function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // If user uses Suprema, SyncToken, local DB, or has no CrossChex credentials
        if (user.biometricProvider === 'SUPREMA' || user.syncToken || !!user.parentUserId || !user.apiKey || !user.apiSecret) {
            return NextResponse.json({
                token: 'internal_session_token',
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
        }

        const requestBody = {
            header: {
                nameSpace: 'authorize.token',
                nameAction: 'token',
                version: '1.0',
                requestId: generateRequestId(),
                timestamp: generateTimestamp()
            },
            payload: {
                api_key: user.apiKey,
                api_secret: user.apiSecret
            }
        };

        const response = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.payload?.token) {
            return NextResponse.json({
                token: data.payload.token,
                expires: data.payload.expires
            });
        }

        throw new Error('No token in response');
    } catch (error: any) {
        console.error('Error getting auth token:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to authenticate' },
            { status: 500 }
        );
    }
}
