# Smart Ink 0.25.0 — perfis e configurações

## Alterações

Os cinco perfis de ajuste de caneta (Letra pequena, Escrita, Caligrafia, Diagramas e Desenho) e os presets prontos agora usam cards com ícone SVG e texto. As ações e os valores dos perfis foram preservados.

O botão ••• abre uma central de configurações sobre o canvas, com oito categorias: Documento, Interface e gestos, Atalhos e favoritos, Biblioteca de pincéis, Precisão e encaixes, Menu radial, Mesa digitalizadora, Navegação e medidas. Os formulários e handlers existentes são reutilizados; Arquivo e segurança permanece em Documento, incluindo backups, exportação, recuperação e diagnóstico. Painéis secundários continuam dentro da central até uma ação que explicitamente feche o painel.

A central ocupa no máximo 860 × 680 pixels dentro da área útil. Em larguras inferiores a 560 pixels, as categorias passam para a parte superior, com rolagem própria. O conteúdo rola independentemente, sem redimensionar o canvas. Tab fica no modal, o canvas fica inerte, Escape/fechar devolve o foco ao botão de abertura. Campos, seleção de arquivos e botões usam cores do tema e foco visível; controles especiais de cor, faixa e checkbox mantêm seus formatos.

## Evidências e limites

- Build reproduzível, sintaxe e versões consistentes.
- 20 suítes headless aprovadas.
- Auditoria de 51 telas/estados: 464 ocorrências de botões com eventos associados. Isso não equivale a executar todas as ações possíveis em Obsidian.
- Teste novo compara os campos das categorias com os formulários originais, exercita cards, troca de categoria, edição de papel, foco e limites de tamanho.
- Sem validação visual real no Obsidian nesta execução. O ambiente não dispõe de Chromium funcional; testes usam DOM e host simulados. Verificar temas claro/escuro, Tab/Shift+Tab, Escape, painel estreito, arquivos e mesa física antes de considerar produção.

## Instalação

Substitua main.js, styles.css e manifest.json na pasta do plugin e recarregue-o. Preserve data.json e os desenhos existentes. Não há migração de preferências nesta versão.
