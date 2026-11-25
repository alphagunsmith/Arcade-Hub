# Guia por jogo

Com um mod, o jogo **informa** ao app o que está acontecendo, com dados exatos e na hora. Quando um mod está ativo, a visão IA pausa sozinha naquele jogo e não gasta nada.

---

## Cyberpunk 2077 — usando um mod pronto (o app finge ser o DSX)

O app agora tem um **receptor compatível com o protocolo do DSX** (porta UDP 6969). Por isso, o mod mais completo de gatilhos do Cyberpunk funciona direto com ele: mais de 60 efeitos configurados à mão para armas e veículos, troca de marcha, batidas, pneu furado.

1. Instale o mod **"DualSense Adaptive Trigger Effects"** (Nexus Mods, Cyberpunk 2077, mod nº 4156) e seus requisitos (RED4ext, Cyber Engine Tweaks, redscript e Native Settings UI). O jeito mais fácil é pela aba **"Baixar mods"** do painel: um clique instala tudo.
2. **Não abra o DSX.** O DualSense Auto ocupa o lugar dele.
3. Abra o DualSense Auto, depois o jogo. No menu do mod (CET), coloque a porta **6969** e conecte.
4. Na aba "O que ele está vendo" do app, a linha 🧩 mostra quantos comandos chegaram, e "Dados" mostra `mod (protocolo DSX)`.

Bônus: qualquer outro mod feito para o DSX também funciona do mesmo jeito (RDR2, GTA V, Resident Evil, Fallout 4, Skyrim, Forza, Assetto Corsa...).

Alternativa sem mod: o Cyberpunk tem suporte nativo ao DualSense desde a versão 2.1 (gatilhos com cabo). Para usar o nativo, **desligue "Emular controle de Xbox"** no app, ou feche o app.

---

## Call of Duty: Infinite Warfare — mod nosso (via iw7-mod)

O script lê do próprio jogo:
- **arma na mão:** nome interno, classe e **cadência real** (calculada do tempo entre tiros) e tamanho do pente;
- **cada disparo, recarga e granada**;
- **dano com a direção exata** (frente / trás / esquerda / direita), calculada pela posição de quem atirou em relação para onde você está olhando;
- **vida e mira (ADS)**.

Instalação:
1. Instale o **iw7-mod** (cliente da AuroraMod; precisa ter o jogo original na Steam): baixe o `iw7-mod.exe` e coloque na pasta do jogo.
2. Copie a pasta `iw7-mod` daqui para dentro da pasta do jogo, ou use o botão **Instalar** da aba "Baixar mods". O script deve ficar em:
   `...\Call of Duty - Infinite Warfare\iw7-mod\custom_scripts\dualsense_auto.gsc`
3. Copie o `jogar_com_dualsense.bat` para a pasta do jogo e **abra o jogo sempre por ele**. Ele passa o parâmetro `-allow_root_io`, sem o qual o script não consegue gravar o arquivo de eventos.
4. Abra o DualSense Auto antes. Quando você estiver jogando, "Dados" mostra `mod: Call of Duty: Infinite Warfare`.

Avisos importantes:
- **Use só pelo iw7-mod, nunca no multiplayer oficial.** O multiplayer oficial da Steam tem VAC (o anti-cheat da Valve), e mods nele podem dar ban.
- **Este script ainda não foi testado no jogo.** Ele não pôde nem ser compilado aqui. Se aparecer erro de script no console do iw7-mod (tecla `~`), me mande a mensagem que eu corrijo.
- A campanha precisa estar disponível no iw7-mod. O script roda em qualquer modo que ele abrir (campanha, zumbis, multiplayer privado).

Como cada arma se comporta: o app usa a classe e a cadência que o jogo informa. Fuzis e SMGs automáticos fazem o R2 vibrar **na cadência exata**, a escopeta e o sniper dão um estalo duro, e as armas de energia (classe "beam") vibram fino e contínuo. Se a visão IA estiver com a chave configurada, ele também pesquisa cada arma uma vez para afinar o setup.

