# Registo e sincronização de colaboradores — preparação de 30/10/2026

Estado de preparação: testes locais e ensaio real com conta técnica desativada concluídos. A operação normal ainda exige um teste final com duas leituras reais e uma passagem física.
A instalação destina-se à VPS central, não ao PC da secretaria. O PC necessita apenas do browser e USB Agent.

## Fluxo e critérios de sucesso

1. O browser fala com o USB Agent **no mesmo PC**. Deteção suporta HTTP 8082 / HTTPS 8081 e a configuração inversa. São feitas duas leituras do mesmo dedo e verificação nativa `/api/Verify`, de acordo com o BioStar instalado. Isto não é a funcionalidade de adicionar um segundo dedo.
2. Capturar não guarda. O utilizador clica em Guardar Colaborador.
3. Colaborador, associação ao horário existente e tarefas por terminal são gravados numa transação.
4. O colaborador aparece na lista. A página distingue biometria guardada de envio pendente, erro ou aceite pelo BioStar.
5. Um worker Node na VPS, junto do daemon de picagens existente, pede uma tarefa de cada vez, envia e devolve uma confirmação. O daemon de picagens continua intacto.
6. Cada terminal tem o seu resultado. Falhas têm novas tentativas com espera progressiva; tarefas abandonadas expiram após 180 s.
7. EXPORTED exige sucesso funcional da API, ausência de falha por dispositivo e leitura de confirmação do utilizador no terminal. Para registos ativos, o contador de versão tem de corresponder ao do BioStar. Não comprova uma passagem física.
8. A conclusão operacional exige passagem real em cada terminal e confirmação do evento de presença no Pontualidade.

O PC USB/browser não precisa de ser o servidor BioStar. A VPS utiliza HTTPS de saída para o Pontualidade e a ligação Tailscale já existente ao BioStar; não expõe portas novas à Internet.

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

O mapa `BIOSTAR_USER_MAP_JSON` associa número mecanográfico a ID BioStar. Para os colaboradores originais, reutiliza-se o mapa validado do daemon. Registos que já existem nos equipamentos ficam protegidos contra substituição cega de credenciais e exigem reconciliação antes de alterações biométricas; adicionar outro dedo fica para a fase seguinte. Contas com login ou permissão administrativa são sempre protegidas.

Para novos colaboradores, `BIOSTAR_ALLOW_NUMERIC_IDS=true` permite IDs numa gama separada, com `BIOSTAR_NEW_USER_ID_OFFSET=1000000`; por exemplo, 0908 torna-se 1000908, sem usar a gama original 1–85. A correspondência efetiva é persistida na fila e usada pela API de picagens para converter o ID remoto de volta ao número mecanográfico. Alterações posteriores de nome não perdem essa correspondência.

Na instalação auditada não existem grupos de acesso no servidor. `BIOSTAR_ALLOW_NO_ACCESS_GROUPS=true` admite explicitamente essa política; não cria nem inventa grupos. Noutras instalações deve usar-se a política validada e os grupos reais.

Se o BioStar usar certificado privado, configurar `BIOSTAR_TLS_PIN_SHA256` com o SHA-256 do certificado verificado através da infraestrutura confiável. O transporte confirma o certificado antes de enviar credenciais HTTP. Uma troca de certificado requer verificação e atualização desse valor. Sem pin, usa-se a validação TLS normal e, se necessário, a CA por `NODE_EXTRA_CA_CERTS` definido antes de iniciar o Node.

```powershell
$env:PONTUAL_AGENT_CONFIG_FILE = 'C:\PontualAgent\config.local.json'
node C:\PontualAgent\enrollment-agent.mjs --once
```

Na VPS Linux, usar `pontual-enrollment.service`: ficheiros de código em `/opt/pontual-enrollment`, configuração root 0600 em `/etc/pontual-enrollment/config.local.json`, entregue ao serviço por `LoadCredential`. O processo usa utilizador dinâmico, sem privilégios, com reinício e arranque automáticos. Instalar apenas uma instância. O daemon original `pontual-biostar-sync.service` não precisa de ser parado.

O agente antigo pode continuar a recolher presenças: com o opt-in ativo, `/api/sync/punches` deixa de lhe entregar biometria, para evitar dois escritores. Verificar se a instalação real usa esta rota; qualquer outro sincronizador que escreva utilizadores deve ser coordenado antes da ativação.

## Piloto obrigatório no local

1. A API foi confrontada com o JavaScript do BioStar instalado. Um registo técnico desativado e sem biometria foi criado, exportado e conferido nos três equipamentos; depois foi removido e os registos originais ficaram inalterados. Falta validar duas amostras reais e uma passagem.
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

O formato Suprema tem código `0` na configuração do servidor BioStar e código `2001` no USB Agent. Captura e verificação usam `2001`; o worker verifica que o servidor continua configurado para Suprema antes de escrever biometria. Um par antigo identificado com o código errado exige recaptura. `GET /api/sync/enrollments?health=true` permite diagnosticar o serviço sem reservar tarefas nem renovar artificialmente o heartbeat.

`npm test` cobre falhas HTTP e funcionais, envio por terminal, reservas, confirmações antigas, repetição, remoção de templates, configuração USB invertida, transporte TLS real em loopback e relatórios com dados sintéticos. O transporte de email é sempre simulado. Os certificados em `tests/fixtures/tls` são material sintético público, nunca credenciais de produção.

`npm run typecheck` e `npm run build` verificam a aplicação inteira. Os 26 erros anteriores foram corrigidos e a opção que ignorava erros de tipos foi removida. Build e arranque já não executam `db push --accept-data-loss`: alterações de esquema são operações explícitas.

`npm run test:integration` exige `PATCH_TEST_DATABASE_URL` com uma ligação PostgreSQL direta. Não carrega credenciais de produção por omissão. Cria um schema aleatório `pontual_patch_*`, copia apenas definições de tabelas, verifica o namespace real do SQL e usa dados sintéticos; o schema é removido no fim. Os testes incluem concorrência, rollback, retries, reserva de IDs, revogação e resolução de picagens.

Uma identidade nova nasce como placeholder técnico **desativado**. Só é associada ao colaborador depois de confirmar a sua propriedade; uma resposta de criação perdida pode ser recuperada sem duplicar nem assumir que um nome igual pertence à mesma pessoa. A ligação ao ID remoto propaga-se aos três terminais. As datas explícitas seguem os valores padrão da interface BioStar instalada (2001–2037), configuráveis por `BIOSTAR_NEW_USER_START_DATETIME` / `BIOSTAR_NEW_USER_EXPIRY_DATETIME`.

Tarefas do mesmo colaborador não podem ser processadas em paralelo, mesmo por dois workers; uma reserva perto do fim da validade não autoriza novas escritas no BioStar. O protocolo continua a ser de entrega pelo menos uma vez: uma operação já aceite pelo BioStar não pode ser cancelada atomicamente pela base cloud. A leitura de confirmação e o teste físico continuam necessários.
