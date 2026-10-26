# Catalogo Multimediale (DDD & MCP Experiment)

Questo repository raccoglie lo sviluppo di un **Catalogo Multimediale** desktop guidato dai sani principi dell'ingegneria del software e della programmazione agentica. Il progetto nasce come una sessione di co-programmazione d'élite tra un **Senior Team Lead / Staff Engineer** e l'**Intelligenza Artificiale (Claude 3.5 Sonnet tramite l'estensione Cline su VS Code)**.

L'obiettivo principale del progetto è dimostrare come sia possibile sviluppare un'applicazione desktop moderna, robusta, fortemente tipizzata e disaccoppiata, riducendo quasi a zero l'attrito dell'apprendimento di nuovi linguaggi (come Rust) grazie a un uso strategico e modulare dell'AI.

---

## 🛠️ Stack Tecnologico e Ambiente di Lavoro

L'applicazione è sviluppata su un portatile **Dell XPS 13** con **Kubuntu 24.04 LTS (Noble Numbat)** e l'ambiente grafico KDE Plasma. Lo stack è composto da:
*   **Runtime:** Node.js 24 (ESM nativo) con TypeScript (`tsc` per la compilazione).
*   **Package Manager:** `npm` per la gestione delle dipendenze.
*   **Frontend:** React (Vite + TypeScript) con pannelli adattivi e dashboard di filtraggio.
*   **Testing:** Jest con pattern di **Co-location** (i file `.spec.ts` vivono accanto al codice di produzione).
*   **Persistenza:** SQLite locale gestito tramite Repository Pattern (isolato `:memory:` per i test di integrazione).
*   **Qualità del codice:** ESLint + Prettier (con *formatOnSave* attivo).

---

## 📐 Architettura del Software (DDD Tattico)

Il cuore dell'applicazione è guidato dal **Domain-Driven Design (DDD) Tattico**:
1.  **Modello Ricco (Non Anemico):** La logica di business risiede all'interno delle entità. L'ID di ogni elemento viene autogenerato nel dominio tramite il modulo `crypto` nativo di Node 24.
2.  **Entità Concrete:** `Book` (richiede `IsbnVo`), `Vinyl` e `CD` (richiedono `BarcodeVo`), `VideoFile` e `AudioFile` (richiedono `AbsolutePathVo`).
3.  **Value Objects (VO):** `IsbnVo` (validazione rigida 10/13 cifre e pulizia automatica di spazi/trattini), `BarcodeVo` (validazione EAN/UPC), `AbsolutePathVo` (validazione percorsi POSIX Linux).
4.  **CQRS (Command Query Responsibility Segregation):** I flussi di scrittura e lettura sono nettamente separati in Command e Query Handlers (es. `EnrichAndCreateItemCommand`).

---

## 🧠 La Roadmap dei Passaggi Eseguiti (e i Prompt Utilizzati)

### 1. Architettura dell'Applicazione in Node.js e TypeScript
Il progetto è stato concepito fin dal principio come un'applicazione desktop snella e moderna basata su tecnologie web, ingegnerizzata interamente in Node.js 24 (ESM nativo) e TypeScript. L'architettura segue un approccio monolitico pulito guidato dal DDD, dove l'applicazione viene avviata da un singolo punto di ingresso (`src/infrastructure/http/main.ts`) tramite lo strumento `tsx`, che si occupa dell'esecuzione e del caricamento nativo delle variabili d'ambiente dal file `.env`. I server MCP esterni per l'arricchimento dei dati vengono agganciati dal runtime come sottoprocessi di I/O (via Stdio), mantenendo la logica di business centralizzata ed evitando la complessità di architetture multi-processo separate.


### 2. Il Problema del Knowledge Cutoff e il Pivot verso MCP
Inserendo un codice ISBN-10 per *"Lo Hobbit"* di Tolkien, l'arricchimento dell'AI restituiva valori `"Unknown"` a causa del limite temporale nativo del modello. 
Invece di scrivere client HTTP tradizionali verso API esterne, abbiamo fatto un pivot architetturale integrando il **Model Context Protocol (MCP)** di Anthropic. 

