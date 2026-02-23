import { ClientForm } from "@/components/admin/ClientForm";

export default async function EditClientPage({
    params,
}: {
    params: { id: string };
}) {
    const { id } = await params;

    return (
        <div className="space-y-6">
            <ClientForm clientId={id} />
        </div>
    );
}
