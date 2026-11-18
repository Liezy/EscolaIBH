# Escola de Música IBH

Aplicação interna de gestão da Escola de Música da Igreja Batista Horizonte. O frontend usa Vite, TypeScript, HTML, Tailwind CSS e Lucide. Supabase Auth, PostgreSQL e a Data API cuidam da sessão, das permissões e da persistência.

## Configurar o Supabase

1. Crie um projeto Supabase e mantenha a Data API habilitada para o schema `public`.
2. No SQL Editor de um projeto novo, execute [001_escola.sql](supabase/migrations/001_escola.sql) uma vez. A migração cria o esquema, aplica RLS e cadastra o local, a data de início de 22/11/2026, o segundo e quarto domingo às 9h, Violão e Bateria e os cinco professores. A administração pode editar esses valores no sistema.
3. Nas configurações de Auth, habilite o provedor de e-mail e desabilite **Allow new users to sign up** e **Allow anonymous sign-ins**. Crie as contas pelo painel **Authentication → Users**, com e-mail real, senha forte e confirmação quando apropriada. [Configuração do Supabase Auth](https://supabase.com/docs/guides/auth/general-configuration)
4. Copie o UUID mostrado pelo painel e execute no SQL Editor como operador do projeto. Use `admin` para o administrador inicial e `teacher` para as contas de professores. Repita para cada usuário.

```sql
insert into public.profiles (id, name, role)
values ('UUID_COPIADO_DO_PAINEL', 'Nome completo', 'admin');
```

5. Entre como administrador, abra **Administração → Professores**, edite cada professor e selecione a conta correspondente. O calendário aceita professores antes da vinculação. Para revogar o acesso ao sistema, desative o perfil no SQL Editor com `update public.profiles set active=false where id='UUID_DA_CONTA';`. Desativar o professor na interface impede novas atribuições e novos registros de sua autoria. A conta e o perfil de acesso são geridos pelo operador do Supabase.

## Executar localmente

Use Node.js 22.18+ na série 22. No PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Preencha `.env.local` com a URL HTTPS do projeto em `VITE_SUPABASE_URL` e a chave **Publishable** em `VITE_SUPABASE_PUBLISHABLE_KEY`. Reinicie o Vite após editar as variáveis. O Vite incorpora essas duas variáveis no bundle público. Guarde as chaves privilegiadas fora do frontend e do Git.

## Usar o sistema

- **Início** mostra a data do próximo encontro, os professores escalados, a próxima aula pessoal e o último registro de cada modalidade ativa.
- **Escalas** organiza os encontros por mês. Gere as datas, abra cada encontro e escolha o professor. Um encontro por modalidade e data. Cancelamentos preservam o calendário e liberam o horário do professor. O conflito é a coincidência de dia e horário inicial, pois o MVP não usa duração de aula.
- **Registros** permite filtrar o histórico por modalidade. Ao abrir qualquer encontro, a tela consulta o registro da mesma modalidade com data imediatamente anterior que tenha conteúdo registrado. Salvar o registro após o início marca a aula como realizada.
- **Alunos** permite cadastrar várias modalidades, cada uma com data de ingresso e situação próprias.
- **Administração** permite gerenciar professores, vincular contas provisionadas, alterar modalidades e personalizar a frequência, o local e o horário padrão.

## Verificar

```sh
npm test
npm run build
```

Após aplicar a migração, execute [fluxos.sql](supabase/tests/fluxos.sql) em um projeto de desenvolvimento dedicado. O script usa uma transação com rollback. Verifique no navegador uma sessão de administrador e outra de professor para validar login, logout, autorização e consultas pela Data API.

## Publicar na Vercel

Envie o código para um repositório privado no GitHub, mantendo `.env.local` fora do Git. Na Vercel, importe o repositório, selecione Vite e Node.js 22.x, configure as duas variáveis de ambiente e inicie o deploy quando autorizado. O build é `npm run build` e a saída é `dist`. A navegação por fragmentos mantém as rotas funcionando após recarregar a página. Defina a URL da aplicação como **Site URL** nas configurações de Auth do Supabase. [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite)

## Estrutura

- `src/main.ts` mantém sessão e navegação.
- `src/pages/` contém as telas e operações dos formulários.
- `src/services/db.ts` concentra as consultas do Supabase.
- `src/components/`, `src/lib/` e `src/styles/` contêm os componentes e utilitários compartilhados.
- `supabase/migrations/` e `supabase/tests/` contêm o banco e os testes de integração SQL.
