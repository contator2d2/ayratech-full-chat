# 🪜 Passo a Passo — Sistema Ayratech (Merchandising + RH)

Guia operacional focado em **agências de merchandising**. Para visão geral, ver [`SISTEMA.md`](../SISTEMA.md).

Atualizado: **Julho/2026**.

---

## 1. Configuração inicial da agência

1. Faça login em `/login` com o usuário admin da agência.
2. **Configurações → Organização**: nome, logo, timezone (`America/Sao_Paulo`).
3. **Colaboradores / Acessos**: cadastre supervisores e promotores; aplique Templates de Permissão.
4. **Departamentos** (`/departamentos`): estruture Trade, RH, Supervisão etc.
5. Se for usar WhatsApp para falar com marcas: `/conexao` → adicione uma conexão e escaneie o QR.

---

## 2. Cadastros de Merchandising

### 2.1 Redes e PDVs
1. `/merch/redes` → cadastre a rede (Assaí, Atacadão, etc.).
2. Adicione PDVs vinculados (endereço, código, contato).
3. Em `/rh/pdvs`, complete lat/lng e **desenhe o polígono** de geofence (ver seção 5).

### 2.2 Marcas
1. `/merch/marcas → Nova`.
2. Código interno é gerado automaticamente e pode ser pesquisado.
3. Adicione **contrato de marca** em `/merch/contratos` se houver regra comercial.

### 2.3 Produtos
1. `/merch/produtos → Importar` (Excel).
2. Mapeie colunas (`codigo → brand_code`); sistema tenta UTF-8 e cai para Latin1 automaticamente.
3. Revise e confirme.

### 2.4 Categorias e Checklists
1. `/merch/categorias`: crie os grupos (Reposição, Ponto Extra, Preço, etc.).
2. `/merch/checklists`: para cada categoria defina:
   - Quantidade mínima de fotos.
   - Se exige **Antes/Depois**.
   - Regras de validade/saldo.
   - Regras de **contagem** (produtos esperados).

---

## 3. Rotas e Agenda

1. `/merch/rotas → Nova rota`.
2. Escolha Promotor + PDV.
3. Selecione as Marcas atendidas nesse PDV.
4. Para **cada marca**, marque os dias da semana em que ela deve ser executada.
   Exemplo: Marca A = Seg/Qua/Sex; Marca B = Ter/Qui.
5. Defina data inicial da recorrência e salve.
6. **Editar rota recorrente**: o sistema pergunta
   - "Apenas esta data" ou
   - "Esta e todas as futuras".
7. **Co-promotor de apoio**: botão dentro da rota para adicionar 2º promotor.
8. **Manutenção em massa (superadmin)**: barra de seleção → apagar "selecionadas + futuras".
9. Acompanhe o progresso das rotas do dia: cada marca vira 🟢 quando 100% e 🟡 com % e nº de fotos enquanto parcial.

---

## 4. Execução — passo a passo do promotor

1. Promotor abre o app em `promoter.ayratech.app.br` e faz login com CPF + senha.
2. Vê a lista de PDVs do dia.
3. Ao chegar no PDV, faz **check-in** — sistema valida geofence (polígono; fallback raio).
4. Vê os **cards de marca** do PDV.
5. Clica numa marca → abre a tela de **categorias** daquela marca.
6. Toca numa categoria → **câmera abre automaticamente**.
7. Enquadra, captura, aprova → foto salva e sobe em background.
8. Repete até bater a quantidade mínima. Pode continuar tirando extras.
9. Se a categoria pede **Antes/Depois**, só pode tirar "Antes" enquanto não houver nenhuma "Depois". Depois de qualquer "Depois", trava o "Antes".
10. **Contagem de saldo** (quando exigida):
    - Entra em cada produto, digita **Estoque** → **Salvar parcial** (fica âmbar).
    - Depois volta na frente da gôndola, digita **Frente** → **Salvar produto (100%)** → verde.
    - Se hoje não vai contar, marca **"Não fiz hoje"** (passa para próxima visita da semana).
11. Ao terminar todas as marcas (100%), aparece o botão **Concluir Rota**.
12. Se o sistema estiver configurado, dispara **email automático** com o resumo para a marca.

---

## 5. Geofence de PDV (polígono)

