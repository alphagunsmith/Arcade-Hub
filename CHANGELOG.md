# Novidades

## 1.3.1

- O Discord já vem configurado com o aplicativo "Arcade Hub": é só ter o Discord aberto, sem colar nenhum ID. O status aparece com o nome e o ícone do Arcade Hub.

## 1.3.0

**Discord, sem servidor**
- **Status no Discord:** seus amigos veem "Jogando *Jogo* no Arcade Hub", com o console, o tempo de partida e a capa (nos jogos da Steam). O status some quando o jogo fecha.
- **Botão "Participar" para os amigos:** quando um amigo clica, o Discord abre o Arcade Hub dele.
  - Num jogo de PC, o mesmo jogo abre no PC do amigo (pela Steam, se for de lá), e vocês se juntam pelo multiplayer do próprio jogo.
  - Num jogo retrô aberto com **Jogar online**, ele entra na mesma partida pelo RetroArch (netplay). O Arcade Hub acha a mesma ROM na biblioteca dele (pelo CRC) e conecta no endereço certo: mesma VPN de jogos (Radmin, ZeroTier, Tailscale), mesma rede de casa ou internet.
- **Pedido para participar:** é aceito sozinho, e aparece um aviso com o nome de quem está entrando. Dá para desligar.
- **Jogar online:** botão novo na ficha das ROMs e na página do jogo no Modo TV.
- **Ajustes › Discord:** liga e desliga cada parte, mostra se o Discord está conectado e permite trocar a porta do jogo online.
- Tudo passa pelo Discord aberto no próprio PC. O único acesso de fora é um serviço público de "qual é meu IP", usado só para montar o convite do jogo online.

## 1.2.0

**Modo Console: o PC vira um videogame**
- **Abrir com o Windows:** o PC liga direto no Arcade Hub em tela cheia (Ajustes › Geral, ou Sistema no Modo TV).
- **Seção Sistema no Modo TV:** suspender, reiniciar e desligar o PC pelo controle, sempre com confirmação começando em "Cancelar". Também trocar de perfil, procurar jogos novos, sons e ir para a área de trabalho.
- **Seção Emuladores:** cada console da sua biblioteca, o emulador que abre os jogos e a BIOS que ele precisa.
  - O app acha sozinho os emuladores que já estão instalados nos lugares de costume e configura com um botão.
  - Também abre o site oficial de cada emulador.
  - A BIOS é conferida (presente, versão reconhecida ou faltando). O app não baixa BIOS: use a do seu próprio console.

**Perfis e conquistas**
- **Perfis para cada pessoa da casa,** com nome, cor e avatar. Com mais de um perfil, o Modo TV pergunta "Quem vai jogar?" ao abrir. Cada perfil tem seu próprio tempo de jogo; o tempo que já existia fica com o primeiro perfil.
- **22 conquistas,** de bronze a platina, como os troféus dos consoles. Exemplos: Maratona (3 h seguidas), Coruja (jogar de madrugada), Sequência (7 dias seguidos), Raiz (ROMs de 3 consoles), Sem fronteiras (3 lojas), Centenário (100 h).
- **Aviso na tela com som** quando uma conquista é desbloqueada, na tela normal e no Modo TV.
- **Onde ver:**
  - nova seção "Conquistas" no Modo TV;
  - menu ☰ › cartão do perfil, que mostra pontos e conquistas e abre o painel para criar e editar perfis.

## 1.1.1

Correções da revisão de código:
- **Biblioteca protegida:** se o arquivo da biblioteca for danificado (queda de energia, problema no disco), o app recupera a gravação anterior e avisa. Antes, ele abria vazio e a próxima gravação apagava tudo. O arquivo danificado também fica guardado.
- **Tempo de jogo no Windows:** agora conta também os jogos abertos como administrador. E não abre mais um PowerShell novo a cada 15 segundos enquanto você joga: um só fica aberto e fecha sozinho depois.
- **Teclado:** com a ficha ou outra janela aberta, as setas não mudam mais o jogo que está atrás, no LaunchBox, nos temas de console e no rondel. Na grade, ↑ e ↓ agora caem na coluna certa.
- **Controle:** o direcional anda pelos botões e campos da ficha, dos Ajustes e do seletor de skins; A aciona, ← → mudam opções e B volta. Antes, ↓ fechava a janela.
- **Confirmações:** o foco começa em "Cancelar", então um Enter distraído não remove nada. Com o controle, B cancela.
- **Backup .zip:** algumas capas ficavam de fora no Windows; agora entram todas.
- **Segurança:**
  - Arrastar um arquivo para a janela não troca mais a tela do app.
  - Permissões do navegador (câmera, localização…) ficam bloqueadas.
  - O servidor local de vídeos só atende o próprio app.
  - As chaves do YouTube e do SteamGridDB ficam cifradas no disco.
