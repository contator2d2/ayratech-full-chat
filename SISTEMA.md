# 📚 Sistema Ayratech — Visão Geral Completa

> Plataforma SaaS multi-tenant integrando **Atendimento WhatsApp, CRM, Merchandising/Trade, RH, Controle de Acesso, Cobrança e Automações com IA**.

Data desta documentação: **Julho/2026**

---

## 🧭 Sumário

1. [Arquitetura](#-arquitetura)
2. [Perfis de Acesso](#-perfis-de-acesso)
3. [Módulos do Sistema](#-módulos-do-sistema)
   - [Atendimento & Chat WhatsApp](#-atendimento--chat-whatsapp)
   - [CRM](#-crm)
   - [Campanhas e Disparos](#-campanhas-e-disparos)
   - [Automação e IA](#-automação-e-ia)
   - [Cobrança (Asaas)](#-cobrança-asaas)
   - [Merchandising / Trade Marketing](#-merchandising--trade-marketing)
   - [RH e Ponto](#-rh-e-ponto)
   - [Controle de Acesso (Portaria/Totem)](#-controle-de-acesso-portariatotem)
   - [App do Promotor](#-app-do-promotor)
   - [Portal da Rede e Portal da Agência](#-portal-da-rede-e-portal-da-agência)
   - [Módulo Supermercado](#-módulo-supermercado)
   - [Assinatura Digital de Documentos](#-assinatura-digital-de-documentos)
4. [Infraestrutura e Deploy](#-infraestrutura-e-deploy)

---

## 🏗 Arquitetura

| Camada | Stack |
|--------|-------|
| Frontend | React 18 + Vite + TypeScript + TanStack Query |
| UI | Tailwind + shadcn/ui + Radix |
| Backend | Node.js (ESM) + Express |
| Banco | PostgreSQL (Just-in-Time Schema via `ensureTables`) |
| Auth | JWT + contexts multi-portal |
| WhatsApp | Evolution API, W-API, Meta Cloud API |
| IA | Lovable AI Gateway / OpenAI Whisper |
| Deploy | Docker + Nginx + Easypanel |
| Timezone | `America/Sao_Paulo` global |

**Multi-portal** — o mesmo backend serve várias interfaces:
`/` (SaaS principal) · `/promotor` · `/promoter-app` · `/agency` · `/network` · `/supermarket` · `/totem`.

---

## 👥 Perfis de Acesso

- **Superadmin** (`tnicodemos@gmail.com`): gestão global, manutenção em massa.
- **Owner / Admin / Manager / Agent**: hierarquia da organização.
- **Templates de Permissão** (JSONB dinâmico) sobrepõem cargo fixo.
- **Promotor**: acesso mobile ao próprio app.
- **Rede / Agência / Supermercado**: portais externos com login isolado.

---

## 📦 Módulos do Sistema

### 💬 Atendimento & Chat WhatsApp
- Interface estilo WhatsApp Web (texto, imagem, áudio com waveform, vídeo, docs).
- Múltiplas conexões (Evolution / W-API / Meta Cloud).
- Tags, notas internas, @menções, respostas rápidas, agendamento de mensagens.
- Transcrição de áudio (Whisper).
- Distribuição round-robin de leads, filas por departamento.
- Painel CRM lateral, resumo de conversa por IA.

### 📊 CRM
- Kanban de Negociações com drag-and-drop.
- Prospects, Empresas, Tarefas, Agenda, Relatórios.
- Import de Excel com mapeamento configurável.
- Automações de CRM (gatilhos por etapa, tempo, condição).
- Lead Scoring, Lead Webhooks, Lead Distribution.
- Nurturing (sequências programadas).
- Visibilidade hierárquica de deals.

### 📣 Campanhas e Disparos
- Listas de contatos, templates de mensagem multimídia.
- Delays aleatórios, envio agendado, log por mensagem.
- Métricas CTWA (Click-to-WhatsApp).

### 🤖 Automação e IA
- **Fluxos** visuais (drag-and-drop) e **Fluxos Externos** (via webhook).
- **Chatbots** com nós condicionais.
- **Agentes IA** globais + por cliente, RAG (busca por similaridade cosseno em PG).
- Catálogo de agentes globais reaproveitáveis.
- Secretária de Grupos (resumos e follow-ups automáticos).

### 💰 Cobrança (Asaas)
- Integração completa com Asaas (customers, payments, boletos, PIX).
- Regras de notificação: antes/no/depois do vencimento.
- Blacklist de clientes, pausa temporária de cobrança.
- Limite de mensagens por cliente/dia.
- Alertas de inadimplência crítica (email + WhatsApp).
- Fila de cobrança e webhooks Asaas auditados.

### 🛒 Merchandising / Trade Marketing
- **Cadastros**: Redes, PDVs, Marcas, Produtos, Categorias, Equipe.
- Código interno automático por marca (pesquisável).
- **Rotas & Agenda**:
  - Recorrência por dia da semana, **por marca dentro do PDV**.
  - Co-promotor (apoio) na mesma rota.
  - Edição com escopo "apenas esta data" ou "esta e futuras".
  - Ação em massa (superadmin) para apagar rotas selecionadas + futuras.
  - Cards de progresso por marca (verde = 100%, amarelo = parcial, com % e nº de fotos).
- **Execução (Promotor)**: drill-down por marca → categorias → fotos Antes/Depois.
- **Checklists** com quantidade mínima obrigatória, validade e saldo/estoque.
- **Contagem de Saldo** (Estoque + Frente):
  - Salvamento parcial por produto (só Frente ou só Estoque → badge âmbar "Parcial").
  - Prorrogação até fim da semana quando permitido.
  - Dashboard + envio automático de email/PDF/CSV para a marca.
- **Pesquisa de Preços** e **Avarias/Perdas**.
- **Book de Fotos** (PDF customizado com logos, título, subtítulo, data).
- **Auditoria** e **Relatórios programados**.
- **Analytics Merch** (mix PDV, execução, indicadores).

### 👔 RH e Ponto
- Cadastro completo: Colaboradores, Cargos, PDVs, Escalas, Feriados por região.
- **Ponto**:
  - Registro por biometria facial (WebGL + fallback CPU).
  - **Override por funcionário**: seguir organização / sempre exigir / isento.
  - **Ajuste manual** com motivo obrigatório e flag `manual_adjustment`.
  - Monitor em tempo real.
- **Geofence de PDV**:
  - Polígono desenhado no mapa (Leaflet) vence o raio.
  - Botão "Usar centro do polígono" para preencher lat/lng.
  - Ray-casting no backend (`geofence.js`).
- Rastreamento GPS, Live Maps, Mapa Operacional.
- Admissão, Demissão, Advertências, AFD, eSocial, Exames, EPIs, Treinamentos.
- **Holerite em lote** (upload de PDFs, mapeamento por nome, distribuição no app).
- Import/Export por CPF/email (upsert).
- Indicadores, Logs, Documentos, Acessos.

### 🚪 Controle de Acesso (Portaria/Totem)
- Totem com teclado virtual, identidade customizável.
- Reconhecimento facial de promotores/visitantes.
- Verificação de conformidade (documentos, EPIs).
- Score de performance do promotor.
- Dashboard operacional, validações, financeiro.

### 📱 App do Promotor
- Login por CPF + senha padrão (`ayra` + 3 números + 2 letras).
- Home com rotas do dia, drill-down por marca.
- Câmera com `autoOpen`, compressão WebP, upload otimista em background.
- Fila de sincronização concorrente com geolocalização cacheada.
- Histórico, scanner QR, visita, ponto, agenda.
- Modo offline com IndexedDB.
- Splash customizada só no mobile.
- Sem precache PWA em `promoter.ayratech.app.br`.

### 🏢 Portal da Rede e Portal da Agência
- **Rede**: gestão de unidades, PDVs, QR codes, parceiros, requisitos de documentos, aprovação de agências e visitas.
- **Agência**: dashboard, marcas, regras de acesso, folgas, pedidos de rede.

### 🏪 Módulo Supermercado
- Multi-tenant isolado (`supermarket_units` para PDVs).
- Landing page, credenciais separadas (`supermarket_users`).

### ✍️ Assinatura Digital de Documentos
- SHA-256 + OTP + carimbo GMT-3.
- Modelos de contrato, verificação pública por link.

---

## 🚀 Infraestrutura e Deploy

- **Docker Compose** (frontend + backend + volume de uploads).
- Script `./scripts/release.sh` gera imagens versionadas.
- Rollback trocando `VERSION` no `.env`.
- Migrações SQL em `backend/schema-*.sql` (aplicar via `psql`).
- Resiliência: cooldown 60s/10m em 500/524; fallback UTF-8/Latin1 em imports.
- Nginx faz proxy de `/api` e `/uploads` para o backend.

Ver `DEPLOY.md` para o passo a passo completo de release/rollback.

---

## 🗂 Documentos Relacionados

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — diagramas e modelo ER detalhado.
- [`DEPLOY.md`](./DEPLOY.md) — deploy e rollback via Docker.
- [`docs/passo-a-passo.md`](./docs/passo-a-passo.md) — guia operacional por módulo.
- [`docs/promotor-upload-fotos.md`](./docs/promotor-upload-fotos.md) — pipeline de fotos do promotor.
