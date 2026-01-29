"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"

const data = [
    { day: "Seg", presentes: 22, faltas: 2 },
    { day: "Ter", presentes: 23, faltas: 1 },
    { day: "Qua", presentes: 24, faltas: 0 },
    { day: "Qui", presentes: 21, faltas: 3 },
    { day: "Sex", presentes: 24, faltas: 0 },
    { day: "Sáb", presentes: 5, faltas: 0 },
    { day: "Dom", presentes: 0, faltas: 0 },
]

export function AttendanceChart() {
    return (
        <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data}>
                <XAxis
                    dataKey="day"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                />
                <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: '#171717', border: 'none', borderRadius: '8px', color: '#fff' }}
                    cursor={{ fill: 'transparent' }}
                />
                <Bar dataKey="presentes" fill="#2563eb" radius={[4, 4, 0, 0]} name="Presentes" />
                <Bar dataKey="faltas" fill="#ef4444" radius={[4, 4, 0, 0]} name="Faltas/Atrasos" />
            </BarChart>
        </ResponsiveContainer>
    )
}
