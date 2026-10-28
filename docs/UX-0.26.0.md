# UX 0.26.0

## O que foi implementado

1. **Perfil ativo:** correspondência dos parâmetros de estabilização/suavização, identificados como Perfil de suavização. Mudanças nesses parâmetros mostram Personalizado; seleções heterogêneas mostram Valores variados.
2. **Prévia nos cards:** traço SVG gerado pelo motor do plugin nos perfis e presets prontos. A amostra é ilustrativa; a área de teste serve para comparar a escrita real.
3. **Acesso aos perfis:** cards ficam fora da seção avançada, antes dos controles técnicos.
4. **Teste inline:** seção Experimentar a caneta, com pressão e Limpar teste. Não grava na página. A calibração completa continua disponível no controle existente.
5. **Busca:** pesquisa normalizada por acentos, termos das categorias e controles indexados. Campos das categorias visitadas entram no índice automaticamente. Resultado abre a categoria, expande a seção e destaca o controle; categorias também podem ser resultados. Escape limpa a consulta antes de fechar o modal.
6. **Essencial/avançado:** perfis acessíveis e parâmetros finos recolhidos; gestos e botões da mesa agrupados na Interface.
7. **Alcance:** próximos traços, seleção em prévia, esta página ou preferências do vault. A página distingue papel/grade de arquivo/segurança.
8. **Confirmações:** seleções preservam Aplicar/Cancelar; preferências automáticas mostram o resultado da fila real de gravação. Erros não são apresentados como Salvo.
9. **Restaurar por grupo:** suavização, pressão e atalhos. Favoritos, cor e espessura são preservados nos respectivos resets; restaurar atalhos abrange também teclas temporárias, radial, retorno, linha reta e proporção, evitando colisões entre atalhos antigos e padrões.
10. **Memória:** última categoria nas preferências; rolagem e seções abertas por vista durante a sessão. Painéis secundários têm retorno à categoria de origem.
11. **Ações indisponíveis:** requisitos específicos para tinta, contornos, edição de pontos, dimensões fixas e dependências de snap; explicações visíveis nos painéis acompanham o estado disabled.
12. **Densidade:** Compacta e Confortável usam a preferência preexistente largeControls, com alvos maiores também no modal e nos cards.

## Validação

Testes headless exercitam correspondência do perfil, alteração manual, atualização dos sliders, amostra com pressão, cancelamento/limpeza, isolamento do documento, restauração de pressão na seleção, busca/revelação do campo, memória de navegação, densidade, atalhos e sucesso/erro real da gravação de preferências.

O ambiente usa DOM e Obsidian simulados. A aparência final, teclado em navegador real, drivers de mesa e comportamento no Obsidian precisam de conferência real. O Chromium não está disponível neste ambiente; não se afirma validação visual concluída.

## Atualização

Substitua os arquivos do plugin e preserve data.json e seus desenhos. A densidade anterior é mantida; a categoria inicial assume Documento quando não existe preferência salva.
