# Smart Ink 0.22.0

Escopo funcional fechado: esta versão refina organização e comportamento da interface.

## O que mudou

As preferências Interface, Atalhos e pincéis, Menu radial e Precisão compartilham navegação no topo, com indicação da seção atual e retorno ao Documento. A troca mantém a posição do painel quando há espaço. Os controles existentes e seus manipuladores são preservados; não há uma cópia paralela dos valores.

No Documento, espaçamento e tipo de grade ficam junto ao tipo de papel. O controle de backups fica em Arquivo e segurança, mantendo também o acesso contextual em Recuperação.

Painéis de edição/configuração, sugestões de formas, radial e camadas recebem limites baseados na área visível do painel e da janela. Menus longos usam rolagem. O radial reduz sua escala. Posições antigas e arrastes são limitados novamente. ResizeObserver atende mudanças no tamanho do painel; visualViewport atende alterações da área visível. Não há observadores de mutação ou processamento novo no caminho de entrada da caneta.

Redimensionar a janela deixa o formulário aberto. Cabeçalhos e ações de formas permanecem acessíveis durante rolagem; controles acomodam textos longos e áreas estreitas. Fechar um painel limpa aria-expanded do botão que o abriu. Abrir preferências fecha o painel de camadas para evitar sobreposição concorrente.

## Validação

Build reproduzível, sintaxe e versões consistentes; 16 suítes headless aprovadas, incluindo regressões de escrita, seleção, histórico e autosave. A nova suíte verifica interseção com a janela e visual viewport, radial, camadas, agrupamento e preservação do formulário no resize.

O roteiro browser-smoke inclui verificações reais de DOM para larguras 1200/360/220 px, mas não pôde executar neste ambiente porque o Chromium não está instalado. A renderização CSS, temas de terceiros, janelas destacadas e mesa digitalizadora ainda exigem validação no Obsidian real. Não se afirma ausência absoluta de transbordamento em todos os temas ou dimensões.

## Instalação

Feche/desative o plugin e substitua main.js, styles.css, manifest.json e avisos de terceiros pelos arquivos do ZIP. Preserve data.json e seus desenhos. Reative o plugin.
