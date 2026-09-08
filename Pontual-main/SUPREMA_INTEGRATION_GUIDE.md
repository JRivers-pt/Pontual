# PONTUAL: Guia Completo de Integração Suprema BioStar 2 Cloud

Este documento contém todas as especificações técnicas, contexto do cliente, arquitetura e código necessário para integrar os equipamentos **Suprema** (BioEntry W2 + BioMini Plus 2) na plataforma **www.pontualidade.pt** (Next.js 16 + Prisma + Supabase + Vercel).

---

## 1. Contexto do Cliente e Problema Resolvido

- **Cliente Atual:** Já registado em `www.pontualidade.pt`, anteriormente com 2 equipamentos Anviz (a descontinuar).
- **Dimensão:** 70 colaboradores com **30 horários de trabalho diferentes** e intervalos de almoço flexíveis/escalonados.
- **Equipamentos Suprema Existentes:**
  - 3x **Suprema BioEntry W2** (terminais de controlo de acessos/portões).
  - 1x **Suprema BioMini Plus 2** (leitor USB de secretária para assinaturas de contrato).
  - 1x **PC da Secretaria:** Corre o software **BioStar 2** e o **USB Agent**.
- **O Mito dos "2 Registos por Dia":**
  - O técnico anterior disse ao cliente que o W2 "só dá para 2 picagens por dia".
  - **FALSO:** O BioEntry W2 guarda até 1.000.000 de picagens. O técnico apenas configurou um turno rígido no BioStar 2 com filtro "Primeira Entrada / Última Saída" porque não sabia configurar os 30 horários.
  - **A Solução Pontual:** O Pontual consome o fluxo de eventos brutos (`/v2/events`), registando **picagens ilimitadas** por dia para cada colaborador e calculando automaticamente as pausas de almoço.
- **As Impressões Digitais:**
  - Todos os 70 colaboradores **já estão registados na Suprema (BioStar 2)**. Não é necessário registar ninguém de novo!

---

## 2. Arquitetura 100% Cloud-to-Cloud

```
┌─────────────────────────────────────────────────────────────┐
│                 WWW.PONTUALIDADE.PT                         │
│             (Vercel Cloud • Next.js 16)                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS (REST API)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 SUPREMA BIOSTAR 2 CLOUD                     │
│               (https://api.biostar2.com/v2)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ Túnel TLS Seguro Outbound
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                PC DA SECRETARIA DA ESCOLA                   │
│          • BioStar 2 Local (Cloud Service: ON)              │
│          • USB Agent (localhost:8098 para o BioMini)        │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
 [ 3x BioEntry W2 ]                     [ BioMini Plus 2 ]
   (Portões e Portas)                     (Leitor USB na Secretária)
```

---

## 3. Alterações na Base de Dados (Supabase / Prisma)

No ficheiro `prisma/schema.prisma`:

### A. Atualizar o Modelo `User` (Cliente/Escola)
```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  email     String?  @unique
  name      String?
  password  String
  role      Role     @default(CLIENT)
  company   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Provider Biométrico: "ANVIZ" ou "SUPREMA"
  biometricProvider String? @default("ANVIZ")

  // Credenciais Anviz (Legado)
  apiKey    String?
  apiSecret String?
  apiUrl    String?  @default("https://api.eu.crosschexcloud.com/")

  // Credenciais Suprema BioStar 2 Cloud
  supremaSubdomain  String?
  supremaUsername   String?
  supremaPassword   String?

  // Definições de Relatório
  reportHeader      String?
  logoUrl           String?
  vpEmail          String?
  autoEmailReports Boolean @default(false)

  schedules Schedule[]
}
```

### B. Atualizar o Modelo `Schedule` (Horários)
```prisma
model Schedule {
  id            String   @id @default(cuid())
  name          String
  startTime     String   @default("08:30") // "HH:mm"
  endTime       String   @default("17:30") // "HH:mm"
  lateTolerance Int      @default(20)      // Minutos
  lunchDuration Int      @default(60)      // Duração prevista do almoço em minutos
  
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  employeeSchedules EmployeeSchedule[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Comando para aplicar em Supabase:
```bash
npx prisma db push
```

---

## 4. Cliente API Suprema Cloud (`src/lib/suprema.ts`)

Criar `src/lib/suprema.ts`:

```typescript
interface SupremaCredentials {
  subdomain: string;
  username: string;
  password: string;
}

export class SupremaClient {
  private baseUrl = 'https://api.biostar2.com/v2';
  private token: string | null = null;

  constructor(private creds: SupremaCredentials) {}

