# DualSense Auto

Vibração e gatilhos adaptáveis **inteligentes** para qualquer jogo de PC. O app também emula um controle de Xbox.

## Como ele funciona

**Camada rápida (100 vezes por segundo), sem precisar de internet**
- **Controle de Xbox virtual:** o jogo enxerga um controle de Xbox, e tudo que você aperta no DualSense é repassado para ele. A vibração que o jogo manda para o "Xbox" é capturada e repassada ao DualSense. Assim, até jogos sem suporte ao DualSense vibram com os eventos reais do jogo.
- **Seus gatilhos:** se você está apertando R2 quando o jogo manda um tranco de vibração, ele entende que o tiro foi seu e aplica o coice. Se você não está atirando e vem um tranco forte, ele entende que **te acertaram**.

**Camada de visão (a cada poucos segundos, com a IA Claude, opcional)**
O app tira um print da tela e a IA identifica:
- o **jogo** e a **situação** (a pé, em veículo, menu, cena);
- a **arma na mão**: cada arma nova é **pesquisada na web** (cadência, tipo, recuo) e ganha um setup próprio de gatilho, salvo em `armas.json`;
- **chuva ou neve**, que viram gotas caindo no controle (mais fortes dentro do carro, "no teto");
- o **terreno** sob as rodas: lama, cascalho, gelo, areia, zebra, água...;
- o **indicador de dano**: frente, **trás**, esquerda ou direita;
- **vida baixa**, que vira batimento cardíaco no controle e luz vermelha pulsando.

### Exemplos do que muda
| Situação | Gatilhos | Vibração |
|---|---|---|
| Fuzil automático | "clique" no R2; segurando e atirando, o R2 vibra **na cadência real da arma** (600 tpm = 10 Hz) | coice a cada disparo |
| Escopeta / sniper | R2 duro com estalo forte | coice pesado |
| Arco | R2 vai endurecendo conforme você puxa | — |
| Pneu na **lama** | acelerador com patinação (vibração lenta), freio com menos aderência | balanço pesado e irregular |
| **Cascalho** | acelerador com trepidação rápida | chiado no motor leve |
| **Gelo** | freio quase sem resistência; travou o freio → vibração de ABS | quase nada (sem aderência) |
| **Zebra** | os dois gatilhos pulsam | pulsos rápidos |
| **Chuva** | — | gotas aleatórias |
| Tiro **pelas costas** | — | duas batidas graves e largas |
| Tiro pela esquerda/direita | — | só o lado correspondente |
| Menu / cena | gatilhos soltos | — |

Sem a IA, o app continua funcionando com a vibração do jogo e o tipo do jogo.

## Baixar mods pelo app (aba "Baixar mods")
1. No site do Nexus Mods, abra seu perfil, depois Site preferences, a aba API Keys, e copie a **Personal API Key** do fim da página.
2. Cole a chave no painel e clique em **Conectar**.
3. Clique em **Baixar e instalar** no mod que quiser. O app instala junto os requisitos, por exemplo os 4 que o mod do Cyberpunk exige.
   - **Conta Premium:** o download é direto.
   - **Conta grátis:** é regra do Nexus que cada download tenha um clique no site. Ligue "Receber os links Mod Manager Download". O app abre a página certa; você clica em **Slow download** e ele termina sozinho.
4. **Remover** apaga o que o app instalou e devolve os arquivos originais do jogo que tinham sido substituídos (o app guarda um backup em `backup_mods`).

Os mods do Cyberpunk e o nosso do CoD são instalados direto na pasta do jogo (o app acha a pasta pela Steam ou você informa). Os outros mods da lista são só **baixados**, porque cada um tem requisitos próprios (F4SE, SKSE, REFramework, ScriptHook). O botão "Abrir pasta" mostra o arquivo, e "Ver página" mostra como instalar.

Se você usa Vortex ou Mod Organizer, ligar o recebimento de links faz o botão do site abrir o DualSense Auto em vez deles. Desligar devolve os links para o programa anterior.

## Instalar um mod que você já baixou (aba "Instalar mod")
Solte o arquivo do mod (.zip, .7z ou .rar) no painel, ou clique em "Escolher arquivo". O app:
1. **Descobre o jogo:** pela estrutura do mod (pastas típicas do Cyberpunk, Skyrim/Fallout, RE Engine, GTA/RDR2, Unreal, BepInEx, iw7-mod, Dying Light), pelo leia-me e pelo nome do arquivo.
2. **Acha a pasta do jogo:** nos jogos instalados pela Steam, Epic e GOG, ou numa pasta que você informar.
3. **Monta o plano de instalação:**
   - regras conhecidas de cada tipo de mod;
   - o instalador **FOMOD**, quando o mod tem um (o app usa as opções recomendadas e mostra quais escolheu);
   - com a chave do Claude, a **IA lê o leia-me** e, se o nome do arquivo tiver o número do Nexus e houver chave do Nexus, também **as instruções da página do mod**.
