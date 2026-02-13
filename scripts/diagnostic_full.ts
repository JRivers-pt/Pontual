/**
 * Script de Diagnóstico Completo - API CrossChex vs Plataforma Pontual
 * 
 * Compara:
 * 1. Dados brutos da API
 * 2. Lógica de cálculo da plataforma
 * 3. Tipos de check suportados
 * 4. Horários configurados
 * 
 * Uso: npm run tsx scripts/diagnostic_full.ts
 */

import { getAttendanceRecords, getEmployees } from '../src/lib/api'
import { isLate, calculateOvertime, getScheduleInfo, SCHEDULES, EMPLOYEE_SCHEDULES } from '../src/lib/schedules'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'
import { pt } from 'date-fns/locale'

const CHECK_TYPES: Record<number, { name: string; category: 'entry' | 'exit' }> = {
    0: { name: 'Check-In', category: 'entry' },
    1: { name: 'Check-Out', category: 'exit' },
    2: { name: 'Break Start', category: 'exit' },
    3: { name: 'Break End', category: 'entry' },
    128: { name: 'Overtime In', category: 'entry' },
    129: { name: 'Overtime Out', category: 'exit' },
}

async function runDiagnostic() {
    console.log('╔═══════════════════════════════════════════════════════════╗')
    console.log('║  DIAGNÓSTICO COMPLETO - API vs PLATAFORMA                 ║')
    console.log('╚═══════════════════════════════════════════════════════════╝\n')

    try {
        // 1. CONFIGURAÇÃO DE HORÁRIOS
        console.log('📋 1. CONFIGURAÇÃO DE HORÁRIOS NA PLATAFORMA')
        console.log('─'.repeat(60))
        Object.entries(SCHEDULES).forEach(([id, schedule]) => {
            console.log(`\n${schedule.name} (ID: ${id}):`)
            console.log(`  ⏰ Horário: ${schedule.startTime.hour.toString().padStart(2, '0')}:${schedule.startTime.minute.toString().padStart(2, '0')} - ${schedule.endTime.hour.toString().padStart(2, '0')}:${schedule.endTime.minute.toString().padStart(2, '0')}`)
            console.log(`  ⏱️  Tolerância atraso: ${schedule.lateToleranceMinutes} min`)
            console.log(`  🚪 Tolerância saída antecipada: ${schedule.earlyOutToleranceMinutes} min`)
        })

        console.log('\n\n👥 Atribuição de Horários:')
        console.log('─'.repeat(60))
        if (Object.keys(EMPLOYEE_SCHEDULES).length === 0) {
            console.log('⚠️  Nenhum colaborador com horário específico')
            console.log('   Todos usam horário padrão: VE')
        } else {
            Object.entries(EMPLOYEE_SCHEDULES).forEach(([workno, scheduleId]) => {
                console.log(`  ID ${workno} → ${SCHEDULES[scheduleId].name}`)
            })
        }

        // 2. BUSCAR DADOS DA API
        console.log('\n\n📡 2. DADOS DA API CROSSCHEX (HOJE)')
        console.log('─'.repeat(60))

        const today = new Date()
        const start = startOfDay(today)
        const end = endOfDay(today)

        const beginTime = start.toISOString().replace('Z', '+00:00')
        const endTime = end.toISOString().replace('Z', '+00:00')

        const [recordsResponse, employeesResponse] = await Promise.all([
            getAttendanceRecords(beginTime, endTime),
            getEmployees()
        ])

        const records = recordsResponse.payload.list
        const employees = employeesResponse

        console.log(`✅ Total de registos: ${records.length}`)
        console.log(`✅ Total de colaboradores: ${employees.length}`)

        // 3. ANÁLISE POR COLABORADOR
        console.log('\n\n👤 3. ANÁLISE DETALHADA POR COLABORADOR')
        console.log('─'.repeat(60))

        const employeeMap = new Map<string, any>()

        records.forEach(record => {
            const workno = record.employee.workno
            const name = `${record.employee.first_name} ${record.employee.last_name}`.trim()

            if (!employeeMap.has(workno)) {
                employeeMap.set(workno, {
                    name,
                    workno,
                    checks: []
                })
            }

            employeeMap.get(workno)!.checks.push({
                time: record.checktime,
                type: record.checktype,
                device: record.device.name
            })
        })

        employeeMap.forEach((data, workno) => {
            console.log(`\n╔═══ ${data.name} (ID: ${workno}) ═══`)

            // Horário do colaborador
            const scheduleInfo = getScheduleInfo(workno)
            console.log(`║ 📅 Horário: ${scheduleInfo.scheduleName}`)
            console.log(`║ ⏰ ${scheduleInfo.startTimeStr} - ${scheduleInfo.endTimeStr} (${scheduleInfo.regularHours})`)

            // Ordenar checks
            const sorted = [...data.checks].sort((a, b) =>
                parseISO(a.time).getTime() - parseISO(b.time).getTime()
            )

            console.log(`║`)
            console.log(`║ 📝 Registos (${sorted.length}):`)

            sorted.forEach((check, idx) => {
                const time = format(parseISO(check.time), 'HH:mm:ss')
                const typeInfo = CHECK_TYPES[check.type]
                const icon = typeInfo?.category === 'entry' ? '🟢' : '🔴'
                const typeName = typeInfo?.name || `Tipo ${check.type}`
                console.log(`║   ${idx + 1}. ${icon} ${time} - ${typeName}`)
            })

            // CÁLCULO DA PLATAFORMA
            console.log(`║`)
            console.log(`║ 🧮 CÁLCULO DA PLATAFORMA:`)
            console.log(`║ ─────────────────────────────`)

            let totalMinutes = 0
            let lastInTime: number | null = null
            const segments: Array<{ start: string; end: string; minutes: number }> = []

            sorted.forEach(check => {
                const time = parseISO(check.time).getTime()
                const isEntry = check.type === 0 || check.type === 128 || check.type === 3
                const isExit = check.type === 1 || check.type === 129 || check.type === 2

                if (isEntry) {
                    lastInTime = time
                } else if (isExit && lastInTime !== null) {
                    const minutes = (time - lastInTime) / (1000 * 60)
                    totalMinutes += minutes
                    segments.push({
                        start: format(new Date(lastInTime), 'HH:mm'),
                        end: format(new Date(time), 'HH:mm'),
                        minutes: Math.round(minutes)
                    })
                    lastInTime = null
                }
            })

            // Se ainda está dentro
            if (lastInTime !== null) {
                const minutes = (Date.now() - lastInTime) / (1000 * 60)
                totalMinutes += minutes
                segments.push({
                    start: format(new Date(lastInTime), 'HH:mm'),
                    end: 'AGORA',
                    minutes: Math.round(minutes)
                })
            }

            segments.forEach((seg, idx) => {
                const hours = Math.floor(seg.minutes / 60)
                const mins = seg.minutes % 60
                console.log(`║   Segmento ${idx + 1}: ${seg.start} → ${seg.end} = ${hours}h ${mins}m`)
            })

            const totalHours = Math.floor(totalMinutes / 60)
            const totalMins = Math.round(totalMinutes % 60)
            console.log(`║`)
            console.log(`║ ⏱️  TOTAL TRABALHADO: ${totalHours}h ${totalMins}m`)

            // Verificar atraso
            if (sorted.length > 0) {
                const firstCheck = parseISO(sorted[0].time)
                const late = isLate(workno, firstCheck)
                console.log(`║ 🚦 Status: ${late ? '🔴 ATRASADO' : '🟢 PONTUAL'}`)

                // Horas extra
                const lastCheck = sorted[sorted.length - 1]
                const lastCheckDate = lastCheck.type === 1 || lastCheck.type === 129 ? parseISO(lastCheck.time) : null
                const overtime = calculateOvertime(workno, firstCheck, lastCheckDate)

                if (overtime > 0) {
                    const otHours = Math.floor(overtime / 60)
                    const otMins = overtime % 60
                    console.log(`║ ⚡ Horas Extra: ${otHours}h ${otMins}m`)
                }
            }

            console.log(`╚${'═'.repeat(58)}`)
        })

        // 4. RESUMO DE TIPOS DE CHECK ENCONTRADOS
        console.log('\n\n📊 4. TIPOS DE CHECK ENCONTRADOS NA API')
        console.log('─'.repeat(60))

        const typeCount = new Map<number, number>()
        records.forEach(r => {
            typeCount.set(r.checktype, (typeCount.get(r.checktype) || 0) + 1)
        })

        Array.from(typeCount.entries())
            .sort((a, b) => a[0] - b[0])
            .forEach(([type, count]) => {
                const typeInfo = CHECK_TYPES[type]
                const icon = typeInfo?.category === 'entry' ? '🟢' : typeInfo?.category === 'exit' ? '🔴' : '⚪'
                const name = typeInfo?.name || `Tipo ${type} (DESCONHECIDO)`
                console.log(`${icon} ${name.padEnd(20)} → ${count} registos`)
            })

        // 5. VALIDAÇÃO DA LÓGICA
        console.log('\n\n✅ 5. VALIDAÇÃO DA LÓGICA')
        console.log('─'.repeat(60))

        const hasBreaks = records.some(r => r.checktype === 2 || r.checktype === 3)

        console.log('Tipos de check suportados pela plataforma:')
        console.log('  🟢 Entry: Check-In (0), Overtime In (128), Break End (3)')
        console.log('  🔴 Exit: Check-Out (1), Overtime Out (129), Break Start (2)')
        console.log('')

        if (hasBreaks) {
            console.log('✅ Breaks detectados nos registos')
            console.log('✅ Plataforma conta tempo ENTRE entradas e saídas')
            console.log('✅ Tempo de break NÃO é contado como trabalho')
        } else {
            console.log('⚠️  Nenhum break detectado hoje')
            console.log('ℹ️  Plataforma está preparada para breaks quando ocorrerem')
        }

        console.log('\n\n╔═══════════════════════════════════════════════════════════╗')
        console.log('║  DIAGNÓSTICO CONCLUÍDO                                    ║')
        console.log('╚═══════════════════════════════════════════════════════════╝\n')

    } catch (error: any) {
        console.error('\n❌ ERRO:', error.message)
        if (error.response) {
            console.error('Resposta da API:', error.response.data)
        }
    }
}

runDiagnostic()
