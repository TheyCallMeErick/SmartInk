# Smart Ink 0.17 — edição direta e assistência de números

## Números: sugestões com confirmação

Selecione a escrita e abra **Organizar → Construir e editar → Conferir números escritos**. A ação também está em **Editar tinta**.

- Mostra a escrita original e um campo para confirmar/corrigir o número.
- Para um algarismo, oferece botões 0–9 e destaca os três candidatos por semelhança.
- Para uma sequência, tenta separar grupos da esquerda para a direita; você pode corrigir o valor completo.
- Resultado como **algarismos desenhados e editáveis** ou **texto digitado**.
- Por padrão, **mantém o original e insere abaixo**. Substituir exige desligar essa opção e confirmar. Uma ação de Desfazer recupera o estado anterior.
- **Ensinar este exemplo** salva uma amostra do algarismo confirmado no próprio vault; até cinco por dígito e cinquenta no total. Há botão para remover os exemplos.
- A oferta após 1,1 segundo de pausa é opcional e desativada por padrão. Ative em **Precisão e escrita**. Ela não aplica nenhuma alteração automaticamente e não aparece com reconhecimento de formas ativo.

O reconhecimento é **experimental, geométrico e local**: compara amostras normalizadas com modelos vetoriais próprios e exemplos ensinados. Não usa modelo de IA treinado, MNIST, serviço externo ou OCR geral. Testes com os próprios modelos não medem acurácia na sua caligrafia. Letras semelhantes a números, algarismos encostados, decimais, escrita inclinada e múltiplas linhas podem produzir sugestões incorretas. Confira o campo antes de aplicar. Sinais e separadores podem ser digitados manualmente.

Limites: até 80 traços/30 mil pontos na seleção; até 12 traços/20 mil pontos em cada grupo; até 24 grupos sugeridos; campo final de até 32 caracteres com números, espaços, sinal e separadores. Prefira uma linha curta por operação.

## Edição e UI

| Recurso | Uso |
| --- | --- |
| Recorte visual | Selecione contornos, ative Recortar e aproxime o ponteiro. Depois de uma breve pausa, o trecho a remover fica vermelho. Clique abre a prévia final. |
| Diagnóstico de frestas | Se o preenchimento falhar, o painel procura possíveis aberturas de até 60 unidades e as destaca em laranja. Escolher uma mostra a ponte antes de aplicar; depois tente preencher novamente. |
| Curvas diretamente no canvas | Em Editar nós Bézier, duplo clique no segmento insere um nó. Arrastar entre os nós modela a curva. Shift + clique adiciona/remove nós de uma seleção; arrastar um nó selecionado move o conjunto. |
| Furos e contornos de regiões | Selecione a região, abra Editar contornos e furos, escolha o anel e arraste seus vértices. A soltura abre uma prévia normalizada. Até 256 vértices por anel para edição direta. |
| Parâmetros de formas | Em Parâmetros da forma, escolha Ajustar dimensões e raio no canvas. Alças azuis ajustam dimensões; laranja ajusta arredondamento. Círculos têm alça de raio que mantém o centro. Retângulos, círculos e elipses reconhecidos recebem parâmetros compatíveis. |
| Objetos sobrepostos | No Cursor, Alt + clique abre uma lista visual dos objetos sob o ponto. Passe o ponteiro ou use Tab para realçar; clique/Enter seleciona. Até 20 candidatos. |
| Ferramentas temporárias | Segurar as teclas configuradas de cursor/borracha ou Espaço ativa a ferramenta e soltar restaura a anterior. Botões da caneta configurados como cursor, borracha ou navegação também retornam após o gesto. Combinações de teclas têm pilha de retorno, inclusive soltura fora de ordem. |
| Encaixes | Rótulos distinguem extremidade, vértice, ponto médio/cardinal, centro e interseção. Conectores indicam vínculo persistente; outros gestos indicam alinhamento. Centro/interseção/grade mantêm o alvo por um pequeno raio de soltura. |
| Histórico | Desfazer/refazer informa a operação e realça brevemente os objetos afetados que ainda existem na página. Operações antigas sem rótulo usam “Edição”. |

Os painéis continuam contextuais. Não foram acrescentados botões permanentes para cada recurso. Controles possuem rótulos, foco e mensagens de estado; painéis novos têm limites de largura para janelas estreitas. Essas regras ainda precisam ser verificadas no renderer real do Obsidian e nos temas usados por você.

## Processamento e cancelamento

Booleans, preenchimento, cálculo do recorte e normalização de regiões podem executar em um Web Worker criado localmente, sem download. Fechar/cancelar a prévia encerra o worker; resultados de uma revisão antiga não são aplicados. Há limite de 15 segundos por trabalho. Hover de recorte é adiado e cancela o trabalho anterior ao mudar de ponto ou ferramenta.

Em hosts sem Worker, operações explícitas usam o caminho síncrono com os limites anteriores; a interface pode pausar durante esse cálculo. Falha ao iniciar um Worker é informada. O worker em Chromium/Obsidian ainda precisa de validação real; a suíte automatizada executou o mesmo código em uma thread Node.

## Atualização e compatibilidade

Esquema **9 mantido**, compatível com a 0.16 para documentos. A 0.17 lê esquemas 1–9. Preferências de números e exemplos pessoais ficam no `data.json` do plugin. Não são enviadas pela rede.

Desative o plugin, extraia a pasta `smart-ink` sobre `.obsidian/plugins/smart-ink/`, preserve `data.json` e reative. Preserve uma cópia das páginas antes de atualizar. A 0.15 e anteriores não leem páginas salvas no esquema 9.

## Pendências de validação real

Não houve acesso à sua mesa nem a uma instância real do Obsidian. Ainda é necessário verificar pressão/hover/driver, perda de captura, temas claro/escuro, escalas, janela estreita e documentos reais do seu vault. Os arquivos gravados/reabertos pelos testes são exemplos gerados, não seus documentos pessoais. Não há promessa de acurácia de reconhecimento ou certificação de produção.
