# Contribuindo

- Desenvolva em `src/`, não diretamente nos arquivos gerados na raiz.
- Execute `npm run format` ao editar JavaScript ou CSS; os bundles em `src/vendor/` são de terceiros e não são reformatados.
- Execute `npm run verify` antes de abrir um PR.
- Preserve a compatibilidade dos documentos `.smartink` (esquema v7) e das preferências.
- Adicione testes para menu, camadas, encaixes, pressão, zoom e undo/redo ao mudar essas rotinas.
- Não inclua `.smartink` pessoais, tokens, `data.json` do usuário ou outros arquivos do vault.
- Indique no PR quais cenários foram testados no Obsidian real (SO, versão, dispositivo).
- Evite dependências e acesso à rede em execução sem uma justificativa técnica clara.
