"use client"

import * as React from "react"
import { Plus, Trash2, UserPlus, Clock, Save, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { getSchedules, getEmployees } from "@/lib/api"
import { Schedule } from "@/lib/schedules"

export default function SchedulesPage() {
    const [schedules, setSchedules] = React.useState<Schedule[]>([])
    const [employees, setEmployees] = React.useState<any[]>([])
    const [loading, setLoading] = React.useState(true)
    const [saving, setSaving] = React.useState(false)

    const [newSchedule, setNewSchedule] = React.useState({
        name: "",
        startTime: "09:00",
        endTime: "18:00",
        lateTolerance: 15
    })

    const fetchData = async () => {
        setLoading(true)
        try {
            const [schedulesData, employeesData] = await Promise.all([
                getSchedules(),
                getEmployees()
            ])
            setSchedules(schedulesData)
            setEmployees(employeesData)
        } catch (error) {
            console.error("Error fetching data:", error)
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => {
        fetchData()
    }, [])

    const handleCreateSchedule = async () => {
        setSaving(true)
        try {
            const res = await fetch("/api/schedules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newSchedule)
            })
            if (res.ok) {
                setNewSchedule({ name: "", startTime: "09:00", endTime: "18:00", lateTolerance: 15 })
                await fetchData()
            }
        } catch (error) {
            console.error("Error creating schedule:", error)
        } finally {
            setSaving(false)
        }
    }

    const handleAssignEmployee = async (workno: string, scheduleId: string) => {
        try {
            const res = await fetch("/api/schedules/assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workno, scheduleId })
            })
            if (res.ok) {
                await fetchData()
            }
        } catch (error) {
            console.error("Error assigning employee:", error)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
        )
    }

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Gestão de Horários</h1>
                <p className="text-neutral-500 mt-1">
                    Defina os turnos da sua empresa e atribua-os aos colaboradores.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Create Schedule Card */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            Novo Turno
                        </CardTitle>
                        <CardDescription>Crie um novo horário de trabalho</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome do Turno</label>
                            <Input
                                placeholder="Ex: Turno Geral, Turno da Manhã..."
                                value={newSchedule.name}
                                onChange={e => setNewSchedule({ ...newSchedule, name: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Entrada</label>
                                <Input
                                    type="time"
                                    value={newSchedule.startTime}
                                    onChange={e => setNewSchedule({ ...newSchedule, startTime: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Saída</label>
                                <Input
                                    type="time"
                                    value={newSchedule.endTime}
                                    onChange={e => setNewSchedule({ ...newSchedule, endTime: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Tolerância (Minutos)</label>
                            <Input
                                type="number"
                                value={newSchedule.lateTolerance}
                                onChange={e => setNewSchedule({ ...newSchedule, lateTolerance: parseInt(e.target.value) })}
                            />
                        </div>
                        <Button className="w-full" onClick={handleCreateSchedule} disabled={saving || !newSchedule.name}>
                            {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Guardar Turno
                        </Button>
                    </CardContent>
                </Card>

                {/* Schedules List and Assignment */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Turnos Ativos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {schedules.map(schedule => {
                                const assignedEmployees = employees.filter(emp =>
                                    (schedule as any).employeeSchedules?.some((es: any) => es.workno === emp.workno)
                                );

                                return (
                                    <div key={schedule.id} className="border rounded-lg p-4 space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-lg">{schedule.name}</h3>
                                                <div className="flex gap-4 mt-1 text-sm text-neutral-600">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" /> {schedule.startTime as string} - {schedule.endTime as string}
                                                    </span>
                                                    <span>Tolerância: {schedule.lateTolerance ?? (schedule as any).lateToleranceMinutes}m</span>
                                                </div>
                                            </div>
                                            <Badge variant="outline">{assignedEmployees.length} Colaboradores</Badge>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-neutral-500 uppercase">Atribuir Colaborador</label>
                                            <div className="flex gap-2">
                                                <Select onValueChange={(val) => handleAssignEmployee(val, schedule.id)}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Escolher colaborador..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {employees
                                                            .filter(emp => !(schedule as any).employeeSchedules?.some((es: any) => es.workno === emp.workno))
                                                            .map(emp => (
                                                                <SelectItem key={emp.workno} value={emp.workno}>
                                                                    {emp.first_name} {emp.last_name}
                                                                </SelectItem>
                                                            ))
                                                        }
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {assignedEmployees.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {assignedEmployees.map(emp => (
                                                    <Badge key={emp.workno} className="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 flex gap-1 items-center">
                                                        {emp.first_name} {emp.last_name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {schedules.length === 0 && (
                                <div className="text-center py-12 text-neutral-500">
                                    <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                    <p>Ainda não criou nenhum turno.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
