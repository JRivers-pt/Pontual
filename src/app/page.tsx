"use client"

import * as React from "react"
import { format, parseISO, startOfDay, isToday, differenceInMinutes } from "date-fns"
import { pt } from "date-fns/locale"
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Calendar,
  Activity
} from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { getAttendanceRecords } from "@/lib/api"
import { isLate as checkIsLate, getScheduleInfo } from "@/lib/schedules"

type AttendanceRecord = {
  uuid: string
  employeeName: string
  employeeId: string
  checktime: string
  checktype: number
}

type EmployeeStatus = {
  id: string
  name: string
  status: 'present' | 'absent' | 'late' | 'left'
  firstCheck?: string
  lastCheck?: string
  totalMinutes: number
  scheduleName: string
  scheduleStart: string
}

export default function DashboardPage() {
  const [records, setRecords] = React.useState<AttendanceRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = React.useState<Date>(new Date())

  const fetchTodayRecords = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const today = startOfDay(new Date())
      const now = new Date()

      const beginTime = today.toISOString().replace('Z', '+00:00')
      const endTime = now.toISOString().replace('Z', '+00:00')

      const response = await getAttendanceRecords(beginTime, endTime)

      const formattedRecords: AttendanceRecord[] = response.payload.list.map(item => ({
        uuid: item.uuid,
        employeeName: `${item.employee.first_name} ${item.employee.last_name}`.trim(),
        employeeId: item.employee.workno,
        checktime: item.checktime,
        checktype: item.checktype,
      }))

      setRecords(formattedRecords)
      setLastUpdate(new Date())
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados')
      console.error('Error fetching records:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchTodayRecords()
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchTodayRecords, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchTodayRecords])

  // Process employee statuses
  const employeeStatuses = React.useMemo<EmployeeStatus[]>(() => {
    const empMap = new Map<string, { name: string; checks: { time: string; type: number }[] }>()

    records.forEach(r => {
      const existing = empMap.get(r.employeeId)
      if (existing) {
        existing.checks.push({ time: r.checktime, type: r.checktype })
      } else {
        empMap.set(r.employeeId, {
          name: r.employeeName,
          checks: [{ time: r.checktime, type: r.checktype }]
        })
      }
    })

    const statuses: EmployeeStatus[] = []

    empMap.forEach((data, id) => {
      const sortedChecks = [...data.checks].sort((a, b) =>
        parseISO(a.time).getTime() - parseISO(b.time).getTime()
      )

      const firstCheck = sortedChecks[0]
      const lastCheck = sortedChecks[sortedChecks.length - 1]

      const firstCheckDate = parseISO(firstCheck.time)
      // Usar horário específico do colaborador
      const isLate = checkIsLate(id, firstCheckDate)
      const scheduleInfo = getScheduleInfo(id)

      // Determine if still present (last check was entry type)
      const lastWasEntry = lastCheck.type === 0 || lastCheck.type === 128

      // Calculate total minutes worked
      let totalMinutes = 0
      let lastInTime: number | null = null

      sortedChecks.forEach(check => {
        const time = parseISO(check.time).getTime()
        // Entry types: Check-In (0), Overtime In (128), Break End (3)
        const isEntry = check.type === 0 || check.type === 128 || check.type === 3
        // Exit types: Check-Out (1), Overtime Out (129), Break Start (2)
        const isExit = check.type === 1 || check.type === 129 || check.type === 2

        if (isEntry) {
          lastInTime = time
        } else if (isExit && lastInTime !== null) {
          totalMinutes += (time - lastInTime) / (1000 * 60)
          lastInTime = null
        }
      })

      // If still checked in, add time until now
      if (lastInTime !== null) {
        totalMinutes += (Date.now() - lastInTime) / (1000 * 60)
      }

      let status: 'present' | 'absent' | 'late' | 'left'
      if (lastWasEntry) {
        status = isLate ? 'late' : 'present'
      } else {
        status = 'left'
      }

      statuses.push({
        id,
        name: data.name,
        status,
        firstCheck: firstCheck.time,
        lastCheck: lastCheck.time,
        totalMinutes: Math.round(totalMinutes),
        scheduleName: scheduleInfo.scheduleName,
        scheduleStart: scheduleInfo.startTimeStr
      })
    })

    return statuses.sort((a, b) => a.name.localeCompare(b.name))
  }, [records])

  // Calculate KPIs
  const kpis = React.useMemo(() => {
    const total = employeeStatuses.length
    const present = employeeStatuses.filter(e => e.status === 'present' || e.status === 'late').length
    const late = employeeStatuses.filter(e => e.status === 'late').length
    const left = employeeStatuses.filter(e => e.status === 'left').length

    const totalMinutes = employeeStatuses.reduce((acc, e) => acc + e.totalMinutes, 0)
    const avgMinutes = total > 0 ? totalMinutes / total : 0
    const avgHours = Math.floor(avgMinutes / 60)
    const avgMins = Math.round(avgMinutes % 60)

    const punctualityRate = total > 0 ? Math.round(((total - late) / total) * 100) : 100

    return {
      total,
      present,
      late,
      left,
      avgTime: `${avgHours}h ${avgMins}m`,
      punctualityRate
    }
  }, [employeeStatuses])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Presente</Badge>
      case 'late':
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Atrasado</Badge>
      case 'left':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Saiu</Badge>
      default:
        return <Badge variant="secondary">Desconhecido</Badge>
    }
  }

  const formatMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Dashboard
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: pt })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">
            Atualizado: {format(lastUpdate, 'HH:mm')}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTodayRecords}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm text-red-600">❌ {error}</p>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Colaboradores Hoje
            </CardTitle>
            <Users className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
              {loading ? "-" : kpis.total}
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              registaram ponto
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">
              Presentes Agora
            </CardTitle>
            <UserCheck className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-900 dark:text-green-100">
              {loading ? "-" : kpis.present}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              em trabalho
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">
              Atrasos Hoje
            </CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">
              {loading ? "-" : kpis.late}
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
              chegaram depois das 9:15
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Taxa de Pontualidade
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
              {loading ? "-" : `${kpis.punctualityRate}%`}
            </div>
            <Progress
              value={loading ? 0 : kpis.punctualityRate}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Employee Status List */}
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Estado dos Colaboradores
                </CardTitle>
                <CardDescription>
                  Visão em tempo real do dia de hoje
                </CardDescription>
              </div>
              <Link href="/reports">
                <Button variant="outline" size="sm">
                  Ver Relatórios
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-neutral-500">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                A carregar...
              </div>
            ) : employeeStatuses.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Sem registos de ponto hoje</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {employeeStatuses.map(emp => (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        emp.status === 'present' && "bg-green-500",
                        emp.status === 'late' && "bg-orange-500",
                        emp.status === 'left' && "bg-gray-400"
                      )} />
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">
                          {emp.name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          ID: {emp.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {emp.firstCheck && format(parseISO(emp.firstCheck), 'HH:mm')}
                          {emp.lastCheck && emp.firstCheck !== emp.lastCheck && (
                            <span className="text-neutral-400"> → {format(parseISO(emp.lastCheck), 'HH:mm')}</span>
                          )}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatMinutes(emp.totalMinutes)} trabalhadas
                        </p>
                      </div>
                      {getStatusBadge(emp.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats Panel */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Resumo do Dia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-neutral-600 dark:text-neutral-400">Média de Horas</span>
                <span className="font-bold">{loading ? "-" : kpis.avgTime}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-600 dark:text-neutral-400">Já Saíram</span>
                <span className="font-bold">{loading ? "-" : kpis.left}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-600 dark:text-neutral-400">Total Registos</span>
                <span className="font-bold">{loading ? "-" : records.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border-none shadow-sm bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-800">
            <CardHeader>
              <CardTitle className="text-lg">Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/reports" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Calendar className="h-4 w-4 mr-2" />
                  Relatórios Detalhados
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={fetchTodayRecords}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Atualizar Dados
              </Button>
            </CardContent>
          </Card>

          {/* Late Arrivals Alert */}
          {!loading && kpis.late > 0 && (
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-700 dark:text-orange-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Alerta de Atrasos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  {kpis.late} colaborador{kpis.late > 1 ? 'es' : ''} chegou depois das 9:15 hoje.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
