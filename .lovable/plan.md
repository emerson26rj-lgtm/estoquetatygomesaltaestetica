# Plano de implementação — 7 melhorias

Vou dividir em **3 fases** para entregar valor incremental e você poder testar cada bloco antes do próximo. Cada fase inclui migração de banco + código + validação.

---

## Fase 1 — Base financeira e paginação (fundação)

**1. Paginação em todas as listas**
- Adicionar paginação de 25/50/100 registros em: Clientes, Produtos, Movimentações, Serviços, Fornecedores, Agenda, Anamneses, Auditoria.
- Componente reutilizável `<DataPagination>` com busca + contagem total.
- Impacto: sistema pronto para milhares de registros sem travar.

**2. Módulo Financeiro completo**
- Novas tabelas: `financial_accounts` (contas a pagar/receber), `financial_categories`, `commissions` (comissão por profissional/serviço).
- Nova página `/financeiro` com abas: Contas a Pagar, Contas a Receber, Fluxo de Caixa, Comissões.
- Marcar como pago/recebido, filtros por período, exportação.
- Integração automática: agendamento concluído → gera receita; movimentação de saída → gera despesa (opcional).

**3. KPIs financeiros no Dashboard**
- Novos cards: Faturamento do mês, Ticket médio por cliente, Contas em aberto, Comissão total.
- Novos gráficos: Faturamento por profissional, Serviços mais rentáveis, Fluxo mensal (6 meses).

---

## Fase 2 — Prontuário e assinatura (foco no cliente)

**4. Prontuário fotográfico (antes/depois)**
- Novo bucket de Storage `prontuario` (privado, RLS por cliente).
- Nova tabela `client_photos` (cliente_id, sessão, tipo: antes/depois/evolução, url, descrição, data).
- Interface na ficha do cliente: galeria com upload múltiplo, comparação lado a lado, agrupamento por sessão.

**5. Assinatura digital na anamnese**
- Canvas HTML5 para o cliente assinar com dedo/mouse.
- Salvar assinatura como base64 no campo novo `assinatura_cliente` + `assinatura_data` na tabela `anamneses`.
- Assinatura aparece no PDF impresso/exportado.

**6. Impressão otimizada da ficha de anamnese**
- Layout de impressão dedicado (CSS `@media print`) — cabeçalho da clínica, dados do cliente, ficha completa, campo de assinatura.
- Botão "Imprimir" e "Baixar PDF individual" na tela de anamnese.
- PDF profissional com jspdf-autotable (já instalado).

---

## Fase 3 — Inteligência (IA preditiva)

**7. Previsão de consumo com IA**
- Nova página `/previsoes` (admin).
- Server function que agrega histórico de movimentações dos últimos 90 dias por produto.
- Envia dados para Lovable AI (Gemini) que retorna: consumo médio/dia, dias até esgotar, quantidade sugerida de compra, produtos em risco.
- Tabela visual com semáforo (verde/amarelo/vermelho) + botão "Gerar pedido de compra" (PDF).

---

## Aspectos técnicos

- Todas as tabelas novas: RLS + GRANT + policies por role (admin vs usuário).
- Bucket `prontuario`: privado, policies scoped por `auth.uid()`.
- Paginação: usar `range()` do Supabase, não carregar tudo em memória.
- IA: usar `google/gemini-3.5-flash` (rápido e barato para análise numérica).
- Sem alterações destrutivas em tabelas existentes — só ALTER TABLE ADD COLUMN quando necessário.

---

## Ordem sugerida de execução

Recomendo começar pela **Fase 1** (financeiro + paginação + KPIs) porque:
- É a base que impacta o dia-a-dia da clínica imediatamente.
- Sem paginação, o sistema começa a ficar lento em breve.
- Financeiro é o módulo mais pedido em clínicas.

**Confirma:** posso começar pela Fase 1 completa? Ou prefere outra ordem / quer que eu detalhe algum item antes?
