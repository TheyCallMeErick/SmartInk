# Subir o Smart Ink no GitHub

## Publicar pela primeira vez

1. Crie um repositório **vazio** no GitHub, com nome `smart-ink` (não marque README nem licença: já temos README, e a licença própria precisa ser decidida).
2. Extraia o ZIP do projeto no seu computador.
3. No terminal dentro da pasta do projeto:

```bash
node --version            # Node 20 ou superior
npm run verify            # Compila, testa e empacota
git init
git add .
git commit -m "Initial source structure for Smart Ink 0.13.1"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/smart-ink.git
git push -u origin main
```

Os artefatos `main.js`, `styles.css` e `releases/` são ignorados no Git por serem gerados. A primeira compilação no clone se faz com `npm run build`.

## Criar uma versão

1. Faça as alterações em `src/`.
2. Atualize `version` no `package.json` e `manifest.json` para o mesmo valor.
3. Execute `npm run verify` (inclui ZIP para instalar localmente).
4. Faça commit, push e tag:

```bash
git add .
git commit -m "Release Smart Ink 0.12.1"
git push
git tag v0.12.1
git push origin v0.12.1
```

A pipeline de release usa `gh` disponibilizado nos runners do GitHub Actions e cria um GitHub Release com o ZIP compilado. O `GITHUB_TOKEN` precisa de permissão `contents: write` (já solicitado no workflow), e a configuração de Actions deve permitir execução. Ajuste a estratégia se precisar de aprovação manual.

## Fluxo de desenvolvimento

```bash
npm run dev         # Rebuild automático ao editar src/
npm run verify      # Faça antes do commit
```

Para testar com o Obsidian, copie os arquivos compilados da raiz para `.obsidian/plugins/smart-ink/` ou instale o ZIP de `releases/`. **Nunca sobrescreva `data.json`.**

## Licenciamento

O código original do plugin foi recebido sem arquivo de licença. Embora os avisos de terceiros tenham sido preservados, **não atribua licença MIT/Apache ao conjunto sem confirmar que você detém os direitos do código**. Se optar por publicar o repositório publicamente, revise sua titularidade e as licenças dos componentes incluídos.
