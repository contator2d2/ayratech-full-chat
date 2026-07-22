# 🪜 Passo a Passo — Guia Operacional do Sistema Ayratech

Guia prático de uso, módulo por módulo. Para visão geral e módulos, ver [`SISTEMA.md`](../SISTEMA.md).

Atualizado: **Julho/2026**.

---

## 1. Primeiros passos (Admin da Organização)

1. Acesse `/login` e entre com o usuário master da organização.
2. **Configurações → Organização**: preencha nome, logo, timezone (`America/Sao_Paulo`).
3. **Departamentos**: crie os setores (Vendas, Suporte, Cobrança, Trade, RH).
4. **Colaboradores/Acessos**: cadastre usuários e atribua Templates de Permissão.
5. **Conexões WhatsApp** (`/conexao`): adicione ao menos 1 conexão (Evolution / W-API / Meta Cloud) e escaneie o QR.
6. **Marcas & Redes** (se usa Trade): cadastre em `/merch/marcas` e `/merch/redes`.

---

## 2. Atendimento (Chat WhatsApp)

1. Abra `/chat`. Conversas aparecem na coluna esquerda; use a busca global (⌘/Ctrl+K) para achar qualquer menu.
2. Selecione uma conversa → responda com texto, emoji, áudio (mic), imagem, doc.
3. **Notas internas**: aba lateral, invisível ao cliente.
4. **@Mencionar** um atendente: digite `@` e escolha.
5. **Tag**: clique no ícone de tag; use para filtrar (SLA, prioridade, tipo).
6. **Respostas rápidas**: digite `/` no compositor.
7. **Agendar mensagem**: clique no relógio ao lado do enviar.
8. **Iniciar fluxo/chatbot manualmente**: menu de ações da conversa.
9. **Transcrição**: clique no ícone em áudios recebidos (Whisper).

---

## 3. CRM

### Negociações (Kanban)
1. `/crm/negociacoes` → arraste cards entre etapas.
2. Clique no card para ver detalhes, tarefas, histórico, anexos.
3. Cor da borda indica status (SLA/quente/perdido).

### Prospects e Empresas
1. `/crm/prospects` — leads não convertidos.
2. `/crm/empresas` — contas ativas.
3. Import via Excel: botão **Importar** → mapeie colunas → confirme (mapeamento `código → brand_code`, fallback UTF-8/Latin1).

### Automações de CRM
1. `/crm/configuracoes → Automações`.
2. Crie gatilhos por etapa/tempo/condição; agendas respeitam o fuso `America/Sao_Paulo`.

---

## 4. Campanhas de Disparo

1. `/campanhas → Nova campanha`.
2. Escolha conexão + lista de contatos + template.
3. Defina delay mín/máx (recomendado: 5s–15s).
4. Agende ou dispare imediatamente.
5. Acompanhe métricas em tempo real; falhas logadas em `campaign_messages`.

---

## 5. Cobrança (Asaas)

1. `/cobranca → Integração`: cole a API Key Asaas e escolha sandbox/production.
2. **Regras de notificação**: crie mensagens para "3 dias antes", "no dia", "3 dias depois", etc.
3. **Blacklist / Pausa**: por cliente ou global — editar em `asaas_customers` via UI.
4. **Alertas**: defina limite (`R$` e dias) para inadimplência crítica; alerta chega por email e WhatsApp.
5. **Limite diário** de mensagens por cliente (padrão 3).
6. Fila de cobrança em `/cobranca/fila`.

---

## 6. Merchandising / Trade

### Cadastros
1. `/merch/redes` → cadastre rede e vincule PDVs (`merch_rede_pdvs`).
2. `/merch/marcas` — código interno é auto-gerado e pesquisável.
3. `/merch/produtos` — vincule à marca; import em lote via Excel.
4. `/merch/categorias` e `/merch/checklists` — defina qtd mínima de fotos, validade, saldo/estoque.

### Rotas & Agenda
1. `/merch/rotas → Nova rota`.
2. Escolha Promotor + PDV + Marcas.
3. **Recorrência por marca**: p.ex. Marca A (Seg/Qua/Sex), Marca B (Ter/Qui).
4. Salve.
5. Para editar uma rota recorrente, o sistema pergunta:
   - **Apenas esta data** ou
   - **Esta e todas as futuras**.
6. **Co-promotor** (apoio): botão "Adicionar promotor de apoio" na rota.
7. **Ação em massa (superadmin)**: barra de manutenção — seleciona rotas e apaga "estas + futuras".

### Contagem de Saldo (Estoque)
1. Definir a marca com regra de contagem no `/merch/checklists`.
2. No app, promotor entra em cada produto:
   - Digita **Estoque** → **Salvar parcial** (badge âmbar).
   - Volta depois, digita **Frente** → **Salvar produto (100%)** → verde.
3. Dashboard: `/merch/contagem-dashboard`.
4. PDF customizado (logo cliente + marca, título, data) e CSV via botão Exportar.
5. Email automático após conclusão da rota (Programação → Contagem).

### Book de Fotos
1. `/merch/book-fotos` → filtra por PDV/marca/data.
2. Gera PDF com logos, título, subtítulo. Link público disponível.

---

## 7. RH e Ponto

