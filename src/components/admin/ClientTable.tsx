"use client";

import { useEffect, useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Plus, MonitorUp, CircleCheck, CircleX } from "lucide-react";
import Link from "next/link";

interface Client {
    id: string;
    username: string;
    email: string | null;
    name: string | null;
    company: string | null;
    role: string;
    apiKey: string | null;
    apiSecret: string | null;
    createdAt: string;
    _count?: {
        schedules?: number;
    };
}

export function ClientTable() {
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            const response = await fetch("/api/admin/clients");
            const data = await response.json();
            setClients(data);
        } catch (error) {
            console.error("Error fetching clients:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem a certeza que deseja eliminar este cliente?")) return;

        try {
            const response = await fetch(`/api/admin/clients/${id}`, {
                method: "DELETE",
            });
            if (response.ok) {
                setClients(clients.filter((c) => c.id !== id));
            }
        } catch (error) {
            console.error("Error deleting client:", error);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-neutral-500">A carregar clientes...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Clientes</h2>
                    <p className="text-neutral-500">Gerir acessos e credenciais CrossChex.</p>
                </div>
                <Button asChild>
                    <Link href="/admin/clients/new">
                        <Plus className="mr-2 h-4 w-4" /> Adicionar Cliente
                    </Link>
                </Button>
            </div>

            <div className="border rounded-xl bg-white dark:bg-neutral-900 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Utilizador</TableHead>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Data de Criação</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {clients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-neutral-500">
                                    Nenhum cliente encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            clients.map((client) => (
                                <TableRow key={client.id}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-neutral-900 dark:text-white">
                                                {client.name || client.username}
                                            </span>
                                            <span className="text-xs text-neutral-500">@{client.username}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{client.company || "-"}</TableCell>
                                    <TableCell>{client.email || "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {client.apiKey && client.apiSecret ? (
                                                <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                                                    <CircleCheck className="h-3 w-3" />
                                                    API Ligada
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                                                    <CircleX className="h-3 w-3" />
                                                    Sem API
                                                </Badge>
                                            )}
                                            <Badge variant="secondary" className="gap-1">
                                                <MonitorUp className="h-3 w-3" />
                                                {client._count?.schedules ?? 0} horários
                                            </Badge>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {new Date(client.createdAt).toLocaleDateString("pt-PT")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" asChild title="Ver equipamentos">
                                                <Link href={`/admin/clients/${client.id}/devices`}>
                                                    <MonitorUp className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                            <Button variant="ghost" size="icon" asChild title="Editar cliente">
                                                <Link href={`/admin/clients/${client.id}/edit`}>
                                                    <Edit className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                                onClick={() => handleDelete(client.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
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
