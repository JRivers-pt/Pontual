import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Resend } from 'resend';

function generateTimestamp(): string {
    return new Date().toISOString().replace('Z', '+00:00');
}

function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export async function GET(request: NextRequest) {
    try {
        // Simple security header check for Vercel Cron
        const authHeader = request.headers.get('Authorization');
        const hasVercelCronSecret = process.env.CRON_SECRET !== undefined;
        if (hasVercelCronSecret && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all active clients
        const users = await prisma.user.findMany({
            where: {
                apiKey: { not: null },
                apiSecret: { not: null }
            }
        });

        console.log(`Cron: Checking devices status for ${users.length} users...`);

        const resendKey = process.env.RESEND_API_KEY;
        const resend = resendKey ? new Resend(resendKey) : null;
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

        const alertsSent: string[] = [];

        for (const user of users) {
            try {
                if (!user.apiKey || !user.apiSecret) continue;

                // 1. Get auth token
                const tokenRequestBody = {
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

                const tokenRes = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(tokenRequestBody)
                });

                if (!tokenRes.ok) {
                    console.error(`Cron: Auth failed for user ${user.username}`);
                    continue;
                }

                const tokenData = await tokenRes.json();
                const token = tokenData.payload?.token;

                if (!token) continue;

                // 2. Fetch last 7 days of records to check devices activity
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 7);

                const recordsRequestBody = {
                    header: {
                        nameSpace: 'attendance.record',
                        nameAction: 'getrecord',
                        version: '1.0',
                        requestId: generateRequestId(),
                        timestamp: generateTimestamp()
                    },
                    authorize: {
                        type: 'token',
                        token
                    },
                    payload: {
                        begin_time: startDate.toISOString().replace('Z', '+00:00'),
                        end_time: endDate.toISOString().replace('Z', '+00:00'),
                        order: 'desc',
                        page: 1,
                        per_page: 200
                    }
                };

                const recordsRes = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(recordsRequestBody)
                });

                if (!recordsRes.ok) {
                    console.error(`Cron: Records fetch failed for user ${user.username}`);
                    continue;
                }

                const recordsData = await recordsRes.json();
                const apiRecords = recordsData.payload?.list || [];

                // 3. Map devices and find lastSeen
                const devicesMap = new Map<string, { serialNumber: string; name: string; lastSeen: string }>();

                apiRecords.forEach((r: any) => {
                    if (!r.device || r.device.serial_number === 'MANUAL') return;
                    
                    const serial = r.device.serial_number;
                    const name = r.device.name || 'Equipamento';
                    const checktime = r.checktime.replace(/([+-]\d{2}:\d{2}|Z)$/, '');

                    const existing = devicesMap.get(serial);
                    if (!existing || new Date(checktime).getTime() > new Date(existing.lastSeen).getTime()) {
                        devicesMap.set(serial, {
                            serialNumber: serial,
                            name,
                            lastSeen: checktime
                        });
                    }
                });

                // 4. Identify offline devices (> 48 hours offline)
                const nowMs = Date.now();
                const offlineDevices = Array.from(devicesMap.values()).filter(dev => {
                    const lastSeenMs = new Date(dev.lastSeen).getTime();
                    const diffHours = (nowMs - lastSeenMs) / (1000 * 60 * 60);
                    return diffHours > 48; // 2 days offline
                });

                if (offlineDevices.length > 0) {
                    console.warn(`Cron: User ${user.username} has ${offlineDevices.length} offline devices!`);
                    
                    for (const dev of offlineDevices) {
                        const lastSeenDate = new Date(dev.lastSeen).toLocaleString('pt-PT');
                        const diffHours = Math.round((nowMs - new Date(dev.lastSeen).getTime()) / (1000 * 60 * 60));
                        const diffDays = Math.round(diffHours / 24);

                        const emailHtml = `
                            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
                                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                                    <div style="background-color: #ef4444; padding: 20px; text-align: center;">
                                        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">⚠️ Equipamento Offline Detetado</h2>
                                    </div>
                                    <div style="padding: 24px;">
                                        <p style="font-size: 15px; line-height: 1.5; margin-top: 0;">Olá,</p>
                                        <p style="font-size: 15px; line-height: 1.5;">O sistema de monitorização do <b>Pontual</b> detetou que um equipamento biométrico perdeu a ligação ou não envia registos para a cloud há mais de 48 horas.</p>
                                        
                                        <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
                                            <table style="width: 100%; border-collapse: collapse;">
                                                <tr>
                                                    <td style="padding: 6px 0; font-weight: 600; color: #475569; font-size: 14px;">Cliente:</td>
                                                    <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700;">${user.username}</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 6px 0; font-weight: 600; color: #475569; font-size: 14px;">Equipamento:</td>
                                                    <td style="padding: 6px 0; color: #0f172a; font-size: 14px;">${dev.name}</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 6px 0; font-weight: 600; color: #475569; font-size: 14px;">Nº de Série:</td>
                                                    <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-family: monospace;">${dev.serialNumber}</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 6px 0; font-weight: 600; color: #475569; font-size: 14px;">Última Atividade:</td>
                                                    <td style="padding: 6px 0; color: #ef4444; font-size: 14px; font-weight: 700;">${lastSeenDate}</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 6px 0; font-weight: 600; color: #475569; font-size: 14px;">Tempo Offline:</td>
                                                    <td style="padding: 6px 0; color: #ef4444; font-size: 14px; font-weight: 700;">cerca de ${diffHours} horas (~${diffDays} dias)</td>
                                                </tr>
                                            </table>
                                        </div>

                                        <p style="font-size: 14px; color: #475569; margin-bottom: 8px; font-weight: 600;">Passos Recomendados para Resolução:</p>
                                        <ul style="font-size: 14px; color: #475569; padding-left: 20px; line-height: 1.6; margin-top: 0;">
                                            <li>Verifique se o equipamento físico está ligado à corrente elétrica.</li>
                                            <li>Confirme se o cabo de rede ethernet está bem encaixado ou se a rede Wi-Fi do local está operacional.</li>
                                            <li>Verifique no visor do equipamento se o ícone de ligação à cloud (normalmente um globo ou sinal de cloud) está ativo.</li>
                                            <li>Reinicie o equipamento desligando e voltando a ligar o transformador da tomada.</li>
                                        </ul>

                                        <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
                                            Mensagem automática gerada pelo monitor de rede do Pontual. Não responda a este email.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;

                        if (resend) {
                            await resend.emails.send({
                                from: fromEmail,
                                to: 'comercial@techscire.pt',
                                subject: `⚠️ ALERTA: Equipamento Offline - ${dev.name} (${user.username})`,
                                html: emailHtml
                            });
                            alertsSent.push(`${user.username} - ${dev.name}`);
                        } else {
                            console.warn(`Resend API Key not configured. Alert email skipped for device ${dev.name}.`);
                        }
                    }
                }
            } catch (userError) {
                console.error(`Cron: Error processing user ${user.username}:`, userError);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Devices health check complete.`,
            alertsSent
        });
    } catch (error: any) {
        console.error('Error in devices health check cron:', error);
        return NextResponse.json(
            { error: error.message || 'Cron job failed' },
            { status: 500 }
        );
    }
}