- Uma varredura que trava não congela mais o app, e abrir o app duas vezes não carrega a biblioteca em dobro.
- **Testes automáticos:** quase 100 testes rodam no Windows e no Linux a cada mudança, e uma versão só é publicada se todos passarem.

## 1.1.0

**Skins estilo LaunchBox e Big Box**
Novas interfaces completas (não só cores), em Visual › filtro "LaunchBox / Big Box":
- **LaunchBox — Clássico:** plataformas e categorias à esquerda (Todos, Favoritos, Recentes, Nunca jogados, cada plataforma e cada loja). No meio, a grade de capas separada por letra, com controle de tamanho. À direita, o painel de detalhes com o trailer tocando, botões Jogar, Ficha e favorito, e os dados do jogo.
- **LaunchBox — Lista:** a mesma tela com uma tabela. Clique no título de qualquer coluna para ordenar (título, plataforma, origem, tempo jogado, última vez, nota). Um botão na barra de cima troca entre capas e lista a qualquer momento.
- **LaunchBox — Claro** e **Meia-noite** (preto total, bom para tela OLED): variantes de cor.
- **Big Box — Parede:** modo TV com mural de capas em três fileiras sobre o vídeo do jogo selecionado.
- **Big Box — Roda vertical:** roda de títulos à direita, vídeo grande e ficha à esquerda.
- **Big Box — Lista com detalhes:** lista de títulos, vídeo e ficha completa.
- **Big Box — Colorido:** cada plataforma tem sua cor, e a tela inteira muda ao trocar.

Como usar: setas andam, Enter abre a ficha, Shift+Enter (ou duplo clique) joga. Q/E, PageUp/PageDown ou LB/RB no controle trocam de plataforma.

**Outras melhorias**
- Os temas de console (XMB, Aurora, Xbox 360…) também começam o vídeo na hora: tiraram a espera de 2 segundos e usam o streaming.
- LB/RB do controle trocam a coluna ou aba em todos os temas de dashboard.
- A coluna "Favoritos" dos temas de console agora mostra os seus favoritos de verdade.

## 1.0.9

**Vídeo por streaming**
- O trailer começa a tocar assim que chega o primeiro pedaço, sem esperar o download inteiro. Enquanto você assiste, ele é guardado no PC para as próximas vezes.
- Os jogos ao lado do selecionado no rondel já deixam o começo do trailer baixado. Ao girar a roda, o vídeo entra na hora: entre 0,02 e 0,35 s nos testes, inclusive com internet de 4 Mbit/s.
- Se você passa para outro jogo, o download do anterior é cancelado em 3 s e não disputa a internet com o novo.
- Antes, um trailer novo do Steam (720p, ~28 MB) levava de 9 s (25 Mbit/s) a quase 1 minuto (4 Mbit/s) para começar.

**Chega de trailer de filme ou de outro jogo**
- Steam: só aceita o nome exato do jogo (ou o subtítulo, como "Expedition 33"). Antes, "Minecraft" pegava "Minecraft Dungeons II" e "Warcraft" pegava outro jogo. Também só aceita item que é jogo na loja, e não filme, série ou trilha sonora.
- YouTube: busca só na categoria Jogos, exige o nome inteiro do jogo no título e descarta vídeos de filme ou série (filme, Netflix, cinema etc.).
- Se nenhuma fonte achar um trailer confiável, o jogo fica sem vídeo.
- Os vídeos já guardados são conferidos com as regras novas na primeira vez que cada jogo aparece. O que for de filme ou de outro jogo é apagado e trocado, ou o jogo fica sem vídeo.

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