4. **Mostra o plano antes**: jogo, pasta, quais arquivos vão para onde, quantos substituem arquivos do jogo, requisitos e avisos. Se ele errou o jogo, troque na lista.
5. Ao clicar em **Instalar no jogo**, só copia arquivos. **Nunca executa programas do mod.** Passos que não são cópia, como rodar um instalador ou editar um .ini, aparecem como aviso para você fazer.

Tudo o que for substituído vai para o backup, e **Remover** devolve os arquivos originais.

## Mods por jogo (dados exatos, sem IA)
Veja **`mods/LEIA-ME-MODS.md`**:
- **Cyberpunk 2077:** o app recebe os comandos do mod "DualSense Adaptive Trigger Effects", porque é compatível com o protocolo do DSX (porta 6969). Qualquer outro mod feito para o DSX também funciona.
- **CoD: Infinite Warfare:** mod próprio (script do iw7-mod) que informa arma, cadência real, cada tiro e a direção exata do dano.
- **Dying Light: The Beast:** suporte nativo do jogo ou visão IA (mod em estudo).

Quando um mod está mandando dados, a visão IA pausa sozinha naquele jogo.

## Instalação (Windows 10/11)
1. Dê dois cliques em **`iniciar.bat`**.
   - Na primeira vez, ele instala tudo. Quando aparecer o instalador do driver **ViGEmBus** (para o controle de Xbox), clique em Avançar/Instalar. Se pedir, reinicie o PC.
2. Na aba **"IA e Xbox"** do painel, cole sua **chave da API do Claude** e clique em Salvar. A chave é criada em console.anthropic.com e o uso é cobrado por lá.
3. Abra o jogo. O **painel** mostra em tempo real:
   - os dois gatilhos, com as 10 zonas de resistência e quanto você está apertando;
   - a arma em letras grandes, com tipo e cadência;
   - os motores, a chuva, o terreno, a direção do último dano e a vida;
   - a cor de destaque, que acompanha a barra de luz do controle.

O painel abre como uma janela própria (pelo Edge, que já vem no Windows). **Fechar a janela não desliga o app.** Para desligar, use o botão "Desligar o app" na aba "Jogos e mods". Rodar o `iniciar.bat` de novo só reabre a janela.

Se o app não abrir, rode `depurar.bat` ou veja o `erro.log`.

## Para não aparecerem dois controles no jogo
- **Steam:** desative o Steam Input do jogo (Propriedades → Controle → Desativar Steam Input).
- **HidHide** (recomendado): esconde o DualSense "real" dos jogos, para eles verem só o Xbox virtual. Instale em github.com/nefarius/HidHide, marque o DualSense para esconder e **adicione na lista de aplicativos liberados** o arquivo `.venv\Scripts\pythonw.exe` desta pasta (ou o `DualSenseAuto.exe`, se gerou o executável).
- Feche o DS4Windows e o DSX.

## Custos e privacidade da visão IA
- Cada leitura envia **um print da tela** para a API da Anthropic. O padrão é uma leitura a cada 4 segundos, ajustável na aba "IA e Xbox". Quanto menor o intervalo, mais rápido ele percebe as mudanças e **mais caro** fica.
- A pesquisa de cada arma é feita **uma vez só** e fica salva em `armas.json`. Você também pode editar esse arquivo à mão para ajustar uma arma.
- A chave fica salva em `config.json`, nesta pasta. Não compartilhe esse arquivo.
- Os modelos usados (`modelo_visao` e `modelo_pesquisa`) podem ser trocados no `config.json`.

## Limitações (sinceramente)
- **Velocidade:** a visão leva 1 a 3 segundos para perceber algo. Clima, terreno e troca de arma funcionam bem assim. Já o "tiro pelas costas" depende de o indicador de dano ainda estar na tela quando o print é tirado. A direção do dano (frente, trás e lados) vem toda da tela, então chega com esse atraso.
- **O DualSense só tem motores à esquerda e à direita.** "Nas costas" é representado por um padrão próprio (duas batidas graves), não por um motor atrás.
- Ele **não lê a memória do jogo**, de propósito, para não ter problema com anti-cheat. Alguns anti-cheats bloqueiam controles virtuais; nesse caso, desligue "Emular controle de Xbox" naquele jogo.
- O terreno e a arma dependem do que aparece na tela. Por exemplo, em primeira pessoa dentro do carro, a IA pode não ver o chão direito.

Auto-teste sem controle: `python dualsense_auto.py --teste`
