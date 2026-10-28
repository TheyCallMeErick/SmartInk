# Smart Ink 0.21.0

## Uso

- Mover, girar e redimensionar uniformemente seleções de 32 ou mais objetos usa geometria retida e no máximo uma prévia por quadro. Shift encaixa a rotação em 15°; Alt redimensiona pelo centro.
- Arraste uma seleção, caixa de seleção ou laço até a borda: a navegação automática acompanha a direção, com velocidade gradual. Soltar ou cancelar interrompe a navegação.
- Com o cursor ativo e o canvas focado, setas deslocam 1 unidade do documento; Shift+seta desloca 10. Repetir a tecla agrupa os movimentos em um desfazer ao soltá-la.
- Mais ações da seleção e Organizar oferecem Colar na posição original e Colar na posição do cursor. Ctrl/Cmd+Shift+V também mantém a posição original de uma seleção Smart Ink. Os botões dependem de leitura da área de transferência disponível no ambiente; a colagem nativa continua funcionando.
- Substituir imagem aparece nas opções da imagem e no menu Mais. Preserva centro, largura, altura, ângulo e opacidade; remove o recorte e as máscaras anteriores para mostrar a nova imagem inteira. A operação pode ser desfeita; PNG/JPEG/WebP até 8 MB e 40 milhões de pixels.
- Copiar como PNG transparente aparece no menu Mais. Respeita ordem de camadas, estilos e transparência; usa escala de até 2×, limitada a 4096 px no maior lado e 16 milhões de pixels. O documento original não muda. Exige ClipboardItem e escrita de PNG no clipboard; o erro orienta usar SVG quando indisponível.
- Diagnóstico de desempenho mostra amostras por seleção, prévia, desenho, confirmação e salvamento, com mediana e p95. Copiar diagnóstico não inclui texto, traços, imagens ou caminhos das notas. Mede JavaScript e espera do salvamento, não GPU ou latência física.

## Desempenho

A prévia estende a translação retida para rotação e escala uniforme. Conectores acompanham as âncoras; ao concluir, o último evento é materializado uma vez. Caminhos Canvas são transformados por Path2D.addPath quando suportado; contornos visíveis já calculados são reaproveitados sem repetir operações de recorte geométrico. Ambientes antigos mantêm o caminho normal de construção. Valores com largura limitada não reutilizam um caminho incompatível.

Trechos consecutivos de objetos parados são guardados em canvases auxiliares, preservando sua interposição com os objetos selecionados. Até quatro trechos e 16 milhões de pixels no total (aproximadamente 64 MB de pixels RGBA); acima disso, usa desenho direto. Mudanças de câmera, zoom, tamanho e carregamento de imagem invalidam o cache. O papel ainda é redesenhado. A otimização não promete FPS constante em documentos arbitrariamente densos.

O histórico passa a compartilhar blocos imutáveis de 64 referências entre estados. Somente blocos alterados recebem novos arrays; objetos continuam sendo compartilhados quando não mudam. Estados são materializados sob demanda para desfazer/refazer e histórico visual. Não é um log serializado de comandos nem uma garantia de memória constante. IDs alterados substituem a comparação quadrática do realce do histórico. Inserção, remoção, reordenação e metadados continuam compatíveis.

## Ícones e animações

Ícones SVG em copiar, colar, recortar, enquadrar, escrever, imagens, estilos, parâmetros, excluir, confirmar, cancelar e Mais. Os textos permanecem e os SVG são aria-hidden, para não duplicar nomes acessíveis. Decoração ocorre fora do processamento de pontos da caneta.

Painéis entram com fade de 120 ms; mensagens com fade/deslocamento de 140 ms; botões têm transições de cor de 100 ms. Não há interpolação de posição do canvas, tinta ou objetos, nem animação a cada reconstrução da barra de seleção. prefers-reduced-motion desativa as transições/animações adicionadas.

## Verificação

Quinze suítes automatizadas headless passaram, incluindo transformação retida, contornos reutilizados, cache estático e invalidação da câmera, compartilhamento de blocos do histórico, setas/desfazer, colagem original, substituição de imagem/desfazer, clipboard PNG simulado, ícones, diagnóstico e autopan.

O teste opcional scripts/browser-smoke.cjs foi ampliado para largura estreita, ícones, movimento reduzido e capturas de temas claro/escuro; continua cobrindo seleção estável, popovers, desenho direto, reconhecimento e clipboard. .github/workflows/visual.yml instala Chromium e executa os testes quando usado em um repositório GitHub. Esse workflow foi preparado, não executado ou publicado aqui.

A tentativa local de npm run test:browser falhou porque Chromium não está instalado (docs/checkpoints/browser-0.21.0.log). Portanto, screenshots, renderização real, clipboard nativo e uso com mesa no Obsidian continuam pendentes. Os testes headless não substituem essa validação.

## Atualização

Desative o plugin, substitua os quatro arquivos do pacote e reative. Preserve data.json e os documentos .smartink. O formato de documento permanece no esquema 9.
