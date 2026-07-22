# 📚 Ayratech — Plataforma para Empresas de Merchandising

> SaaS operacional para **agências e empresas de trade marketing / merchandising** gerenciarem promotores em campo, PDVs, execução de rotas, contagens, checklists com foto, ponto, biometria, geofence, holerites e comunicação com marcas.

Foco principal: **Merchandising + RH de campo**.
Módulos auxiliares (Chat WhatsApp, CRM, Cobrança, IA) existem no mesmo sistema, mas são complementares.

Atualizado: **Julho/2026** · Timezone: `America/Sao_Paulo`

---

## 🧭 Sumário

1. [Como o sistema funciona](#-como-o-sistema-funciona)
2. [Perfis de usuário](#-perfis-de-usuário)
3. [Módulo Merchandising / Trade](#-módulo-merchandising--trade)
4. [Módulo RH e Ponto de Campo](#-módulo-rh-e-ponto-de-campo)
5. [App do Promotor](#-app-do-promotor)
6. [Controle de Acesso e Totem](#-controle-de-acesso-e-totem)
7. [Portais da Rede e da Agência](#-portais-da-rede-e-da-agência)
8. [Módulos complementares](#-módulos-complementares)
9. [Arquitetura técnica](#-arquitetura-técnica)

---

## 🎯 Como o sistema funciona

O fluxo central do negócio é:

```text
Marca (cliente da agência)
   │
   ▼
Rede de varejo → PDVs (com geofence poligonal)
   │
   ▼
Agência de Merchandising (organização no sistema)
   │
   ├── cadastra Promotores, Cargos, Escalas
   ├── monta Rotas recorrentes (por dia da semana e por marca)
   ├── define Checklists (fotos Antes/Depois, contagem, pesquisa preço)
   │
   ▼
Promotor no App
   ├── bate ponto com biometria facial + geofence
   ├── executa rota: fotos, contagem de estoque, pesquisa de preço, avarias
   ├── envia tudo em background (fila offline)
   │
   ▼
Agência acompanha em dashboards e envia relatórios (PDF/CSV) para as Marcas
```

---

## 👥 Perfis de usuário

| Perfil | Onde acessa | O que faz |
|--------|-------------|-----------|
| **Superadmin** (`tnicodemos@gmail.com`) | `/` | Gestão global do SaaS, manutenção em massa |
| **Owner / Admin / Manager** | `/` | Gestão da agência: cadastros, rotas, dashboards |
| **Agente / Supervisor** | `/` | Acompanha promotores, valida entregas |
| **Promotor** | `promoter.ayratech.app.br` | App mobile: rotas do dia, fotos, ponto |
| **Rede (varejo)** | `/network` | Cadastra unidades, aprova agências, define requisitos |
| **Agência (parceira)** | `/agency` | Marcas, pedidos, folgas, regras de acesso |
| **Totem** | `/totem` | Reconhecimento facial na portaria do PDV |

Roles fixas + **Templates de Permissão dinâmicos (JSONB)** para casos específicos.

---

## 🛒 Módulo Merchandising / Trade

Núcleo do sistema. Prefixo de tabelas: `merch_`.

### Cadastros base
- **Redes** (`merch_redes`) e **PDVs** vinculados (`merch_rede_pdvs`).
- **Marcas** (`/merch/marcas`): código interno auto-gerado, pesquisável em toda a plataforma.
- **Produtos** (`/merch/produtos`): vinculados à marca; import em lote via Excel com fallback UTF-8/Latin1.
- **Categorias** (`/merch/categorias`): agrupam checklists.
- **Contratos de Marca** (`/merch/contratos`): regras comerciais por marca.
- **Equipe** (`/merch/equipe`): promotores ativos e regionais.

### Checklists e regras de execução
- Quantidade **mínima de fotos** por categoria.
- Fotos **Antes/Depois** obrigatórias (não é possível concluir sem as duas).
- Regras de **validade** e **saldo/estoque**.
- Regras de **contagem** por marca (definem os produtos esperados).

### Rotas e Agenda (`/merch/rotas`)
- Cria rota: Promotor + PDV + Marcas.
- **Recorrência por dia da semana**.
- **Recorrência independente por marca** dentro do mesmo PDV
  (ex.: Marca A Seg/Qua/Sex, Marca B Ter/Qui).
- **Co-promotor (apoio)**: 2º promotor pode entrar na mesma rota.
- Ao editar: sistema pergunta **"Apenas esta data"** ou **"Esta e todas as futuras"**.
- **Ação em massa (superadmin)**: selecionar várias rotas e apagar **estas + futuras** (manutenção).
- Cards de progresso por marca:
  - 🟢 verde = 100%
  - 🟡 amarelo = parcial (mostra % e nº de fotos batidas)
- Botão **Concluir Rota** só aparece quando todas as marcas estão 100%.

### Execução no PDV (drill-down)
1. Promotor vê lista de **marcas** do PDV (verde/amarelo).
2. Clica na marca → tela dedicada com as **categorias** daquela marca.
3. Categoria abre a **câmera automaticamente** (`autoOpen`).
4. Foto capturada é **aprovada e sobe em background** (upload otimista + WebP + fila concorrente).
5. Ao voltar, thumbnails aparecem imediatamente (otimista).
6. Categoria concluída, mas pode **adicionar mais fotos** (respeitando regra Antes/Depois — não pode tirar Antes se já tem Depois).

### Contagem de Saldo (Estoque)
- Definida por regra de contagem da marca.
- Promotor pode salvar **parcial**:
  - Só **Estoque** → badge âmbar "Parcial — falta Frente".
  - Só **Frente** → badge âmbar "Parcial — falta Estoque".
  - Ambos → 🟢 100%, produto vira verde.
- Backend só sobrescreve o campo enviado (não zera o outro).
- Progresso total calculado pela **regra da marca**, não pelo payload.
- **Prorrogação semanal**: promotor pode dizer "não fiz hoje" → passa para próxima visita da semana (parecido com pesquisa de preço). Não passa da semana.

### Pesquisa de Preços e Avarias
- `/merch/pesquisa-precos` e `/merch/perdas` (ou `/promotor/avarias`).
- Fotos + campos numéricos + observações.

### Book de Fotos (`/merch/book-fotos`)
- PDF customizado: **logo do cliente + logo da marca + título + subtítulo + data**.
- Cada produto listado linha a linha com estoque, frente e total.
- Exportação **CSV**.
- Link público para compartilhar com a marca (com fallback de queries).

### Auditoria, Analytics, Relatórios
- `/merch/auditoria`, `/merch/dashboard`, `/merch/relatorios`, `/merch/mix-pdv`.
- `/merch/relatorios-programacao`: **agenda envio automático por email** para a marca com resumo do dia após a conclusão da rota.
- Dashboards de contagem (`/merch/contagem-dashboard`) e pesquisa (`/merch/pesquisa-dashboard`).

---

## 👔 Módulo RH e Ponto de Campo

Voltado à realidade de agência de merchandising (equipe distribuída, ponto em PDV do cliente).

### Cadastros
- `/rh/colaboradores`, `/rh/cargos`, `/rh/escalas`, `/rh/feriados` (regiões), `/rh/pdvs`.
- Máscaras de CPF/CNPJ, endereço, LGPD.
- Import/Export em lote com **upsert por CPF ou email**.

### PDV com Geofence poligonal
- Editor Leaflet em `/rh/pdvs`.
- Desenha **polígono** clicando no mapa (mínimo 3 pontos).
- **Polígono vence o raio** (ray-casting no backend, `geofence.js`).
- Botão **"Usar centro do polígono"** preenche Lat/Lng automaticamente.
- Raio permanece como fallback caso o PDV não tenha polígono.

### Ponto
- App do promotor ou **Totem** na portaria.
- **Biometria facial** obrigatória com WebGL + fallback CPU (distância euclidiana até 0.6).
- **Override por funcionário**: seguir organização / sempre exigir / **isento**.
- Prioridade: override do funcionário > configuração da organização.
- **Ajuste manual** em `/rh/ponto`:
  - Requer **motivo obrigatório**.
  - Marcado com flag `manual_adjustment` visível no histórico.
- Monitor em tempo real (`/rh/ponto-monitor`) e Mapa Operacional (`/rh/mapa-operacional`).
- Rastreamento GPS (`/rh/rastreamento`).

### Holerite em lote (`/rh/holerite`)
1. Upload de **vários PDFs** de uma vez.
2. Sistema mapeia cada PDF a um colaborador pelo nome do arquivo.
3. Interface para **ajustar mapeamento** manualmente.
4. Botão único: **distribui todos** no app dos promotores.

### Demais telas
- Admissão, Demissão, Advertências, AFD, eSocial, Exames Ocupacionais, EPIs, Treinamentos, Biometria, Documentos, Acessos, Indicadores, Logs.

---

## 📱 App do Promotor

Domínio: `promoter.ayratech.app.br` (PWA **sem precache**).

- Login: **CPF + senha padrão** = `ayra` + 3 números + 2 letras (ex.: `ayra473KL`).
- Home: rotas do dia com cards de PDV.
- Drill-down por Marca → Categorias (descrito acima).
- **Câmera**:
  - `autoOpen` (não precisa clicar 2x).
  - Compressão **WebP** em worker.
  - **Watermark** com PDV, marca, promotor, data/hora, GPS.
  - Upload **otimista em background**; fila concorrente.
  - Modo offline com IndexedDB (`pending_uploads`, `pending_api_calls`).
- Ponto, agenda, avarias, pesquisa de preço, contagem de saldo, histórico.
- Splash customizada só no mobile.

Pipeline técnico de foto: [`docs/promotor-upload-fotos.md`](./docs/promotor-upload-fotos.md).

---

## 🚪 Controle de Acesso e Totem

- `/totem`: reconhecimento facial na entrada do PDV, teclado virtual.
- Identidade customizável (logo da rede/agência).
- `/admin/access-control-dashboard`: painel operacional, validações, financeiro, promotores.
- Verificação de conformidade (documentos, EPIs, foto).
- Score de performance do promotor (fórmulas com pesos configuráveis).

---

## 🏢 Portais da Rede e da Agência

### `/network` — Rede de varejo (cliente)
- Cadastro de unidades e PDVs.
- **QR codes** por PDV para check-in.
- Requisitos de documentos exigidos das agências.
- Aprovação de cadastro de agências e de visitas.
- Parceiros e páginas customizadas.

### `/agency` — Agência parceira
- Dashboard, marcas atendidas, folgas, regras de acesso.
- Envio de pedidos de acesso à rede.
- Cadastro público (`/agency/signup`).

### `/supermarket` — Módulo Supermercado
- Multi-tenant isolado. PDVs em `supermarket_units`.
- Login em `supermarket_users`.

---

## 🧩 Módulos complementares

Presentes no sistema mas **não são o foco** — servem para comunicação com marcas/clientes e cobrança da própria agência:

- **Chat WhatsApp** (`/chat`): Evolution / W-API / Meta Cloud. Tags, respostas rápidas, notas, transcrição.
- **CRM leve**: Prospects, Empresas, Negociações (Kanban), Automações — útil para gerir clientes/marcas da agência.
- **Cobrança Asaas** (`/cobranca`): boletos/PIX para os clientes da agência, com blacklist, pausa, limite diário, alertas de inadimplência.
- **IA e Fluxos**: chatbots, agentes globais, RAG (cosine_similarity no PostgreSQL), secretária de grupos.
- **Assinatura Digital**: SHA-256 + OTP + carimbo GMT-3, verificação pública.

---

## 🏗 Arquitetura técnica

| Camada | Stack |
|--------|-------|
| Frontend | React 18 + Vite + TypeScript + TanStack Query |
| UI | Tailwind + shadcn/ui + Radix + Leaflet |
| Backend | Node.js **ESM** + Express |
| Banco | PostgreSQL com **Just-in-Time Schema** (`ensureTables` antes de I/O) |
| Auth | JWT com contexts multi-portal |
| Facial | WebGL priorizado, CPU como fallback |
| Deploy | Docker + Nginx + Easypanel |
| Timezone | `America/Sao_Paulo` global (evitar `.toISOString()`) |

Resiliência:
- Cooldown de 60s / 10min em erros 500/524.
- Fallback UTF-8/Latin1 em imports.
- Fila offline concorrente com geolocalização cacheada.

---

## 🗂 Outros documentos

- [`docs/passo-a-passo.md`](./docs/passo-a-passo.md) — guia operacional passo a passo.
- [`docs/promotor-upload-fotos.md`](./docs/promotor-upload-fotos.md) — pipeline de fotos do promotor.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — diagramas técnicos.
- [`DEPLOY.md`](./DEPLOY.md) — release e rollback via Docker.