---

## Titanfall 2 — mod nosso (via Northstar)

O mod lê do próprio jogo a **arma na mão** (de piloto e de titã), **cada disparo** (bala a menos no pente), o **pente**, o **dano**, a **vida**, a **mira** e se você está no titã. Cada arma tem a sua configuração: o Kraber tem ponto de disparo fundo, a Devotion e o Predator Cannon têm o cano girando, o Charge Rifle e o Railgun da Northstar carregam o disparo…

Instalação:
1. Instale o **Northstar** (northstar.tf) na pasta do Titanfall 2.
2. No painel, aba **Baixar mods** › Titanfall 2 › **Ponte DualSense Auto (nosso)** › Instalar. Ele vai para `R2Northstar/mods/DualSenseAuto`.
3. Abra o jogo pelo **NorthstarLauncher.exe**. O mod roda só no seu PC: dá para entrar em qualquer servidor.

---

## Doom clássico — mod nosso (via GZDoom)

Vale para Doom, Doom II, Final Doom, SIGIL, Doom 64 para GZDoom e a maioria dos WADs e mods de armas. O mod informa a **arma na mão**, **cada disparo**, a **munição**, o **dano com a direção** (frente, trás, esquerda, direita) e a **vida**. Nada aparece na tela: as linhas vão só para o arquivo de log.

Instalação:
1. No painel, aba **Baixar mods** › Doom (GZDoom) › **Informar pasta** (a pasta do gzdoom.exe) › Instalar.
2. Abra pelo **Doom com DualSense.bat**, que fica na pasta do GZDoom. Para escolher o jogo, crie um atalho para o .bat e acrescente no fim, por exemplo, `-iwad doom2.wad` ou `-file meumod.pk3`.

As versões oficiais da Bethesda (Doom + Doom II e Doom 64 do Steam) não aceitam esse tipo de mod.

---

## Call of Duty: Black Ops II — mod nosso (via Plutonium)

Multiplayer e zumbis, inclusive as armas melhoradas no Pack-a-Punch. O script informa a **arma na mão**, **cada disparo**, **recarga**, **granada**, o **pente**, o **dano com a direção** e a **vida**.

Instalação:
1. Instale o **Plutonium** e o plugin **t6-gsc-utils** (página do t6-gsc-utils no GitHub): o arquivo `t6-gsc-utils.dll` vai em `%LOCALAPPDATA%\Plutonium\plugins`. Ele dá ao script as funções de arquivo.
2. No painel, aba **Baixar mods** › Black Ops II › **Ponte DualSense Auto (nosso)** › Instalar. O script vai para `Plutonium\storage\t6\scripts\mp` e `\zm`.
3. Funciona onde os scripts do seu PC rodam: zumbis solo, partidas privadas e partidas que você hospeda.

---

## Dying Light: The Beast — próximo passo

O jogo já tem **suporte nativo** a gatilhos e hápticos do DualSense no PC (com cabo, Steam Input desligado), mas os jogadores acham a implementação fraca. Para usar o nativo, desligue "Emular controle de Xbox" no app.

Para fazer melhor, há dois caminhos:
1. **Editar os dados de vibração e gatilho do próprio jogo** (arquivos `.pak` de scripts, como fazem outros mods do The Beast). Não precisa de engenharia reversa, mas eu preciso olhar os arquivos do jogo para achar onde ficam essas definições.
2. **Mod nativo (.asi)**: o The Beast carrega plugins `.asi` (via `winmm.dll`), mas para ler a arma, os disparos e o dano é preciso fazer engenharia reversa do executável com o jogo rodando. É um projeto maior, que teria que ser feito com você testando.

Enquanto isso, ele funciona com a **visão IA + a vibração do jogo** pelo Xbox virtual.
