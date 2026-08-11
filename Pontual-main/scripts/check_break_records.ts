/**
 * Script para verificar registos de ponto e entender como o Anviz W1 Pro
 * está a registar os breaks (Break Start/End)
 * 
 * Uso: npx tsx scripts/check_break_records.ts
 */

import { getAttendanceRecords } from '../src/lib/api'
import { format, parseISO } from 'date-fns'

// Tipos de check do Anviz
const CHECK_TYPES: Record<number, string> = {
    0: 'Check-In',
    1: 'Check-Out',
    2: 'Break Start',
    3: 'Break End',
    128: 'Overtime In',
    129: 'Overtime Out',
}

async function checkBreakRecords() {
    console.log('🔍 A verificar registos de ponto...\n')

    try {
        // Buscar registos de hoje
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0))
        const endOfDay = new Date(today.setHours(23, 59, 59, 999))

        const beginTime = startOfDay.toISOString().replace('Z', '+00:00')
        const endTime = endOfDay.toISOString().replace('Z', '+00:00')

        const response = await getAttendanceRecords(beginTime, endTime)
        const records = response.payload.list

        console.log(`📊 Total de registos hoje: ${records.length}\n`)

        // Agrupar por colaborador
        const employeeRecords = new Map<string, any[]>()

        records.forEach(record => {
            const employeeName = `${record.employee.first_name} ${record.employee.last_name}`.trim()
            const key = `${employeeName} (ID: ${record.employee.workno})`

            if (!employeeRecords.has(key)) {
                employeeRecords.set(key, [])
            }

            employeeRecords.get(key)!.push({
                time: record.checktime,
                type: record.checktype,
                typeName: CHECK_TYPES[record.checktype] || `Tipo ${record.checktype}`,
                device: record.device.name
            })
        })

        // Mostrar registos por colaborador
        employeeRecords.forEach((records, employeeName) => {
            console.log(`👤 ${employeeName}`)
            console.log('─'.repeat(60))

            // Ordenar por hora
            const sorted = records.sort((a, b) =>
                parseISO(a.time).getTime() - parseISO(b.time).getTime()
            )

            sorted.forEach(record => {
                const time = format(parseISO(record.time), 'HH:mm:ss')
                const typeIcon = record.type === 0 || record.type === 128 || record.type === 3 ? '🟢' :
                    record.type === 1 || record.type === 129 || record.type === 2 ? '🔴' : '⚪'
                console.log(`  ${typeIcon} ${time} - ${record.typeName} (${record.device})`)
            })

            // Calcular tempo trabalhado
            let totalMinutes = 0
            let lastInTime: number | null = null

            sorted.forEach(record => {
                const time = parseISO(record.time).getTime()
                const isEntry = record.type === 0 || record.type === 128 || record.type === 3
                const isExit = record.type === 1 || record.type === 129 || record.type === 2

                if (isEntry) {
                    lastInTime = time
                } else if (isExit && lastInTime !== null) {
                    totalMinutes += (time - lastInTime) / (1000 * 60)
                    lastInTime = null
                }
            })

            // Se ainda está dentro, contar até agora
            if (lastInTime !== null) {
                totalMinutes += (Date.now() - lastInTime) / (1000 * 60)
            }

            const hours = Math.floor(totalMinutes / 60)
            const minutes = Math.round(totalMinutes % 60)

            console.log(`\n  ⏱️  Total trabalhado: ${hours}h ${minutes}m`)
            console.log('\n')
        })

        // Análise de breaks
        console.log('\n📋 ANÁLISE DE BREAKS:')
        console.log('─'.repeat(60))

        const hasBreakStart = records.some(r => r.checktype === 2)
        const hasBreakEnd = records.some(r => r.checktype === 3)

        if (hasBreakStart || hasBreakEnd) {
            console.log('✅ O Anviz W1 Pro ESTÁ a registar breaks:')
            if (hasBreakStart) console.log('   - Break Start (tipo 2) encontrado')
            if (hasBreakEnd) console.log('   - Break End (tipo 3) encontrado')
            console.log('\n💡 O tempo de break NÃO é contado como tempo trabalhado.')
            console.log('   A plataforma já desconta automaticamente.')
        } else {
            console.log('⚠️  Nenhum registo de break encontrado hoje.')
            console.log('   Possíveis razões:')
            console.log('   1. Ninguém fez break ainda')
            console.log('   2. O dispositivo não está configurado para registar breaks')
            console.log('   3. Os colaboradores não estão a usar a função de break')
        }

    } catch (error: any) {
        console.error('❌ Erro ao buscar registos:', error.message)
    }
}

checkBreakRecords()
