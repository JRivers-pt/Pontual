# Pontual - Instruções de Deploy para GitHub

## 📦 Preparar para Push

### 1. Inicializar Git (se ainda não estiver inicializado)
```bash
cd "c:\Users\Portatil HP\.gemini\antigravity\playground\cobalt-curie"
git init
```

### 2. Adicionar .gitignore
Certifica-te que tens um `.gitignore` com:
```
node_modules/
.next/
.env.local
*.log
.DS_Store
```

### 3. Adicionar Remote
```bash
git remote add origin https://github.com/JRivers-pt/Pontual.git
```

### 4. Commit e Push
```bash
# Adicionar todos os ficheiros
git add .

# Commit inicial
git commit -m "feat: Initial commit - Pontual v1.0"

# Push para GitHub (branch main)
git push -u origin main
```

## 🔒 IMPORTANTE: Segurança

**NUNCA faças commit do ficheiro `.env.local`!**

As credenciais da API estão em:
- `.env.local` ← Não fazer commit (já está no .gitignore)
- `.env.example` ← Template sem valores reais (seguro)

## 🖥️ Continuar noutro PC

### No novo PC:
```bash
# Clonar o repositório
git clone https://github.com/JRivers-pt/Pontual.git
cd Pontual

# Instalar dependências
npm install

# Copiar template de ambiente
cp .env.example .env.local

# Editar .env.local com as credenciais reais
# (copiar do PC original ou gerar novas)

# Executar
npm run dev
```

## 📝 Workflow Recomendado

```bash
# Antes de começar a trabalhar
git pull origin main

# Fazer alterações...

# Commit das alterações
git add .
git commit -m "feat: descrição das alterações"

# Push
git push origin main
```

## 🌿 Branches (Opcional)

Para trabalhar com branches:
```bash
# Criar branch de desenvolvimento
git checkout -b develop

# Fazer alterações e commit
git add .
git commit -m "feat: nova funcionalidade"

# Push da branch
git push origin develop

# Depois fazer merge via GitHub Pull Request
```