Abbiamo scritto un **MCP Client programmatico in Node.js** che lancia in background tramite `stdio` e `npx` due server MCP indipendenti:
*   `mcp-open-library` (per la risoluzione deterministica degli ISBN).
*   `@cyanheads/musicbrainz-mcp-server@latest` (per i Barcode di CD e Vinili, iniettando a runtime le variabili d'ambiente di sicurezza come `MUSICBRAINZ_CONTACT`).

Grazie a questa architettura, l'applicazione non sa a monte quali API chiamare: **Claude analizza i tool esposti dai server MCP vivi, decide autonomamente quale tool invocare, e passa il risultato grezzo all'Anticorruption Layer (ACL) dell'applicazione per la normalizzazione in JSON.**

#### 📝 Prompt utilizzato per l'integrazione dell'MCP Client:
```text
Act as an elite software engineer. We need to implement the final production-ready MCP Client inside our Node.js 24 (ESM) application using npm and tsc. 

We need to connect to two external MCP servers via Stdio transport. The client must programmatically inject the necessary environment variables for the second server to prevent API blocking.

Please execute the following steps:
1. Run `npm install @modelcontextprotocol/sdk` to ensure the official SDK is available.
2. Read our `.env` file and look for an email configuration (or add a fallback/placeholder variable like `MUSICBRAINZ_CONTACT` inside the strongly-typed environment config config layer).
3. Create the infrastructure service at `src/infrastructure/mcp/mcp-client.service.ts`. This service must programmatically spawn:
   - Server 1: 'mcp-open-library' using command "npx" and args ["-y", "mcp-open-library"]. (cfr. https://github.com/8enSmith/mcp-open-library)
   - Server 2: 'musicbrainz-mcp-server' using command "npx", args ["-y", "@cyanheads/musicbrainz-mcp-server@latest"], and dynamically passing the environment variables block: `{ "MCP_TRANSPORT_TYPE": "stdio", "MCP_LOG_LEVEL": "info", "MUSICBRAINZ_CONTACT": process.env.MUSICBRAINZ_CONTACT }`. (cfr. https://github.com/cyanheads/musicbrainz-mcp-server)
4. Implement tool namespacing (e.g., 'serverName__toolName') within the client service to cleanly merge and isolate all discovered tools before passing them to Anthropic.
5. Inspect and update our CQRS command handler at @src/application/commands/enrich-and-create-item.command.ts. Replace the hardcoded tools with the dynamic array from `mcpClient.getAllTools()`.
6. Update the tool-use resolution loop to route the requested execution through `mcpClient.executeTool()` dynamically based on the namespace, then feed the result back to Claude's Anticorruption Layer (ACL) for final JSON normalization.
7. Run `npx tsc --noEmit` to verify that there are no TypeScript compilation or strict type mismatches.

Review the plan and show me the file diffs before saving.
```

TODO
### 4. Risoluzione dei Bug di Payload su Grandi Opere
Interrogando libri con centinaia di edizioni (come *"The Hobbit"*), il server MCP restituiva un JSON gigantesco che saturava la context window o corrompeva il parsing. Abbiamo risolto forzando la sanificazione dell'input all'interno di `IsbnVo` e istruendo l'ACL a filtrare i risultati, garantendo performance ottimali e consumi di token irrisori.

#### 📝 Prompt utilizzato per il fix del payload:
```text
Act as an elite software engineer. We have a regression where querying a highly published book (like "The Hobbit") causes a failure due to an excessively large JSON payload returning from the Open Library MCP server, which breaks the parsing or context limits.

We need to patch the system immediately. Please perform these steps:
1. Inspect our IsbnVo file (locate it via @src/domain/ or wherever your Value Objects are stored). Ensure that its internal validation strictly strips all dashes, spaces, and formatting, enforcing a clean 10 or 13-digit raw string.
2. Inspect our command handler at @src/application/commands/enrich-and-create-item.command.ts. Inside the tool resolution loop, right before calling `mcpClient.executeTool()`, inject a defensive sanitization step: ensure the `isbn` parameter passed to the tool is exactly the clean value from our `IsbnVo`, preventing broad or malformed queries.
3. If the MCP response text still contains a large array, add a defensive slice or trunk mechanism in the handler's `parseFinalOutput` method to gracefully handle large payloads, or instruct Claude in the system prompt to: "Only parse the first matching edition from the tool result array to minimize token bloat."
4. Run `npx tsc --noEmit` to verify type safety after this defensive patch.

Show me the diff for approval before saving.
```


---

## 🚀 Come Eseguire l'Applicazione in Sviluppo

1. Assicurati di avere installato Node.js 24 ed `npm` sul tuo sistema Linux Kubuntu.
2. Clona il repository ed entra nella cartella di progetto.
3. Crea un file `.env` nella root del progetto inserendo le tue chiavi:
   ```env
   PORT=3000
   DATABASE_FILE=catalog.sqlite
   ANTHROPIC_API_KEY=sk-ant-...
   CLAUDE_MODEL=claude-3-5-sonnet-20241022
   MUSICBRAINZ_CONTACT=la_tua_email@esempio.com
   ```
4. Installa le dipendenze:
   ```bash
   npm install
   ```
5. Avvia l'applicazione (l'infrastruttura caricherà il file `.env` ed eseguirà il server HTTP):
   ```bash
   npm start
   ```
6. Esegui la suite di test co-locati:
   ```bash
   npm run test
   ```
