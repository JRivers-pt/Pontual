// Script para testar endpoints da API CrossChex
// Verifica se há endpoints para schedules/shifts/employees

import crypto from 'crypto';

const API_URL = 'https://api.eu.crosschexcloud.com/api';
const API_KEY = process.env.CROSSCHEX_API_KEY || 'API-KEY-HERE';
const API_SECRET = process.env.CROSSCHEX_API_SECRET || 'API-SECRET-HERE';

interface ApiResponse {
    header: any;
    payload: any;
}

async function getAuthToken(): Promise<string> {
    const header = {
        nameSpace: "authorize.token",
        nameAction: "token",
        version: "1.0",
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString()
    };

    const payload = {
        api_key: API_KEY,
        api_secret: API_SECRET
    };

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ header, payload })
    });

    const data = await response.json();
    console.log('Auth Response:', JSON.stringify(data, null, 2));
    return data.payload?.token;
}

async function testEndpoint(token: string, namespace: string, action: string, extraPayload = {}) {
    const header = {
        nameSpace: namespace,
        nameAction: action,
        version: "1.0",
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString()
    };

    const payload = {
        token,
        ...extraPayload
    };

    console.log(`\n--- Testing ${namespace}.${action} ---`);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ header, payload })
        });

        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

async function main() {
    console.log('=== CrossChex API Endpoint Discovery ===\n');

    // Get auth token
    const token = await getAuthToken();
    if (!token) {
        console.error('Failed to get auth token');
        return;
    }
    console.log('Token obtained successfully\n');

    // Test organization/employee endpoints
    await testEndpoint(token, 'organization.employee', 'getlist', { page: 1, perPage: 50 });
    await testEndpoint(token, 'employee', 'getlist', { page: 1, perPage: 50 });
    await testEndpoint(token, 'person', 'getlist', { page: 1, perPage: 50 });

    // Test schedule endpoints
    await testEndpoint(token, 'attendance.schedule', 'getlist', { page: 1, perPage: 50 });
    await testEndpoint(token, 'schedule', 'getlist', { page: 1, perPage: 50 });
    await testEndpoint(token, 'shift', 'getlist', { page: 1, perPage: 50 });
    await testEndpoint(token, 'attendance.shift', 'getlist', { page: 1, perPage: 50 });

    // Test timetable endpoints
    await testEndpoint(token, 'attendance.timetable', 'getlist', { page: 1, perPage: 50 });
    await testEndpoint(token, 'timetable', 'getlist', { page: 1, perPage: 50 });

    // Test department/organization endpoints
    await testEndpoint(token, 'organization.department', 'getlist', { page: 1, perPage: 50 });
    await testEndpoint(token, 'department', 'getlist', { page: 1, perPage: 50 });

    console.log('\n=== Discovery Complete ===');
}

main().catch(console.error);
