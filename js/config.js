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

  // Link per lasciare una recensione al freelance (pagina del sito ?review=). {slug} viene sostituito.
  REVIEW_URL: 'https://chairshare.it/?review={slug}',

  // Ricerca spazi sul sito già filtrata per città o zona (il sito legge ?city=nome-in-minuscolo).
  SEARCH_URL: 'https://chairshare.it/?city={citta}',

  // Il preavviso per le prenotazioni online lo sceglie ogni freelance nel Profilo
  // (entro il giorno prima, oppure almeno 12, 6 o 3 ore). Il database applica la stessa regola.
  _nota: ''
};
