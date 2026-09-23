import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const veUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: { equals: 'VE', mode: 'insensitive' } },
                    { company: { contains: 'Vontade e Empenho', mode: 'insensitive' } }
                ]
            }
        });

        if (!veUser) {
            return NextResponse.json({ success: false, error: "Utilizador VE não encontrado." }, { status: 404 });
        }

        // 1. Atualizar definições de relatório
        await prisma.user.update({
            where: { id: veUser.id },
            data: {
                reportHeader: 'Pontual | Vontade e Empenho',
                biometricProvider: 'ANVIZ'
            }
        });

        // 2. Colaboradores oficiais da VE
        const veRoster = [
            { workno: "1", name: "José Vaz" },
            { workno: "3", name: "Isabel Vaz" },
            { workno: "4", name: "Cláudia Fernandes" },
            { workno: "5", name: "Humberto Silva" },
            { workno: "6", name: "Duarte Pestana" },
            { workno: "7", name: "Cristiana Machado" },
            { workno: "8", name: "Mauro Baião" },
            { workno: "9", name: "Michael Sales" },
            { workno: "10", name: "Bruno Lourenço" }
        ];

        const insertedEmployees = [];
        for (const emp of veRoster) {
            const saved = await prisma.employee.upsert({
                where: {
                    userId_workno: {
                        userId: veUser.id,
                        workno: emp.workno
                    }
                },
                update: {
                    name: emp.name,
                    active: true
                },
                create: {
                    userId: veUser.id,
                    workno: emp.workno,
                    name: emp.name,
                    active: true
                }
            });
            insertedEmployees.push(saved);
        }

        // 3. Remover registos de teste gerados durante diagnóstico (se existirem)
        await prisma.attendanceLog.deleteMany({
            where: {
                userId: veUser.id,
                rawEventId: { startsWith: 'manual_' },
                employeeName: 'Teste'
            }
        });

        // 4. Horários VE
        let schedVE = await prisma.schedule.findFirst({
            where: { userId: veUser.id, name: 'Horário VE (08:30 - 17:30)' }
        });
        if (!schedVE) {
            schedVE = await prisma.schedule.create({
                data: {
                    userId: veUser.id,
                    name: 'Horário VE (08:30 - 17:30)',
                    startTime: '08:30',
                    endTime: '17:30',
                    lateTolerance: 20,
                    lunchDuration: 60
                }
            });
        }

        return NextResponse.json({
            success: true,
            message: "VE configurada com sucesso com todos os 9 colaboradores e horários!",
            user: { id: veUser.id, username: veUser.username, company: veUser.company },
            employees: insertedEmployees,
            schedule: schedVE
        });
    } catch (e: any) {
        console.error("Error in setup-ve:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
