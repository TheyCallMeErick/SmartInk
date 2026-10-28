# Smart Ink 0.18.0

## Uso e comportamento

A barra de seleção flutua no centro inferior do canvas. Pertence ao viewport e usa posicionamento absoluto, sem participar das linhas flex/grid da página. Sua abertura não altera a câmera, o zoom ou o espaço do canvas. Ações adicionais ficam em Mais ações da seleção; controles têm rolagem horizontal em janelas estreitas.

Botões Aplicar, Confirmar e Concluir ganham destaque; Cancelar e Manter desenho são secundários. Nas prévias de edição, Aplicar alterações e Cancelar ficam em um rodapé aderente. Ctrl/Cmd+Enter aplica apenas dentro dessa prévia; Esc cancela. O foco retorna ao canvas depois da decisão.

Clique no canvas e use Ctrl+V/Cmd+V para colar imagens copiadas como imagem, incluindo capturas de tela. PNG, JPEG e WebP são decodificados localmente, sem rede. URLs e HTML não são buscados. Campos de texto e conteúdo editável mantêm a colagem normal.

Limites: até 8 arquivos, 8 MB por arquivo, 16 MB por lote e 40 milhões de pixels por imagem. O lado máximo usa a preferência existente de imagens. O lote entra no centro visível original, com deslocamento de 24 px entre imagens, e fica selecionado para mover/redimensionar. Um desfazer remove o lote inteiro. O documento completo é validado antes de inserir.

A página e a camada originais são revalidadas após a decodificação; troca de página, bloqueio e imagem inválida impedem a inserção. Imagens continuam incorporadas ao documento e usam recorte, exportação e persistência existentes. Esquema 9 preservado.

## Validação

Doze suítes headless cobrem recursos anteriores e novos casos: posição da barra na árvore DOM, ações adicionais, confirmação/atalho/desfazer, decodificação simulada, lote com desfazer/refazer, encaminhamento de paste, limites inválidos e troca de sessão durante leitura.

O teste opcional scripts/browser-smoke.cjs foi ampliado com comparação dos retângulos do canvas antes/depois da seleção nas quatro posições da barra e colagem por ClipboardEvent. Não executou: Chromium não está instalado no ambiente. Testes headless não comprovam layout visual nem a área de transferência nativa. Validar no Obsidian real, janelas estreitas, temas claro/escuro, capturas copiadas no sistema e mesa digitalizadora.

## Atualização

Desative o plugin e substitua main.js, styles.css, manifest.json e THIRD-PARTY-NOTICES.txt na pasta .obsidian/plugins/smart-ink; reative. Preserve data.json e os documentos .smartink. O ZIP de instalação não contém preferências pessoais.
