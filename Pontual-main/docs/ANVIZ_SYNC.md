# 📋 Sincronização Anviz W1 Pro ↔ Plataforma Pontual

**Data:** 12/02/2026  
**Status:** ✅ Sincronizado

---

## 🔄 Alterações Realizadas

### 1. **Horário VE 2 - Tolerância Corrigida**
- ❌ **Antes:** 60 minutos de tolerância
- ✅ **Agora:** 20 minutos (igual ao Anviz)

### 2. **Break Manual (Alterado)**
- ❌ **Antes:** Break automático de 1h
- ✅ **Agora:** Break manual (picagem de saída/entrada)
- ✅ **Comportamento:** Anviz regista Break Start/End
- ✅ **Plataforma:** Calcula tempo trabalhado EXATAMENTE conforme as picagens (sem descontos automáticos)

### 3. **Threshold de Horas Extra**
- ✅ **Mínimo:** 10 minutos
- ✅ **Regra:** Só conta HE se entrar ≥10min antes OU sair ≥10min depois

---

## 📊 Configuração Atual (Anviz = Plataforma)

### Horário VE
| Parâmetro | Valor |
|-----------|-------|
| Entrada | 08:30 |
| Saída | 17:30 |
| Tolerância atraso | 20 min |
| Tolerância saída antecipada | 20 min |
| HE threshold | 10 min |
| Break | Manual (Picagem obrigatória) |

### Horário VE 2 (Isabel Vaz - ID 3)
| Parâmetro | Valor |
|-----------|-------|
| Entrada | 09:00 |
| Saída | 18:00 |
| Tolerância atraso | 20 min ✅ **CORRIGIDO** |
| Tolerância saída antecipada | 20 min ✅ **CORRIGIDO** |
| HE threshold | 10 min |
| Break | Manual (Picagem obrigatória) |

---

## 🧮 Lógica de Cálculo

### Tempo Trabalhado
```
Tempo = Σ (Exit - Entry)
```
- **Entry:** Check-In (0), Overtime In (128), Break End (3)
- **Exit:** Check-Out (1), Overtime Out (129), Break Start (2)

### Horas Extra
```
HE = (Entrada antes das 8:30/9:00 - 10min) + (Saída depois das 17:30/18:00 - 10min)
```
**Exemplo:**
- Entrada 08:15 → 15min antes → HE = 15min ✅
- Entrada 08:25 → 5min antes → HE = 0min (< threshold)

### Atrasos
```
Atraso = Entrada > (Horário + Tolerância)
```
**Exemplo VE:**
- Entrada 08:50 → Limite 08:50 → Pontual ✅
- Entrada 08:51 → Atrasado ❌

---

## ⚠️ Notas Importantes

1. **Break é MANUAL** - Colaborador TEM de picar saída para almoço e retorno
2. **Plataforma NÃO desconta** - O tempo de trabalho é calculado apenas enquanto o colaborador está "dentro"
3. **Esquecimento** - Se esquecer de picar saída/entrada de almoço, o sistema contará como tempo de trabalho (necessário correção manual)
4. **Cristiana 8:13→13:12** - Se picou Break Start às 13:12, o tempo conta até aí. Se saiu para o dia, conta até aí.
5. **HE < 10min não conta** - Alinhado com Anviz

---

## 🔍 Para Verificar

Execute o script de diagnóstico:
```bash
run_diagnostic.bat
```

Vai mostrar:
- Configuração atual dos horários
- Registos da API
- Cálculos da plataforma
- Comparação Entry/Exit/Break

---

## 📝 Configuração Original do Anviz W1 Pro

### Horário VE
```
Shift Name: Horário VE
Start Shift: 08:30
End Shift: 17:30
Allowable Late Punch-In: 20 Minutes
Allowable Early Punch-Out: 20 Minutes
Early Punch-In counted as OT: 10 Minutes
Late Punch-Out counted as OT: 10 Minutes
Break Duration: 1 Hour (12:00-15:00)
```

### Horário VE 2
```
Shift Name: Horário VE 2
Start Shift: 09:00
End Shift: 18:00
Allowable Late Punch-In: 20 Minutes
Allowable Early Punch-Out: 20 Minutes
Early Punch-In counted as OT: 10 Minutes
Late Punch-Out counted as OT: 10 Minutes
Break Duration: 1 Hour (12:00-15:00)
```

---

**Commit:** `1d49b6c`  
**Ficheiro:** `src/lib/schedules.ts`  
**Push:** GitHub + Vercel Deploy automático
