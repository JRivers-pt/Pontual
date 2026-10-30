# Registo e sincronização de colaboradores — preparação de 30/10/2026

Estado: implementado e testado com respostas simuladas; NÃO instalado nem ativado na escola.
A captura USB existente foi validada presencialmente. A distribuição aos terminais não foi validada.

## Fluxo e critérios de sucesso

1. O browser fala com o USB Agent **no mesmo PC**. Deteção suporta HTTP 8082 / HTTPS 8081 e a configuração inversa.
2. Capturar não guarda. O utilizador clica em Guardar Colaborador.
3. Colaborador, associação ao horário existente e tarefas por terminal são gravados numa transação.
4. O colaborador aparece na lista. A página distingue biometria guardada de envio pendente, erro ou aceite pelo BioStar.
5. Um agente Node separado, no servidor com acesso ao BioStar, pede uma tarefa de cada vez, envia e devolve uma confirmação.
6. Cada terminal tem o seu resultado. Falhas têm novas tentativas com espera progressiva; tarefas abandonadas expiram após 180 s.
7. EXPORTED significa apenas que a API BioStar aceitou o envio para esse terminal. Não comprova que o leitor autoriza uma passagem.
8. A conclusão operacional exige passagem real em cada terminal e confirmação do evento de presença no Pontualidade.

O PC USB/browser não precisa de ser o servidor BioStar. O segundo agente necessita de HTTPS de saída para Pontualidade e acesso local ao BioStar; não expõe portas novas à Internet.

## Preparação no servidor e na base de dados

- Criar backup e confirmar que a base alvo é PostgreSQL, a escola correta e a versão corrente está guardada.
- Aplicar uma única vez `prisma/changes/20261030_enrollment_queue.sql` à base correta, com uma conta autorizada.
- **Não executar `prisma migrate deploy` neste repositório sem resolver primeiro o histórico antigo de SQLite. Não usar `db push --accept-data-loss`.**
- Gerar o cliente Prisma e publicar o código. Os modelos novos não são consultados enquanto o opt-in estiver desligado.
- Só na ativação, configurar na Vercel `ENROLLMENT_SYNC_USER_ID` com o ID interno da escola e `ENROLLMENT_TERMINAL_IDS` com os IDs reais dos equipamentos, separados por vírgulas. Sem ambos, a fila nova permanece inativa e o fluxo legado mantém-se.
- Confirmar todos os terminais e grupos de acesso no BioStar. Nenhum grupo ou ID real foi adivinhado no novo agente.
- Configurar uma conta de serviço BioStar com permissões suficientes para gerir os utilizadores previstos; não atribuir permissão de administrador aos colaboradores.

## Agente da escola

Requer Node.js 22 ou superior. Copiar esta pasta para o servidor e criar `config.local.json` a partir do exemplo. Guardar token e senha só nesse servidor, protegidos por permissões de ficheiro. Nunca enviar credenciais por chat nem incluí-las no Git.

O mapa `BIOSTAR_USER_MAP_JSON` é um objeto JSON em texto que associa número mecanográfico a ID BioStar, por exemplo `{"0908":"908"}`. Para colaboradores existentes, obter o mapa real do sincronizador atual e verificar colisões. O modo numérico automático vem desligado: ativá-lo exige validar que a numeração de novos colaboradores corresponde à numeração BioStar. Uma colisão de nome diferente é recusada. Uma alteração de nome ou remoção de um utilizador com ID calculado pode exigir acrescentar o mapeamento explícito; o mapa validado é a opção recomendada.

Se o BioStar usar certificado privado, confiar na CA da escola através de `NODE_EXTRA_CA_CERTS` definido **antes** de iniciar o Node. Não desativar a validação TLS.

```powershell
$env:PONTUAL_AGENT_CONFIG_FILE = 'C:\PontualAgent\config.local.json'
node C:\PontualAgent\enrollment-agent.mjs --once
```

Depois do teste supervisionado, executar continuamente sem `--once`, através do gestor de serviços/tarefas já utilizado na escola, com reinício em falha e arranque automático. Instalar apenas uma instância do agente de inscrições.

O agente antigo pode continuar a recolher presenças: com o opt-in ativo, `/api/sync/punches` deixa de lhe entregar biometria, para evitar dois escritores. Verificar se a instalação real usa esta rota; qualquer outro sincronizador que escreva utilizadores deve ser coordenado antes da ativação.

## Piloto obrigatório no local

1. Confirmar versão BioStar e documentação local da API. Validar login, `Response.code`, formato dos templates, criação, `disabled`, grupos e resposta de exportação. Os testes locais não provam compatibilidade com o firmware instalado.
2. Preparar um colaborador de teste autorizado e um número sem colisão. Capturar, guardar e atualizar a página: nome, horário e biometria devem persistir.
3. Usar o botão Enviar novamente aos terminais para colocar um colaborador anterior na fila. A ativação não envia automaticamente toda a lista antiga.
4. Confirmar que cada tarefa passa por PENDING → PROCESSING → EXPORTED; em falha, ERROR com nova tentativa. O diagnóstico local mostra códigos fixos, não corpos de resposta com dados biométricos.
5. No BioStar, verificar utilizador, templates, grupo e autorizações. Fazer uma passagem real em cada um dos três terminais e verificar o evento no site.
6. Desligar um terminal durante um envio: os outros devem progredir e o terminal indisponível deve continuar pendente/erro, sem falso sucesso.
7. Interromper o agente durante uma tarefa, voltar a iniciá-lo e verificar a recuperação após expirar a reserva.
8. Recapturar um dedo, alterar nome e desativar/reativar: confirmar a nova revisão e o efeito real em todos os terminais. Remover o template deve limpar a credencial remota.
9. Eliminar um registo local de teste só depois de verificar a desativação; a tarefa de revogação sobrevive à remoção do colaborador. Até a revogação ser aceite pelos terminais, não assumir que o acesso foi retirado.

O horário de trabalho do Pontualidade é distinto de uma autorização de porta no BioStar. O novo agente conserva os cartões existentes; não implementa emissão/sincronização de cartões RFID. Alterações de grupos de acesso, formatos de cartão e confirmação automática de passagem ficam fora desta versão.

## Reversão

Antes de desligar o opt-in, parar o novo agente e coordenar o escritor legado: desativar o opt-in volta a disponibilizar a biometria ativa ao agente antigo. Não reativar esse escritor até rever pendências, desativações e mapeamentos. A reversão não desfaz credenciais já enviadas: verificar BioStar e terminais. As tabelas podem permanecer para auditoria; não as eliminar durante a reversão.

## Validação local

`node --test tests/enrollment.test.mjs` cobre falhas HTTP e funcionais, envio por terminal, reservas, confirmações antigas, repetição, remoção de templates e configuração USB invertida. Usam-se exclusivamente dados sintéticos e respostas simuladas.

`prisma validate` passou. A verificação TypeScript global encontrou erros anteriores em relatórios, scripts e outras páginas; não acusou erros nos ficheiros alterados nesta execução. A configuração existente permite builds com erros de tipos: isso não substitui a validação do piloto.
