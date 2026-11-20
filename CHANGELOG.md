# Novidades

## 1.0.8

- O vídeo do rondel começa na hora. Não tem mais a espera de 2 segundos: se o trailer já está no PC, toca em cerca de 0,2 s.
- Os botões de busca, Modo TV e menu foram para o canto superior esquerdo. Os controles da janela continuam à direita.
- O aviso "sem vídeo" desceu um pouco e não fica mais embaixo dos botões.
- O menu (☰) ganhou o bloco **Configurações** logo no topo, com **Ajustes…** e **Escolher skins…**, os mesmos do clique direito.

## 1.0.7

**Vídeos de outras fontes além do Steam**
- **YouTube:** com uma chave grátis do Google (Ajustes › Pastas), jogos que não estão no Steam ganham trailer. Para ROMs o app procura um vídeo de gameplay da plataforma. O vídeo toca pela internet, sem som e em loop, e a busca é feita uma vez só por jogo para poupar a cota.
- O app ignora vídeos de reação, review e afins, e só aceita um resultado com o nome do jogo no título.
- Botão **Outro vídeo** no rondel: se o YouTube escolheu o vídeo errado, ele descarta esse e busca o próximo.
- **ScreenScraper:** para ROMs, baixa o mesmo vídeo de gameplay que o EmulationStation usa (identifica pelo sistema, nome do arquivo e CRC). Precisa de conta no screenscraper.fr e de um ID de desenvolvedor.
- Ordem de busca: sua pasta de vídeos → Steam → ScreenScraper (ROMs) → YouTube.
- As senhas do ScreenScraper ficam cifradas pelo Windows. A chave do YouTube e a conta do ScreenScraper nunca vão no backup.
- Quando nenhuma fonte acha o vídeo, o motivo de cada uma aparece em português (chave inválida, cota do dia esgotada etc.).

## 1.0.6

**Vídeos dos jogos voltaram**
- Os trailers enviados ao Steam a partir de 2025 não têm mais versão em MP4, só em streaming (HLS), em pedaços. Por isso os jogos recentes ficavam sem vídeo no rondel.
- Agora o app baixa os pedaços do trailer em 720p e junta num MP4, que fica guardado e toca sem internet. Trailers antigos continuam vindo direto em MP4.
- Os jogos da Steam usam o próprio ID da loja para achar o trailer, em vez de buscar pelo nome.
- Jogos que não estão na Steam (ex.: de PSP) continuam podendo usar um vídeo seu: aponte a pasta em Ajustes › Pastas e salve o arquivo com o nome do jogo.

## 1.0.5

**Rondel de ponta a ponta**
- O rondel ocupa a janela inteira, de uma borda à outra.
- O destaque fica na metade de cima. Quando a capa é em pé, ela aparece nítida à direita, sobre o fundo desfocado.
- A roda fica na metade de baixo. O card do centro é grande e os vizinhos vão encolhendo até as duas bordas. Quantos cabem depende da largura da janela: 13 jogos em 1600 px e 9 em 1280 px.
- Os cards de trás ficam sólidos e só escurecem com a distância. Antes eram transparentes e um vazava no outro.
- Corrigido o "NaNh jogadas" no destaque, que agora mostra o tempo de jogo certo.

## 1.0.4
- As capas da abertura do Modo TV são sorteadas da biblioteca inteira a cada vez que você entra, em posições diferentes.
- Jogos adicionados desde a última abertura têm lugar garantido na próxima.

## 1.0.3

**Modo TV (no estilo do Big Picture)**
- Tela cheia, feita para jogar do sofá com controle. Abre pelo botão de TV no topo, pelo botão Guia do controle ou pelo ajuste "Abrir direto no Modo TV" (Ajustes › Geral).
- Início: destaque grande do jogo em foco, com o fundo desfocado da capa, e fileiras de jogos:
  - Continue jogando, Favoritos, Mais jogados e Adicionados recentemente;
  - uma fileira por loja e uma por console.
- Biblioteca em grade de A a Z, e um resumo de Estatísticas.
- Página do jogo com tempo de jogo, sessões, última vez, nota, descrição e os botões Jogar e Favoritar.
- Controle:
  - direcional ou analógico para navegar (segurar repete);
  - A abre o jogo e X joga direto;
  - Y favorita e B volta;
  - LB/RB trocam de seção;
  - Start abre o menu e Select escolhe um jogo aleatório;
  - Guia sai do Modo TV.
- Teclado: setas, Enter, Esc, Espaço, F, Q/E e M. O mouse também funciona.
- A barra de baixo mostra os botões certos para o que está na tela: os do controle quando há um conectado, ou as teclas quando não há.
- Sons de navegação gerados na hora, sem arquivos de áudio. Dá para desligar no menu.

**Abertura animada**
- O logo aparece como um molde vazio, o controle cai girando e encaixa, e o encaixe solta um pulso.
- Cada capa da sua biblioteca que o pulso alcança acende e se liga ao logo por um fio de energia.
- Usa as capas dos seus jogos, começando pelos mais jogados.
- Qualquer tecla ou botão pula a animação. Dá para desligar no menu do Modo TV.
- Com "reduzir movimento" ligado no Windows, a animação é trocada por uma versão curta e parada.

## 1.0.2

**Tempo de jogo**
- Jogos da Steam, Epic e GOG agora têm o tempo contado. O app procura programas rodando dentro da pasta do jogo enquanto ele está aberto.
- Jogos que abrem por um launcher próprio também contam. Antes, o launcher fechava em segundos e a sessão era descartada.
- Cada sessão entra num histórico, que alimenta a página de estatísticas.
- O card mostra "jogando agora" enquanto o jogo está aberto.

**Durante o jogo**
- O Arcade Hub vai para perto do relógio quando o jogo abre e volta sozinho quando ele fecha. Dá para desligar em Ajustes › Geral.

**Biblioteca**
- O app procura jogos novos sozinho, ao abrir e quando algo muda nas pastas de jogos, nas pastas de ROMs ou na Steam. Dá para desligar em Ajustes › Geral.
- No diagnóstico, os jogos cujo arquivo sumiu aparecem um por um, com os botões "Apontar arquivo" e "Remover". A ficha do jogo também ganhou o botão "Apontar o arquivo".
- O backup agora é um `.zip` que leva as imagens das capas junto, então funciona em outro PC. Backups `.json` antigos continuam sendo importados.

**Visual**
- Página de estatísticas (menu › Estatísticas), com:
  - tempo total, sessões e média por sessão;
  - os jogos mais jogados;
  - horas por mês, por plataforma e por origem;
  - os jogos instalados que ainda não têm tempo de jogo.
- Tamanho dos cards ajustável no menu.
- Aviso de atualização dentro do app ("Reiniciar agora") e botão "Procurar atualizações" em Ajustes › Sobre.

**Desempenho**
- As lojas instaladas ficam em cache. Antes, cada clique consultava o registro do Windows de novo.
- As capas carregam só quando aparecem na tela.
- A vigia de pastas é ligada depois que a janela já abriu.
