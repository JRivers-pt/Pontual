import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DeviceList } from "@/components/admin/DeviceList";

export default async function ClientDevicesPage({
    params,
}: {
    params: { id: string };
}) {
    const { id } = await params;

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/admin/clients"
                    className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white mb-4"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar aos Clientes
                </Link>
                <h1 className="text-2xl font-bold">Equipamentos</h1>
                <p className="text-neutral-500">
                    Dispositivos CrossChex detetados a partir dos registos de assiduidade.
                </p>
            </div>
            <DeviceList clientId={id} />
        </div>
    );
}