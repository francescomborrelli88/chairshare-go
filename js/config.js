// Configurazione di ChairShare Go.
// La chiave qui sotto è quella pubblica (publishable) di Supabase: può stare nel codice
// del browser, la sicurezza è garantita dalle regole RLS del database.
window.GO_CONFIG = {
  SUPABASE_URL: 'https://eyghtnxuhxdyqsayjygi.supabase.co',
  SUPABASE_KEY: 'sb_publishable__uD40U9DBYrKiQQ4aJLGYQ_w6pmAcxq',

  // Sito principale (marketplace degli spazi)
  SITO_URL: 'https://www.chairshare.it',

  // Indirizzo dove sarà pubblicata l'app (serve per il link personale del freelance).
  // Se resta vuoto usa l'indirizzo da cui è aperta.
  APP_URL: 'https://app.chairshare.it',

  // Link per lasciare una recensione al freelance. {slug} viene sostituito.
  // DA VERIFICARE con il sito: deve aprire la pagina recensioni già esistente.
  REVIEW_URL: 'https://www.chairshare.it/?recensione={slug}',

  // Ricerca spazi sul sito già filtrata. {citta} e {data} vengono sostituiti.
  // DA VERIFICARE: il sito deve leggere questi parametri (se li ignora apre la Home).
  SEARCH_URL: 'https://www.chairshare.it/?citta={citta}&data={data}',

  // Il preavviso per le prenotazioni online lo sceglie ogni freelance nel Profilo
  // (entro il giorno prima, oppure almeno 12, 6 o 3 ore). Il database applica la stessa regola.
  _nota: ''
};