### Cadastros
1. `/rh/colaboradores` → CPF, cargo, PDV base, dados LGPD.
   - **Validação Facial**: seguir organização / sempre exigir / isento.
2. `/rh/cargos`, `/rh/escalas`, `/rh/feriados`.

### PDV com Geofence (polígono)
1. `/rh/pdvs → editar` um PDV.
2. Preencha Lat/Lng (ou "Gerar pelo Endereço") → mapa centraliza.
3. Clique no mapa para desenhar o **polígono** (mín. 3 pontos); arraste os marcadores para ajustar.
4. Botão **"Usar centro do polígono"** → preenche lat/lng automaticamente.
5. Salvar. A partir daí check-in/ponto exige estar **dentro do polígono** (fallback: raio).

### Ponto
1. Promotor bate ponto no app ou no Totem (`/totem`).
2. Sistema valida biometria facial (WebGL, fallback CPU) conforme override do funcionário.
3. **Ajuste manual**: `/rh/ponto → editar registro` → informar motivo obrigatório → flag `manual_adjustment` aparece no histórico.

### Holerite em lote
1. `/rh/holerite → Importar em lote`.
2. Selecione todos os PDFs (nome do arquivo = nome/CPF do colaborador).
3. Revise mapeamento (ajuste linhas erradas).
4. Confirme → distribui no app de cada promotor.

---

## 8. App do Promotor

1. Login em `promoter.ayratech.app.br` com CPF + senha (`ayra` + 3 números + 2 letras).
2. **Home**: rotas do dia listadas por PDV.
3. Ao entrar num PDV, **cards de marca** aparecem:
   - 🟢 verde = 100%
   - 🟡 amarelo = parcial (com % e nº de fotos)
4. Clique numa marca → **drill-down** para as categorias daquela marca.
5. Categoria pede fotos Antes/Depois:
   - Câmera abre automaticamente (`autoOpen`).
   - Foto é aprovada → **salva e sobe em background** (fila concorrente).
   - Não é possível tirar **Antes** se já existe qualquer **Depois** na categoria.
6. Ao voltar, thumbnails aparecem imediatamente (otimista).
7. Ao concluir 100% em todas as marcas, aparece o botão **Concluir Rota** no final da lista.
8. **Contagem de saldo**: fluxo parcial descrito acima.
9. **Modo offline**: fotos e chamadas ficam em IndexedDB; sincronizam ao voltar online.

Detalhes técnicos do pipeline: [`promotor-upload-fotos.md`](./promotor-upload-fotos.md).

---

## 9. Portais Externos

### Portal da Rede (`/network`)
- Login isolado. Gerencia unidades, PDVs, QR codes, requisitos de doc, aprova agências/visitas.

### Portal da Agência (`/agency`)
- Marcas, regras de acesso, folgas, pedidos à rede, dashboard.

### Supermercado (`/supermarket`)
- Usuários em `supermarket_users`, PDVs em `supermarket_units`.

### Totem (`/totem`)
- Reconhecimento facial + teclado virtual; identidade customizável por unidade.

---

## 10. Assinatura Digital de Documentos

1. `/modelos-contrato` → crie o modelo com variáveis.
2. `/assinaturas → Novo envio` → escolha destinatário e canal.
3. Destinatário abre link, valida OTP (SMS/WhatsApp), assina.
4. Documento fica com **SHA-256 + carimbo GMT-3**; verificação pública em `/verificar-documento`.

---

## 11. IA e Automações

- **Fluxos** (`/fluxos`): construtor visual; gatilhos por palavra-chave, tag, webhook.
- **Chatbots** (`/chatbots`): árvore de decisão.
- **Agentes IA** (`/agentes-ia` / `/agentes-ia-cliente`): usam RAG (cosine_similarity no PostgreSQL) sobre a base de conhecimento.
- **Secretária de Grupos** (`/secretaria-grupos`): resumos e follow-up automáticos.

---

## 12. Deploy e Rollback

1. Em DEV: `./scripts/release.sh` gera imagens Docker versionadas.
2. Copie `releases/vYYYYMMDDHHMM/` para produção.
3. `docker load < frontend.tar && docker load < backend.tar`.
4. `VERSION=vYYYYMMDDHHMM docker-compose up -d`.
5. Rollback: apenas troque `VERSION` para uma versão anterior e suba de novo.
6. Migrações SQL: aplique manualmente via `psql` os `backend/schema-*.sql` novos.

Detalhes: [`DEPLOY.md`](../DEPLOY.md).

---

## 13. Suporte a Problemas Comuns

| Sintoma | Onde olhar |
|---------|-----------|
| Promotor não consegue bater ponto | Geofence do PDV (`/rh/pdvs`) + override facial do colaborador (`/rh/colaboradores`) |
| Fotos não sobem | Console do app → fila `pending_uploads` (IndexedDB); verificar rede |
| Cobrança não dispara | `asaas_integrations.billing_paused`, `blacklist`, limite diário, regras ativas |
| Rota "pending" mesmo concluída | Rodar recompute em `/merch/rotas`; ver progresso por marca |
| 500 em rota do backend | Verificar `import`/`export` ESM em arquivos recentes; log `backend/src/logger.js` |