  async login(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.creds.subdomain,
        user_id: this.creds.username,
        password: this.creds.password,
      }),
    });

    if (!res.ok) {
      throw new Error(`Falha no login Suprema Cloud: ${res.statusText}`);
    }

    this.token = res.headers.get('bs-session-id');
    return this.token!;
  }

  async getUsers() {
    if (!this.token) await this.login();
    const res = await fetch(`${this.baseUrl}/users`, {
      headers: { 'bs-session-id': this.token! },
    });
    return res.json();
  }

  async getEvents(startDate?: string, endDate?: string) {
    if (!this.token) await this.login();
    const res = await fetch(`${this.baseUrl}/events`, {
      headers: { 'bs-session-id': this.token! },
    });
    return res.json();
  }
}
```

---

## 5. Rota de Registo de Picagens (`src/app/api/attendance/records/route.ts`)

Bifurcar a chamada de acordo com o `biometricProvider` do cliente:

```typescript
import { SupremaClient } from '@/lib/suprema';

// No GET / POST da rota:
if (currentUser.biometricProvider === 'SUPREMA') {
  const client = new SupremaClient({
    subdomain: currentUser.supremaSubdomain!,
    username: currentUser.supremaUsername!,
    password: currentUser.supremaPassword!,
  });

  const rawEvents = await client.getEvents();
  
  // Mapear eventos brutos Suprema para o modelo unificado de AttendanceRecord do Pontual:
  const records = rawEvents.records.map((evt: any) => ({
    uuid: evt.id,
    checktime: evt.datetime,
    checktype: evt.event_type_id === 4096 ? 1 : 2, // Entrada / Saída
    device: {
      serial_number: evt.device_id,
      name: evt.device_name || 'BioEntry W2',
    },
    employee: {
      first_name: evt.user_name || 'Colaborador',
      last_name: '',
      workno: evt.user_id,
    }
  }));

  return NextResponse.json({ records });
}
```

---

## 6. Motor de Emparelhamento e Almoço Flexível (`src/lib/attendanceEngine.ts`)

Algoritmo para calcular os 30 horários com almoço flexível:

```typescript
export interface DailyAttendance {
  date: string;
  workerId: string;
  punches: string[]; // ["08:32", "12:35", "13:35", "17:05"]
  morningWorkedMinutes: number;
  lunchBreakMinutes: number;
  afternoonWorkedMinutes: number;
  totalWorkedMinutes: number;
  expectedMinutes: number;
  balanceMinutes: number;
}

export function calculateDailyAttendance(punches: string[], expectedHours = 7.5): DailyAttendance {
  const sorted = punches.sort();
  let morning = 0;
  let lunch = 0;
  let afternoon = 0;

  if (sorted.length >= 2) {
    morning = diffMinutes(sorted[0], sorted[1]);
  }
  if (sorted.length >= 3) {
    lunch = diffMinutes(sorted[1], sorted[2]);
  }
  if (sorted.length >= 4) {
    afternoon = diffMinutes(sorted[2], sorted[3]);
  }

  const total = morning + afternoon;
  const expected = expectedHours * 60;

  return {
    date: new Date().toISOString().split('T')[0],
    workerId: '',
    punches: sorted,
    morningWorkedMinutes: morning,
    lunchBreakMinutes: lunch,
    afternoonWorkedMinutes: afternoon,
    totalWorkedMinutes: total,
    expectedMinutes: expected,
    balanceMinutes: total - expected,
  };
}

function diffMinutes(t1: string, t2: string): number {
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}
```

---

## 7. Assinatura de Contrato no Browser com o BioMini USB

No frontend do Pontual (`src/components/ContractEnrollModal.tsx`):

```typescript
async function captureBioMiniFingerprint() {
  try {
    // Comunicação direta com o Suprema USB Agent no PC da secretaria:
    const response = await fetch('https://127.0.0.1:8098/api/fingerprint/scan', {
      method: 'POST',
    });
    const template = await response.json();
    return template;
  } catch (err) {
    console.error("Certifique-se de que o USB Agent está a correr no PC da secretaria", err);
  }
}
```

---

## 8. Procedimento de Segunda-Feira na Escola (Checklist)

1. **No PC da Secretaria da Escola:**
   - Abrir o BioStar 2 local.
   - Ir a **Definições ➔ Cloud** ➔ Ativar **Cloud Service = ON**.
   - Definir o Subdomínio (ex: `escola-stjude`).
   - Apontar o subdomínio, utilizador e palavra-passe.
2. **No Supabase / Dashboard Pontual:**
   - Atualizar a linha deste cliente na tabela `User`:
     - `biometricProvider` = `SUPREMA`
     - `supremaSubdomain` = `escola-stjude`
     - `supremaUsername` = `admin`
     - `supremaPassword` = `password_da_escola`
3. **Na Reunião:**
   - Abrir `www.pontualidade.pt`.
   - Mostrar os 70 colaboradores já importados.
   - Demonstrar que o BioEntry W2 aceita picagens ilimitadas por dia.
   - Mostrar o cálculo automático de horas e almoços para os 30 horários.
