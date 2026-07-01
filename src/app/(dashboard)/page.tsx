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
  Activity,
  LogOut,
  HelpCircle,
  Wifi,
  WifiOff
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
import { useSession, signOut } from "next-auth/react"
import { getAttendanceRecords, getSchedules } from "@/lib/api"
import { isLate as checkIsLate, getFormattedScheduleInfo, calculateSmartWorkHours, Schedule, getVilaPeixotoSchedule, getGengibreSchedule, getEmployeeSchedule } from "@/lib/schedules"
import { Skeleton } from "@/components/ui/skeleton"

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
  warningsDisabled?: boolean
  warning?: string
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [records, setRecords] = React.useState<AttendanceRecord[]>([])
  const [schedules, setSchedules] = React.useState<Schedule[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = React.useState<Date>(new Date())
  const [devices, setDevices] = React.useState<any[]>([])
  const [loadingDevices, setLoadingDevices] = React.useState(true)

  const companyName = (session?.user as any)?.company || ""
  const isVilaPeixoto = companyName.toLowerCase().includes("vila peixoto")
  const isGengibre = companyName.toLowerCase().includes("cozinha") ||
    companyName.toLowerCase().includes("gengibre") ||
    companyName.toLowerCase().includes("criativa")



  const fetchData = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const today = startOfDay(new Date())
      const now = new Date()

      const beginTime = today.toISOString().replace('Z', '+00:00')
      const endTime = now.toISOString().replace('Z', '+00:00')

      // Fetch records and schedules in parallel
      const [recordsResponse, schedulesData] = await Promise.all([
        getAttendanceRecords(beginTime, endTime),
        getSchedules()
      ])

      const formattedRecords: AttendanceRecord[] = recordsResponse.payload.list.map(item => ({
        uuid: item.uuid,
        employeeName: `${item.employee.first_name} ${item.employee.last_name}`.trim(),
        employeeId: item.employee.workno,
        checktime: item.checktime,
        checktype: item.checktype,
      }))

      setRecords(formattedRecords)
      setSchedules(schedulesData)
      setLastUpdate(new Date())

      // Fetch devices status in background
      setLoadingDevices(true)
      fetch('/api/devices')
        .then(res => res.json())
        .then(data => {
          if (data.devices) setDevices(data.devices)
          setLoadingDevices(false)
        })
        .catch(err => {
          console.error("Error fetching devices:", err)
          setLoadingDevices(false)
        })
    } catch (err: any) {
      const errorMsg = err.message || 'Erro ao carregar dados'
      setError(errorMsg)
      console.error('Error fetching dashboard data:', err)

      // If Unauthorized, force logout to clear "old/broken session"
      if (errorMsg.toLowerCase().includes("unauthorized") || errorMsg.includes("401")) {
        setTimeout(() => {
          signOut({ callbackUrl: '/login', redirect: true })
        }, 2000)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchData()
    // No auto-refresh — manual only to avoid CrossChex API rate limits
  }, [fetchData])

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
      const rawSorted = [...data.checks].sort((a, b) =>
        parseISO(a.time).getTime() - parseISO(b.time).getTime()
      )

      // 1. Filter out double punches (punches within 5 minutes of each other)
      const sortedChecks: typeof rawSorted = []
      rawSorted.forEach(check => {
        if (sortedChecks.length === 0) {
          sortedChecks.push(check)
        } else {
          const prev = sortedChecks[sortedChecks.length - 1]
          const diffMin = differenceInMinutes(parseISO(check.time), parseISO(prev.time))
          if (diffMin > 5) {
            sortedChecks.push(check)
          }
        }
      })

      // 2. Correct check type for the first check of the day (if before 13:00, it's always Check-In/Entrada)
      if (sortedChecks.length > 0) {
        const first = sortedChecks[0]
        const firstDate = parseISO(first.time)
        const hour = firstDate.getHours()
        if (hour < 13 && first.type !== 0 && first.type !== 128 && first.type !== 3) {
          first.type = 0 // Force Check-In
        }
      }

      const firstCheck = sortedChecks[0]
      const lastCheck = sortedChecks[sortedChecks.length - 1]

      const firstCheckDate = parseISO(firstCheck.time)

      // DETERMINE SCHEDULE: 
      // 1. If Vila Peixoto, use automatic rules based on name (user zero-management request)
      // 2. If DB schedules exist, use those
      // 3. Fallback to first schedule or default
      let employeeSchedule: Schedule;

      if (isVilaPeixoto) {
        employeeSchedule = getVilaPeixotoSchedule(data.name);
      } else if (isGengibre) {
        employeeSchedule = getGengibreSchedule(data.name, id);
      } else {
        employeeSchedule = (schedules && schedules.length > 0) ? (schedules.find(s =>
          (s as any).employeeSchedules?.some((es: any) => es.workno === id)
        ) || schedules[0]) : getEmployeeSchedule(id);
      }

      if (!employeeSchedule) {
        // Fallback to a safe default if even getEmployeeSchedule fails
        employeeSchedule = {
          id: 'default',
          name: 'Horário Padrão',
          startTime: '09:00',
          endTime: '18:00',
          lateTolerance: 20
        } as Schedule;
      }

      const isLate = checkIsLate(firstCheckDate, employeeSchedule)
      const scheduleInfo = getFormattedScheduleInfo(employeeSchedule)

      // Determine if still present (last check was entry type)
      // Entry types: Check-In (0), Overtime In (128), Break End (3)
      const lastWasEntry = lastCheck.type === 0 || lastCheck.type === 128 || lastCheck.type === 3

      // Calculate total minutes worked using smart logic
      const calcChecks = sortedChecks.map(c => ({ time: c.time, type: c.type }))

      // Determine warnings/anomalies
      let warning: string | undefined = undefined

      const firstWasExit = firstCheck.type === 1 || firstCheck.type === 129 || firstCheck.type === 2
      if (firstWasExit) {
        warning = "Falta Entrada"
      }

      if (lastWasEntry) {
        // If still working, calculate active work time up to now
        calcChecks.push({ time: new Date().toISOString(), type: 1 })

        // Check if probably forgot to clock out (current time is past shift end by 45+ minutes)
        if (employeeSchedule && !firstWasExit) {
          const endTime = typeof employeeSchedule.endTime === 'string'
              ? (() => { const [h, m] = (employeeSchedule.endTime as string).split(':').map(Number); return { hour: h, minute: m } })()
              : employeeSchedule.endTime as { hour: number; minute: number }
          const now = new Date()
          const scheduleEndMinutes = endTime.hour * 60 + endTime.minute
          const currentMinutes = now.getHours() * 60 + now.getMinutes()
          
          if (currentMinutes > scheduleEndMinutes + 45) {
            warning = "Falta Saída"
          }
        }
      }

      const { totalWorkMs } = calculateSmartWorkHours(calcChecks)
      let totalMinutes = totalWorkMs / (1000 * 60)

      // Double punch check: multiple punches but duration is near 0
      if (sortedChecks.length >= 2 && totalMinutes < 5) {
        warning = "Dupla Picagem"
        totalMinutes = 0
      }

      let status: 'present' | 'absent' | 'late' | 'left'
      if (lastWasEntry) {
        status = (isLate && !employeeSchedule.warningsDisabled) ? 'late' : 'present'
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
        scheduleStart: scheduleInfo.startTimeStr,
        warningsDisabled: (employeeSchedule as any).warningsDisabled,
        warning
      })
    })

    return statuses.sort((a, b) => a.name.localeCompare(b.name))
  }, [records, schedules, isVilaPeixoto, isGengibre])

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
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/20 rounded-full border border-green-100 dark:border-green-900/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs font-medium text-green-700 dark:text-green-400">
              Ao vivo • Atualizado: {format(lastUpdate, 'HH:mm')}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              {error.toLowerCase().includes("unauthorized") 
                ? "Sessão expirada ou credenciais inválidas. Redirecionando para o login..." 
                : `❌ ${error}`}
            </p>
            {(error.toLowerCase().includes("unauthorized") || error.includes("401")) && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="whitespace-nowrap"
              >
                Sair e Reentrar
              </Button>
            )}
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
              {loading ? <Skeleton className="h-9 w-12 bg-blue-200/50 dark:bg-blue-800/50" /> : kpis.total}
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              {loading ? <Skeleton className="h-3 w-24 bg-blue-200/50 dark:bg-blue-800/50" /> : "registaram ponto"}
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
              {loading ? <Skeleton className="h-9 w-12 bg-green-200/50 dark:bg-green-800/50" /> : kpis.present}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {loading ? <Skeleton className="h-3 w-20 bg-green-200/50 dark:bg-green-800/50" /> : "em trabalho"}
            </p>
          </CardContent>
        </Card>

        {/* Atrasos Hoje - Hidden if warnings are disabled */}
        {!employeeStatuses.some(s => s.warningsDisabled) && (
          <Card className="border-none shadow-sm bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">
                Atrasos Hoje
              </CardTitle>
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">
                {loading ? <Skeleton className="h-9 w-12 bg-orange-200/50 dark:bg-orange-800/50" /> : kpis.late}
              </div>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                {loading ? <Skeleton className="h-3 w-32 bg-orange-200/50 dark:bg-orange-800/50" /> : "chegaram depois da tolerância"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Taxa de Pontualidade - Hidden if warnings are disabled */}
        {!employeeStatuses.some(s => s.warningsDisabled) && (
          <Card className="border-none shadow-sm bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Taxa de Pontualidade
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                {loading ? <Skeleton className="h-9 w-16 bg-purple-200/50 dark:bg-purple-800/50" /> : `${kpis.punctualityRate}%`}
              </div>
              <Progress
                value={loading ? 0 : kpis.punctualityRate}
                className="mt-2 h-2"
              />
            </CardContent>
          </Card>
        )}
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
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-transparent">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-2 h-2 rounded-full" />
                      <div>
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <Skeleton className="h-4 w-12 mb-1" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                ))}
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
                      <div className="flex items-center gap-1.5">
                        {emp.warning && (
                          <Badge className={cn(
                            "text-[10px] font-semibold border px-1.5 py-0.5",
                            emp.warning === "Falta Entrada" && "bg-red-100 text-red-700 border-red-200 hover:bg-red-100",
                            emp.warning === "Falta Saída" && "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100",
                            emp.warning === "Dupla Picagem" && "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                          )}>
                            {emp.warning}
                          </Badge>
                        )}
                        {getStatusBadge(emp.status)}
                      </div>
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

          {/* Biometric Devices Status */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wifi className="h-5 w-5 text-neutral-600" />
                Estado dos Equipamentos
              </CardTitle>
              <CardDescription>
                Sinal dos relógios de ponto biométricos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingDevices ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : devices.length === 0 ? (
                <p className="text-sm text-neutral-500 py-2">
                  Nenhum equipamento detetado nos últimos 15 dias.
                </p>
              ) : (
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {devices.map((dev) => (
                    <div key={dev.serialNumber} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          {dev.name}
                        </p>
                        <p className="text-xs text-neutral-500 font-mono">
                          S/N: {dev.serialNumber}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {dev.status === 'online' && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Online
                          </Badge>
                        )}
                        {dev.status === 'warning' && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 flex items-center gap-1">
                            Sem Picagens
                          </Badge>
                        )}
                        {dev.status === 'offline' && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 flex items-center gap-1">
                            <WifiOff className="h-3 w-3" />
                            Offline
                          </Badge>
                        )}
                        <span className="text-[10px] text-neutral-400">
                          {dev.status === 'online' ? 'Ativo recentemente' : `Último registo: ${dev.diffHours}h atrás`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                onClick={fetchData}
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
                  {kpis.late} colaborador{kpis.late > 1 ? 'es' : ''} chegou depois do horário previsto hoje.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
