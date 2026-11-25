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

## Dying Light: The Beast — próximo passo

O jogo já tem **suporte nativo** a gatilhos e hápticos do DualSense no PC (com cabo, Steam Input desligado), mas os jogadores acham a implementação fraca. Para usar o nativo, desligue "Emular controle de Xbox" no app.

Para fazer melhor, há dois caminhos:
1. **Editar os dados de vibração e gatilho do próprio jogo** (arquivos `.pak` de scripts, como fazem outros mods do The Beast). Não precisa de engenharia reversa, mas eu preciso olhar os arquivos do jogo para achar onde ficam essas definições.
2. **Mod nativo (.asi)**: o The Beast carrega plugins `.asi` (via `winmm.dll`), mas para ler a arma, os disparos e o dano é preciso fazer engenharia reversa do executável com o jogo rodando. É um projeto maior, que teria que ser feito com você testando.

Enquanto isso, ele funciona com a **visão IA + a vibração do jogo** pelo Xbox virtual.
