# PONTUALIDADE.PT: DOCUMENTO FINAL DE TRANSIÇÃO E IMPLEMENTAÇÃO

## 1. Vitória Comercial & Estado do Projeto
- **Proposta Aceite:** O cliente (escola/colégio) aceitou a proposta!
- **Equipamentos Mantidos:**
  - 3x Suprema BioEntry W2 (terminais de porta e portão de exterior IP67).
  - 1x Suprema BioMini Plus 2 (leitor USB de secretária para novos contratos).
- **Equipamentos Anviz:** Abandonados (os 3 novos de 1.050€ ficam no stock para outro cliente).
- **Valores:** Os 1.050€ cobrem a parametrização dos 30 horários e o 1.º ano completo da plataforma pontualidade.pt.
- **Biometria:** Os 70 colaboradores já têm as impressões digitais gravadas no BioStar 2 local da escola. Zero re-registos necessários!

---

## 2. O Desafio Atual: Mapeamento de IDs (Suprema vs Pontual)
- No **BioStar 2**, os colaboradores têm IDs como `1`, `2`, `15`...
- No **Pontualidade.pt**, esses mesmos colaboradores têm `workno` como `600`, `601`...
- **Objetivo:** Garantir que quando o funcionário `1` pica no W2, o Pontualidade regista a picagem como `600`.

---

## 3. Solução 1: Mapeamento no Agente (`agent/mapping.json`) [RECOMENDADA]

No PC da escola, dentro da pasta `agent/`, cria-se o ficheiro `mapping.json`:

```json
{
  "1": "600",
  "2": "601",
  "3": "602"
}
```

O `pontual-agent.js` verifica se o ID existe no `mapping.json`. Se existir, converte o `workno` antes de enviar para o Pontualidade.pt!

### Atualização no `agent/pontual-agent.js`:
```javascript
const mappingPath = path.join(__dirname, 'mapping.json');
let idMapping = {};
if (fs.existsSync(mappingPath)) {
  try {
    idMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  } catch (e) {
    console.error('Erro ao carregar mapping.json', e);
  }
}

// Ao processar o evento:
const mappedWorkno = idMapping[rawUserId] || rawUserId;
```

---

## 4. Solução 2: Script de Auto-Correspondência por Nome

Para não escrever 70 correspondências à mão, podes correr um script simples que:
1. Pede a lista de nomes ao BioStar 2 (`GET /api/users`).
2. Pede a lista de nomes ao Pontualidade (`GET /api/employees` ou BD).
3. Compara nomes idênticos e gera o `mapping.json` automaticamente!

---

## 5. Estrutura do Código já Criado em `Pontual-main`

1. **Base de Dados (`prisma/schema.prisma`):**
   - Campos `biometricProvider` ("ANVIZ" ou "SUPREMA") e `syncToken` no modelo `User`.
   - Modelo `AttendanceLog` para guardar picagens da Suprema sem duplicados.
2. **Rota de Receção (`src/app/api/sync/punches/route.ts`):**
   - Recebe as picagens enviadas pelo agente com cabeçalho `x-school-token`.
3. **Rota de Leitura de Registos (`src/app/api/attendance/records/route.ts`):**
   - Se `biometricProvider === 'SUPREMA'`, lê de `AttendanceLog` mantendo a mesma estrutura JSON que o frontend e relatórios Excel/PDF já usam.
4. **Pasta do Agente (`agent/`):**
   - `config.json`: URL do site e token da escola.
   - `pontual-agent.js`: Script de sincronização local com o BioStar 2.
   - `iniciar-agente.bat`: Ficheiro executável com 2 cliques.

---

## 6. Próximos Passos no Novo Software (OpenCode / Cursor / Outro)

Copiar e colar este prompt no outro software:

```text
Continuar a integração da Suprema BioStar 2 no projeto Pontualidade.pt (C:\Users\JD\Documents\Pontual\Pontual-main).
Lê o ficheiro PONTUAL_SUPREMA_FINAL_HANDOFF.md para todo o contexto.

Tarefas imediatas:
1. Suportar o ficheiro `agent/mapping.json` no `agent/pontual-agent.js` para converter os IDs da Suprema (ex: 1) para os workno do Pontual (ex: 600).
2. Criar um utilitário para emparelhar os 70 nomes do BioStar com os 70 nomes do Pontual e gerar o mapping.json.
3. Testar a receção em /api/sync/punches.
```
