# Escola de Música IBH

Aplicação interna de gestão da Escola de Música da Igreja Batista Horizonte. O frontend usa Vite, TypeScript, HTML, Tailwind CSS e Lucide. Supabase Auth, PostgreSQL e a Data API cuidam da sessão, das permissões e da persistência.

## Configurar o Supabase

1. Crie um projeto Supabase e mantenha a Data API habilitada para o schema `public`.
2. Em um projeto novo, aplique os arquivos de supabase/migrations/ em ordem numérica. Em um banco existente, aplique apenas as migrações pendentes. A [007](supabase/migrations/007_acesso_exclusivo_equipe.sql) encerra o acesso de aluno e preserva os cadastros existentes.
3. Em Authentication, mantenha **Allow new users to sign up** e **Allow anonymous sign-ins** desabilitados. Crie a primeira conta de administrador pelo painel e confirme seu e-mail antes de ativar o perfil. [Configuração do Supabase Auth](https://supabase.com/docs/guides/auth/general-configuration)
4. Copie o UUID da primeira conta e crie seu perfil no SQL Editor como operador do projeto.

```sql
insert into public.profiles (id, name, role)
values ('UUID_COPIADO_DO_PAINEL', 'Nome completo', 'admin');
```

5. Para criar contas pela Administração, publique a função `create-teacher` pelo CLI autenticado. A função valida a sessão e exige um perfil ativo de administrador. Ela usa as chaves injetadas pelo Supabase e funciona com o app em localhost.

```sh
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy create-teacher --no-verify-jwt
```

Pelo painel, publique [create-teacher](supabase/functions/create-teacher/index.ts) em **Edge Functions → Deploy a new function → Via Editor**. Substitua o código do modelo pelo conteúdo do arquivo e use o nome `create-teacher`. Nos detalhes da função, desative a verificação JWT legada. A própria função valida o token e confere a permissão no banco. [Publicação pelo painel](https://supabase.com/docs/guides/functions/quickstart-dashboard) · [Verificação JWT legada](https://supabase.com/kb/troubleshooting/edge-function-401-error-response)

6. Em **Administração → Professores → Novo professor**, informe nome, e-mail, senha inicial e permissão e clique em **Cadastrar professor**. Confirme com a pessoa o endereço correto antes de cadastrá-la. Com o acesso ativo, ela pode entrar com as credenciais imediatamente. Para vincular uma conta existente, informe o e-mail e deixe a senha em branco.
7. Para aproveitar um cadastro anterior, abra **Cadastros antigos sem conta** e vincule o e-mail ali. Para seu próprio vínculo, escolha **Administrador** e mantenha o acesso ativo. A recuperação pelo botão **Esqueci a senha** é opcional e requer configuração de e-mail e redirecionamento no Supabase. O cadastro e o login com senha funcionam sem SMTP.

**Permissões.** Professores com acesso ativo podem criar, gerar e editar encontros, excluir encontros sem registro, gerenciar alunos e registrar as próprias aulas. Administradores também gerenciam professores, acessos, modalidades, configurações e registros de outros professores. Desativar um acesso no app bloqueia o perfil no banco e retira o professor das novas atribuições. Uma atribuição antiga permanece no histórico.

Em **Administração → Cadastros antigos sem conta**, **Excluir cadastros sem uso** remove professores sem conta e sem encontros ou registros associados.

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
- **Escalas** organiza os encontros por mês. Gere as datas, abra cada encontro e escolha um professor ativo com conta vinculada e acesso ativo. As modalidades no cadastro do professor servem para consulta. Um encontro por modalidade e data. Cancelamentos preservam o calendário e liberam o horário do professor. O conflito é a coincidência de dia e horário inicial, pois o MVP não usa duração de aula.
- **Registros** permite filtrar o histórico por modalidade. Ao abrir qualquer encontro, a tela consulta o registro da mesma modalidade com data imediatamente anterior que tenha conteúdo registrado. Salvar o registro após o início marca a aula como realizada.
- **Alunos** permite cadastrar várias modalidades, cada uma com data de ingresso e situação próprias.
- **Exclusões.** Professores e administradores podem excluir encontros sem registro e remover alunos e seus vínculos. A exclusão de registros de aula é reservada a administradores.
- **Administração** permite gerenciar professores, vincular contas provisionadas, alterar modalidades e personalizar a frequência, o local e o horário padrão.

## Verificar

```sh
npm test
npm run build
```

Após aplicar as migrações, execute [fluxos.sql](supabase/tests/fluxos.sql) em um projeto de desenvolvimento. O script usa uma transação com rollback. Verifique uma sessão de administrador e outra de professor no navegador.

## Gerar o APK Android

O projeto Android em `android/` usa Capacitor e incorpora o mesmo frontend Vite. Ele usa o Supabase configurado em `.env.local` e as mesmas credenciais do site.

Com Node.js, JDK 21 e Android SDK 36 configurados, execute no PowerShell:

```powershell
npm ci
npm run android:sync
Set-Location android
.\gradlew.bat :app:assembleDebug
```

O APK de teste fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Rode `npm run android:sync` antes de recompilar depois de editar o frontend. A recuperação de senha por e-mail iniciada no aplicativo abre a versão web publicada.

## Publicar na Vercel

Envie o código para um repositório privado no GitHub, mantendo `.env.local` fora do Git. Na Vercel, importe o repositório, selecione Vite e Node.js 22.x, configure as duas variáveis de ambiente e inicie o deploy quando autorizado. O build é `npm run build` e a saída é `dist`. A navegação por fragmentos mantém as rotas funcionando após recarregar a página. Defina a URL da aplicação como **Site URL** nas configurações de Auth do Supabase. [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite)

## Estrutura

- `src/main.ts` mantém sessão e navegação.
- `src/pages/` contém as telas e operações dos formulários.
- `src/services/db.ts` concentra as consultas do Supabase.
- `src/components/`, `src/lib/` e `src/styles/` contêm os componentes e utilitários compartilhados.
- `supabase/migrations/` e `supabase/tests/` contêm o banco e os testes de integração SQL.
