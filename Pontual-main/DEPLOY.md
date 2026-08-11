# Implementação do Pontual (Produção)

Este projeto está pronto para ser alojado no **Vercel** com suporte para múltiplos clientes numa única instância.

## 🚀 Estratégia de Hosting (Multi-tenancy)

Ao contrário da versão anterior, agora usamos uma base de dados centralizada. Isto significa que:
1.  **Apenas 1 Deployment:** Fazes o deploy uma vez no Vercel.
2.  **Múltiplos Logins:** Podes criar contas para os teus 3 clientes (ou mais) na mesma plataforma.
3.  **Segurança:** Cada cliente, ao entrar com o seu email, só vê os dados da sua própria conta CrossChex Cloud.

## ⚙️ Guia de Configuração (Vercel)

1.  **Criar Projeto no Vercel**: Importa o repositório `Pontual` do GitHub.
2.  **Base de Dados**: No separador "Storage", cria um **Vercel Postgres** ou usa Neon. O Vercel ligará automaticamente a base de dados ao teu projeto.
3.  **Variáveis de Ambiente** (IMPORTANTE):
    - `POSTGRES_PRISMA_URL`: URL da base de dados (configurado automaticamente se usar Vercel Postgres)
    - `NEXTAUTH_SECRET`: Gera uma chave aleatória (ex: `openssl rand -base64 32`)
    - `NEXTAUTH_URL`: O URL final do teu site (ex: `https://pontualidade.vercel.app` ou `https://pontualidade.pt`)
    - `ADMIN_USERNAME`: Username do administrador
    - `ADMIN_PASSWORD`: Password do administrador
4.  **Primeiro Acesso**:
    - Após o deploy, corre o script de seed (ou pede-me para criar uma página de registo inicial) para criares os 3 logins dos teus clientes.

## 🔌 Configurar um Novo Cliente
1. Cria a conta do cliente no **CrossChex Cloud**.
2. Obtém a **API Key** e **Secret** no painel da CrossChex.
3. Associa estas chaves ao email do cliente na base de dados do Pontual.

## ⚡ Performance Esperada
- **Login:** < 2 segundos (otimizado com JWT sessions e bcrypt 8 rounds)
- **Dashboard:** Carregamento instantâneo após login
- Se o login estiver lento, verifica:
  - NEXTAUTH_URL está configurado corretamente
  - Base de dados está a usar connection pooling (Neon pooler ou Vercel Postgres)

## ⏰ Configuração do Cron Job (Keep-Alive)
Para evitar que o servidor "adormeça" (Cold Starts), configura um cron job externo (ex: cron-job.org):
- **URL:** `https://pontual-azure.vercel.app/api/cron/keep-alive`
- **Frequência:** Cada 10 ou 14 minutos
- **Método:** GET

---

**Status:** Pronto para ficar online. 🚀
