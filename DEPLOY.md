# Implementação do Pontual (Produção)

Este projeto está pronto para ser alojado no **Vercel** com suporte para múltiplos clientes numa única instância.

## 🚀 Estratégia de Hosting (Multi-tenancy)

Ao contrário da versão anterior, agora usamos uma base de dados centralizada. Isto significa que:
1.  **Apenas 1 Deployment:** Fazes o deploy uma vez no Vercel.
2.  **Múltiplos Logins:** Podes criar contas para os teus 3 clientes (ou mais) na mesma plataforma.
3.  **Segurança:** Cada cliente, ao entrar com o seu email, só vê os dados da sua própria conta CrossChex Cloud.

## ⚙️ Guia de Configuração (Vercel)

1.  **Criar Projeto no Vercel**: Importa o repositório `Pontual` do GitHub.
2.  **Base de Dados**: No separador "Storage", cria um **Vercel Postgres**. O Vercel ligará automaticamente a base de dados ao teu projeto.
3.  **Variáveis de Ambiente**:
    - `NEXTAUTH_SECRET`: Gera uma chave aleatória (ex: `openssl rand -base64 32`)
    - `NEXTAUTH_URL`: O URL final do teu site (ex: `https://pontual.vercel.app`)
4.  **Primeiro Acesso**:
    - Após o deploy, corre o script de seed (ou pede-me para criar uma página de registo inicial) para criares os 3 logins dos teus clientes.

## 🔌 Configurar um Novo Cliente
1. Cria a conta do cliente no **CrossChex Cloud**.
2. Obtém a **API Key** e **Secret** no painel da CrossChex.
3. Associa estas chaves ao email do cliente na base de dados do Pontual.

---

**Status:** Pronto para ficar online. 🚀