1. `/rh/pdvs → editar` um PDV.
2. Preencha Lat/Lng manualmente ou clique em **Gerar Coordenadas pelo Endereço** — o mapa centraliza.
3. Dê zoom no satélite até ver o telhado do PDV.
4. **Clique no mapa** para adicionar cada vértice do perímetro (mín. 3).
5. Arraste marcadores para ajustar; botão direito remove vértice.
6. Clique em **"Usar centro do polígono"** → preenche Lat/Lng automaticamente com o centroide.
7. Salvar.
8. A partir daí, check-in e ponto exigem estar **dentro do polígono**. Se o PDV não tiver polígono desenhado, cai no raio (padrão 200m).

---

## 6. Ponto e Biometria

### Configurar
1. `/rh/colaboradores → editar` o promotor.
2. Campo **Validação Facial**:
   - **Seguir Organização** (padrão)
   - **Sempre Exigir**
   - **Isento** (bypass individual)
3. Configuração global da organização vale para quem estiver como "Seguir Organização".

### Bater ponto
- App do promotor: botão Ponto → câmera facial → valida distância euclidiana até 0.6 → registra com geofence.
- Totem (`/totem`): promotor digita CPF ou aproxima o rosto.

### Ajuste manual
1. `/rh/ponto → editar registro`.
2. Informe **motivo obrigatório**.
3. Registro fica marcado com flag `manual_adjustment` no histórico e logs.

---

## 7. Holerite em lote

1. `/rh/holerite → Importar em lote`.
2. Selecione **todos os PDFs** de uma vez (o nome do arquivo deve conter nome ou CPF do colaborador).
3. Sistema mapeia automaticamente cada PDF a um colaborador.
4. Ajuste linhas com mapeamento incorreto (dropdown).
5. Clique em **Distribuir** — cada promotor recebe o holerite dele no app.

---

## 8. Contagem de Saldo — dashboard e relatórios

1. `/merch/contagem-dashboard`: filtra por marca/PDV/data.
2. Botão **PDF customizado**: escolha logo do cliente, logo da marca, título, subtítulo, data. Cada produto listado linha a linha com Estoque + Frente + Total.
3. Botão **CSV** para export bruto.
4. `/merch/relatorios-programacao`: agenda **envio automático** do resumo para o email da marca depois que o promotor conclui a rota.

---

## 9. Book de Fotos

1. `/merch/book-fotos → Novo book`.
2. Filtre por período, PDV, marca, categoria.
3. Personalize logo do cliente + logo da marca + título + subtítulo.
4. Gere o PDF e/ou compartilhe o **link público**.

---

## 10. Portais externos (Rede e Agência)

### Rede (`/network`)
1. Login isolado da rede.
2. Cadastra unidades e PDVs.
3. Gera **QR codes** por PDV (colar na portaria).
4. Define **requisitos de documentos** para agências.
5. Aprova cadastros de agência (`/network/agency-signups`) e visitas.

### Agência parceira (`/agency`)
1. Cadastro público em `/agency/signup`.
2. Após aprovado, gerencia marcas, folgas, regras de acesso e envia pedidos à rede.

---

## 11. Deploy e Rollback (para o time técnico)

1. Em DEV: `./scripts/release.sh` → gera imagens Docker versionadas (ex.: `v202607221430`).
2. Copie `releases/<versão>/` para produção.
3. `docker load < frontend.tar && docker load < backend.tar`.
4. `VERSION=<versão> docker-compose up -d`.
5. Rollback: apenas troque `VERSION` para uma anterior e suba de novo.
6. Migrações SQL: aplicar manualmente os `backend/schema-*.sql` novos via `psql`.

Detalhes completos: [`DEPLOY.md`](../DEPLOY.md).

---

## 12. Problemas comuns

| Sintoma | Onde olhar |
|---------|-----------|
| Promotor não consegue bater ponto | Geofence do PDV (`/rh/pdvs`) + override facial (`/rh/colaboradores`) |
| Fotos não sobem | Fila `pending_uploads` no IndexedDB; verificar rede; ver worker de compressão |
| Rota "pending" mesmo concluída | Recomputar em `/merch/rotas`; conferir progresso por marca |
| Marca fica em amarelo depois de concluir tudo | Ver se falta Antes/Depois em alguma categoria |
| Contagem some ao salvar parcial | Não deve ocorrer — `stock-count.js /execute` merge por campo. Se ocorrer, checar payload |
| 500 em rota do backend | Verificar `import/export` ESM em arquivos recentes; `backend/src/logger.js` |
| Coordenadas do PDV erradas | Desenhar polígono e clicar "Usar centro do polígono" |
