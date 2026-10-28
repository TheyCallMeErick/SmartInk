# Smart Ink 0.23.0

## Uso

Abra Inserir forma. A galeria mostra todas as famílias em seções visuais, com busca por nome ou família. Clique na miniatura: o painel fecha e o desenho por arraste fica ativo imediatamente. A barra flutuante oferece Trocar forma e Propriedades. O painel de propriedades abre à direita, sobre o canvas, sem reduzir nem deslocar o desenho. Pode ser arrastado e fechado. Ao desenhar, o painel de configuração de próximas formas permanece aberto.

Ative Usar tamanho fixo para definir largura/altura em unidades do canvas. Sem isso, arrastar define as dimensões. Shift e Alt continuam restringindo proporções e usando o centro. Formas matematicamente regulares mantêm as proporções; o limite de desenho continua sendo respeitado.

Para editar, selecione uma forma e abra Parâmetros da forma (ou Editar forma criada na barra da ferramenta). O painel oferece largura, altura, rotação e os parâmetros específicos: arredondamento relativo ao menor lado, lados, pontas, raio interno, ângulos, voltas ou deslocamento. Círculos não recebem controles de arredondamento; parâmetros aparecem somente onde são pertinentes. Retângulos e quadrados aceitam arredondamento de 0 a 50%; o retângulo arredondado mantém sua opção histórica de 1 a 50%. Cantos seguem a aproximação poligonal existente, não curvas Bézier exatas.

A edição mostra prévia sem alterar o documento. Aplicar alterações (Ctrl/Cmd+Enter) registra uma operação que pode ser desfeita. Cancelar/fechar descarta. Revisão/session guards rejeitam aplicação após mudança do documento. Formas com recortes de borracha usam os controles de transformação existentes para evitar reconstrução destrutiva. A reconstrução preserva identificadores, grupos e links.

## Botões

Estilo compartilhado para ações diretas dos flyouts, menus e acordeões: linhas de largura uniforme, fundo neutro, hover, ícones antes do texto e quebra de linha. Tiles, swatches, campos, navegação e botões de confirmação mantêm sua semântica visual. Não se converte toda lista em grade: ações textuais continuam legíveis em linhas, eliminando as larguras irregulares da captura enviada.

## Referências

- https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools
- https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing

A inspiração é a separação entre escolher a ferramenta e ajustar propriedades. Não há dependência do Figma.

## Validação e limites

17 suítes headless passaram, incluindo novos testes de seleção imediata, busca, painel durante desenho, tamanho fixo, arredondamento, prévia, cancelamento, aplicação, desfazer, sessão desatualizada e persistência. Build, sintaxe e manifesto validados. O roteiro de navegador foi atualizado, mas o ambiente continua sem Chromium; CSS/temas e interação nativa no Obsidian com mesa digitalizadora precisam de validação real.

Ao atualizar, preserve data.json e desenhos. Substitua os arquivos do plugin pelo ZIP de instalação.
