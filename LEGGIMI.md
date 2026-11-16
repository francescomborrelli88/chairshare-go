# ChairShare Go · app agenda (PWA)

App separata dal sito, stesso database Supabase e stesso account.
Nessun passaggio di build: sono file statici (HTML, CSS, JS) pronti per Vercel.

- `index.html` → app del freelance (Oggi, Agenda, Richieste, Clienti, Profilo)
- `go.html` → pagina pubblica del cliente, raggiungibile da `/go/<slug>`
- `supabase/001_chairshare_go.sql` → aggiornamento del database (zone, richieste, impegni)
- Demo con dati di esempio, per presentazioni: `/?demo=1` e `/go/demo`

## Cosa funziona già senza toccare il database
Login, agenda con le postazioni prenotate sul sito, appuntamenti, listino, clienti,
link personale, pagina cliente con prenotazione (usa le funzioni che il sito ha già).

## Cosa si attiva dopo lo script 001
Zone di lavoro, richieste per i giorni senza sede, impegni personali, indirizzo nella conferma del cliente.

## Checklist del pomeriggio (circa 30 minuti)

1. **Database** · ✅ fatto il 16/11: script `supabase/001_chairshare_go.sql` eseguito e verificato
   (sito invariato: pagine, spazi, appuntamenti e pagamenti controllati dopo l'esecuzione).
2. **GitHub** · nuovo repository `chairshare-go`, caricare tutti i file di questa cartella.
3. **Vercel** · Add New → Project → importa `chairshare-go` → Framework: *Other*,
   nessun comando di build → Deploy.
4. **Dominio** · Vercel → Settings → Domains → aggiungi `app.chairshare.it`.
   Su Register.it, DNS di chairshare.it: record **CNAME** `app` → `cname.vercel-dns.com`.
5. **Supabase** · Authentication → URL Configuration → Redirect URLs:
   aggiungere `https://app.chairshare.it/**` (serve per l'accesso con link via email).
6. **Configurazione** · in `js/config.js`:
   - `APP_URL: 'https://app.chairshare.it'`
   - verificare `REVIEW_URL` (pagina recensioni del sito) e `SEARCH_URL`
     (parametri che il sito legge per filtrare città e data).
7. **Sito** · nella dashboard del freelance aggiungere il pulsante “La tua agenda” → `https://app.chairshare.it`.
   Decidere se il link personale mostrato sul sito punta alla nuova pagina `/go/<slug>`.
8. **Prova sul telefono**
   - Android (Chrome): menu ⋮ → *Installa app*
   - iPhone (Safari): Condividi → *Aggiungi alla schermata Home*

## Aggiornamenti futuri
Dopo ogni modifica ai file, cambiare `VERSIONE` in `sw.js` (es. `go-v2`)
così i telefoni scaricano la versione nuova.
