# 0.27.0 — UX e internacionalização

## Melhorias entregues

| Pedido | Implementação |
|---|---|
| Busca desde a primeira abertura | Catálogo gerado dos formulários em host isolado; pesquisa PT/EN e sinônimos. |
| Desfazer configurações | Última operação de restauração ou favoritos com snapshot por grupo e proteção contra alterações posteriores. Não usa undo do desenho. |
| Comparar antes/depois | Mesmos pontos/pressão com referência anterior e ajuste atual; botão para atualizar a referência. |
| Preservar a amostra | Por vista e página, ao trocar painéis ou calibrar; limpa explicitamente ou ao descarregar a página. |
| Painéis fora da região de trabalho | Escolha de posição com menor sobreposição; evita reposicionamento contínuo. Em vistas pequenas pode não haver espaço livre suficiente. |
| Seleção com caneta | Alvo de 20 px para alças, sem aumentar o desenho das alças; preferência pelo alvo mais próximo e cursor contextual. |
| Favoritos | Renomear, atualizar, reordenar por arraste/setas e remover; desfazer com guarda de estado. |
| Campos alterados | Parâmetros finos do pincel marcados em relação à abertura; restauração individual. |
| Ajuda contextual | Details acessível por teclado com explicação e ilustração SVG de suavização, estabilização e curva de pressão. |
| Avisos menos invasivos | Informações do canvas são agrupadas/adiadas enquanto há um traço ativo. Erros de gravação via Notice não passam por essa fila. |

## Idiomas

Abra **••• → Interface e gestos → Idioma**. Há Automático, Português (Brasil) e English. Automático consulta o idioma do documento da aplicação, depois o do navegador; português usa pt-BR, os demais usam inglês. A escolha é salva no vault e atualiza as vistas abertas. Os nomes dos comandos registrados no carregamento do plugin acompanham o idioma após recarregar o plugin.

O catálogo em `src/core/i18n.js` reúne mais de 800 mensagens de botões, menus, campos, descrições e acessibilidade. Textos não catalogados têm fallback em português, inclusive erros raros e alguns estados dinâmicos. Não se afirma cobertura de tradução de 100% de todos os caminhos possíveis. Textos do desenho, valores de campos e nomes marcados como conteúdo do usuário não são traduzidos. Labels canônicos são usados onde ações existentes dependiam de texto.

Novos textos devem ser incluídos no catálogo. Para atualizar a busca após alterar formulários: execute build, `node scripts/settings-catalog.cjs`, build e testes. O gerador usa dados fictícios e não abre arquivos de usuário.

## Evidências e limites

23 suítes headless aprovadas; auditoria de 51 telas/estados e 475 ocorrências de botões vinculadas a eventos. Os testes específicos verificam undo de preferências com conflito, amostras sem mutação do documento, busca inicial, favoritos, hit targets e posição estável. A internacionalização é verificada com nós de texto e atributos, preservando a fonte canônica e o conteúdo do usuário.

Ainda não houve validação visual real desta versão no Obsidian, teste físico de mesa, sessões longas ou verificação de todas as combinações de tema/escala. O ambiente não tem Chromium funcional. Esta versão é adequada para validação de uso; os resultados automatizados não constituem certificação de estabilidade para produção ou 1.0.

## Atualização

Substitua os arquivos do plugin e preserve data.json e os desenhos. Recarregue o plugin. As preferências existentes são mantidas; o idioma novo assume Automático quando não configurado.
