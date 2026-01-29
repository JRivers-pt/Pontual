"use client"

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="p-8 space-y-8">
      {/* Header Panel */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Bem-vindo ao Pontual
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            Sistema inteligente de gestão de assiduidade
          </p>
        </div>
      </div>

      {/* Main Action Card */}
      <div className="max-w-2xl">
        <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
          <CardHeader>
            <CardTitle className="text-2xl">Relatórios de Assiduidade</CardTitle>
            <CardDescription className="text-base">
              Aceda aos registos em tempo real dos seus colaboradores com precisão e simplicidade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/reports">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg w-full sm:w-auto" size="lg">
                <FileText className="mr-2 h-5 w-5" />
                Ver Relatórios
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">📊 Dados em Tempo Real</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Todos os dados vêm diretamente da API CrossChex Cloud, sem cache ou simulações.
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">📥 Exportações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Exporte relatórios em PDF ou Excel para análise offline ou partilha com a equipa.
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">🔄 Período Personalizável</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Selecione qualquer intervalo de datas para consultar o histórico de assiduidade.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
