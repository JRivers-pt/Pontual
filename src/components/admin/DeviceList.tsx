"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MonitorUp, RefreshCw, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface Device {
    serialNumber: string;
    name: string;
    lastSeen: string;
}

interface DeviceData {
    client?: { id: string; username: string; company: string | null };
    credentialsConfigured?: boolean;
    devices: Device[];
    deviceCount?: number;
    totalEmployees?: number;
    scheduleCount?: number;
    error?: string;
}

export function DeviceList({ clientId }: { clientId: string }) {
    const [data, setData] = useState<DeviceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId]);

    const fetchDevices = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/admin/clients/${clientId}/devices`, {
                cache: "no-store",
            });
            const result = await response.json();
            setData(result);
        } catch (error) {
            console.error("Error fetching devices:", error);
            setData({ devices: [], error: "Erro ao obter os equipamentos." });
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="p-8 text-center text-neutral-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                A consultar a CrossChex Cloud...
            </div>
        );
    }

    if (!data) {
        return <div className="p-8 text-center text-neutral-500">Sem dados.</div>;
    }

    return (
        <div className="space-y-4">
            {data.error && (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm flex items-center gap-2 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400">
                    <CircleAlert className="h-4 w-4 shrink-0" />
                    {data.error}
                </div>
            )}

            {!data.credentialsConfigured && !data.error && (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm flex flex-col gap-2 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400">
                    <span className="flex items-center gap-2">
                        <CircleAlert className="h-4 w-4 shrink-0" />
                        Este cliente ainda não tem credenciais CrossChex configuradas.
                    </span>
                    <Link href={`/admin/clients/${clientId}/edit`} className="underline font-medium">
                        Configurar API Key / API Secret
                    </Link>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                        <MonitorUp className="h-3 w-3 mr-1" />
                        {data.deviceCount ?? data.devices.length} equipamentos
                    </Badge>
                    <Badge variant="secondary">{data.totalEmployees ?? 0} funcionários</Badge>
                    <Badge variant="secondary">{data.scheduleCount ?? 0} horários</Badge>
                </div>
                <Button variant="outline" size="sm" onClick={fetchDevices}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Atualizar
                </Button>
            </div>

            <div className="border rounded-xl bg-white dark:bg-neutral-900 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Equipamento</TableHead>
                            <TableHead>Nº Série</TableHead>
                            <TableHead>Último Cartão</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.devices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-neutral-500">
                                    Nenhum equipamento encontrado nos registos recentes.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.devices.map((device) => (
                                <TableRow key={device.serialNumber}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <MonitorUp className="h-4 w-4 text-neutral-400" />
                                            <span className="font-medium text-neutral-900 dark:text-white">
                                                {device.name}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-neutral-600 dark:text-neutral-400">
                                        {device.serialNumber}
                                    </TableCell>
                                    <TableCell>
                                        {device.lastSeen
                                            ? new Date(device.lastSeen).toLocaleDateString("pt-PT", {
                                                day: "2-digit",
                                                month: "2-digit",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })
                                            : "-"}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}