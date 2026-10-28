# Auditoria de botões — 0.24.1

## Resultado

51 telas/estados abertos em ambiente simulado, 456 ocorrências de botões com eventos associados. O número inclui controles repetidos entre telas; não representa botões únicos. 16 controles habilitados usam keydown em vez de click para capturar teclas. Foram verificados também os botões desabilitados presentes nesses estados. Não houve botão sem click, pointerdown ou keydown na amostra.

Fixture de imagem, traço, conector, caminho, região e página/caderno permite abrir painéis dependentes da seleção. A interpretação de diagrama não abriu para o traço simples da fixture, comportamento esperado do reconhecimento; operações de reconhecimento/previsualização também têm testes nas suítes de geometria. Listas dependentes de conteúdo real (backups, bibliotecas de usuário, páginas de cadernos preenchidos) não foram exaustivamente percorridas.

Foi feita checagem das chamadas diretas this.metodo() nas fontes contra os métodos do plugin/view; os nomes externos restantes pertencem à API do Obsidian. Isso não substitui execução de todo caminho de callback.

## Falha corrigida

openImageOptions era envolvido por uma extensão que adicionava Substituir imagem mesmo quando a função original saía sem abrir painel. Sem uma imagem selecionada, podia acessar flyout nulo ou adicionar o botão a um painel não relacionado. A extensão agora confere a seleção e o tipo do painel antes de adicionar a ação. Regressão cobre ambos os casos.

## O que os testes comprovam

19 suítes passaram, incluindo vínculos dos botões, regressões de seleção, propriedades, aplicação/cancelamento/desfazer, formas, clipboard simulado, camadas, histórico, salvamento, geometria e desempenho da transformação. O teste novo verifica a presença de handlers e abertura das telas; não executa individualmente todos os 456 callbacks. Ter evento associado não é prova de comportamento completo correto.

## Limites

Não foi possível validar renderização, sobreposição de áreas de clique, permissões nativas de clipboard, impressão/PDF e operações reais do vault no Obsidian. Chromium continua indisponível após falha de download na etapa anterior. Portanto não há certificação de que todos os botões funcionem em qualquer ambiente/estado. O relatório bruto está em docs/checkpoints/buttons-0.24.1.json; reproduza com BUTTON_AUDIT_REPORT=caminho.json node tests/audit-buttons.cjs.
