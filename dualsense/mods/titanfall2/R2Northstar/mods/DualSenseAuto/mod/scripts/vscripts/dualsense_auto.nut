// =============================================================================
// DualSense Auto - ponte para Titanfall 2 (Northstar)
//
// Grava o estado do seu personagem em
//   R2Northstar/saves/DualSenseAuto/estado.txt   (Safe I/O do Northstar)
// e o app DualSense Auto transforma isso em gatilhos e vibração, com a
// configuração de cada arma (piloto e titã).
//
// Formato (uma linha, regravada a cada mudança):
//   seq|arma|pente|tiros|danos|ultimo_dano|vida|vida_max|mirando|tita|vivo
// =============================================================================
global function DSA_Iniciar

void function DSA_Iniciar()
{
	thread DSA_Laco()
}

void function DSA_Laco()
{
	string ultimaArma = ""
	int ultimoPente = -1
	int ultimaVida = -1
	int tiros = 0
	int danos = 0
	int ultimoDano = 0
	int seq = 0
	string ultimo = ""
	float salvoEm = 0.0

	while ( true )
	{
		WaitFrame()
		entity p = GetLocalViewPlayer()
		if ( !IsValid( p ) )
			continue

		string arma = "none"
		int pente = -1
		entity w = p.GetActiveWeapon()
		if ( IsValid( w ) )
		{
			arma = w.GetWeaponClassName()
			pente = w.GetWeaponPrimaryClipCount()
		}
		// cada bala a menos no pente da mesma arma = um disparo
		if ( arma == ultimaArma && pente >= 0 && ultimoPente > pente )
			tiros += ultimoPente - pente
		ultimaArma = arma
		ultimoPente = pente

		int vida = p.GetHealth()
		if ( ultimaVida > vida && vida >= 0 )
		{
			danos++
			ultimoDano = ultimaVida - vida
		}
		ultimaVida = vida

		int mirando = 0
		if ( p.GetZoomFrac() > 0.5 )
			mirando = 1
		int tita = 0
		if ( p.IsTitan() )
			tita = 1
		int vivo = 0
		if ( IsAlive( p ) )
			vivo = 1

		string estado = format( "%s|%d|%d|%d|%d|%d|%d|%d|%d|%d", arma, pente, tiros, danos, ultimoDano, vida, p.GetMaxHealth(), mirando, tita, vivo )
		// grava quando algo muda (e a cada 2 s, para o app saber que o mod está vivo)
		if ( estado != ultimo || Time() - salvoEm > 2.0 )
		{
			ultimo = estado
			salvoEm = Time()
			seq++
			NSSaveFile( "estado.txt", format( "%d|", seq ) + estado )
		}
	}
}
