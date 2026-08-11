# Pontual

Sistema inteligente de gestão de assiduidade integrado com CrossChex Cloud API.

## 🚀 Funcionalidades

- ✅ **Dados em Tempo Real** - Integração direta com API CrossChex Cloud
- 📊 **Relatórios Completos** - Visualização de todos os registos de ponto
- 🎨 **Interface Premium** - Design moderno e responsivo
- 📥 **Exportações** - PDF e Excel com um clique
- 🔍 **Pesquisa e Filtros** - Por colaborador, data, tipo de registo
- 📈 **Estatísticas** - KPIs em tempo real

## 🛠️ Tecnologias

- **Framework:** Next.js 16 (App Router)
- **Linguagem:** TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** Shadcn/UI
- **Charts:** Recharts
- **Exports:** jsPDF, XLSX

## 📋 Pré-requisitos

- Node.js 18+ 
- Conta CrossChex Cloud
- API Key e API Secret

## ⚙️ Instalação

```bash
# Clonar repositório
git clone https://github.com/JRivers-pt/Pontual.git
cd Pontual

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env.local
```

Editar `.env.local`:
```env
NEXT_PUBLIC_CROSSCHEX_API_URL=https://api.eu.crosschexcloud.com/
CROSSCHEX_API_KEY=sua_api_key_aqui
CROSSCHEX_API_SECRET=seu_api_secret_aqui
```

## 🚀 Execução

```bash
# Desenvolvimento
npm run dev

# Build de produção
npm run build
npm start
```

Aceder: **http://localhost:3000**

## 📁 Estrutura

```
src/
├── app/
│   ├── api/                 # API Routes (proxy CrossChex)
│   ├── reports/             # Página de relatórios
│   └── page.tsx             # Dashboard
├── components/
│   ├── layout/              # Sidebar, navigation
│   └── ui/                  # Shadcn components
└── lib/
    ├── api.ts               # Cliente API CrossChex
    └── exports.ts           # Funções PDF/Excel
```

## 🔐 API CrossChex

O sistema utiliza API Routes do Next.js para evitar problemas de CORS:

- `/api/auth/token` - Autenticação
- `/api/attendance/records` - Buscar registos

## 📊 Relatórios

A página de relatórios (`/reports`) mostra:

- **CheckType** com badges coloridos (Check-In, Check-Out, etc.)
- **Colaboradores** com ID e nome completo
- **Dispositivos** (nome + serial number)
- **Estatísticas** (colaboradores únicos, check-ins/outs)
- **Exportações** PDF e Excel

## 📄 Licença

Proprietary - © 2026 Pontual

## 🤝 Suporte

Para questões ou suporte, contacte através do repositório GitHub.
## Verified Connection - Sun Feb 15 11:03:34 PM WET 2026
