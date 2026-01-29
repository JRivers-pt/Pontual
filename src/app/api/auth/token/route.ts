import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_CROSSCHEX_API_URL || 'https://api.eu.crosschexcloud.com/';
const API_KEY = process.env.CROSSCHEX_API_KEY;
const API_SECRET = process.env.CROSSCHEX_API_SECRET;

function generateTimestamp(): string {
    return new Date().toISOString().replace('Z', '+00:00');
}

function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export async function POST(request: NextRequest) {
    try {
        const requestBody = {
            header: {
                nameSpace: 'authorize.token',
                nameAction: 'token',
                version: '1.0',
                requestId: generateRequestId(),
                timestamp: generateTimestamp()
            },
            payload: {
                api_key: API_KEY,
                api_secret: API_SECRET
            }
        };

        const response = await fetch(API_URL, {
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
