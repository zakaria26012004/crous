import { readFileSync, writeFileSync, existsSync } from "node:fs";

// --- Configuration de la recherche (issue de ton URL trouverunlogement.lescrous.fr) ---
const TOOL_ID = 42;
const OCCUPATION_MODES = ["alone"];
const MAX_PRICE_EUROS = 450;
// bounds=-1.7525876_48.1549705_-1.6244045_48.0769155 -> [lon1,lat1,lon2,lat2]
const BOUNDS = {
  topLeft: { lon: -1.7525876, lat: 48.1549705 },
  bottomRight: { lon: -1.6244045, lat: 48.0769155 },
};

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const STATE_FILE = new URL("./state.json", import.meta.url);

if (!NTFY_TOPIC) {
  console.error("NTFY_TOPIC n'est pas défini (variable d'environnement).");
  process.exit(1);
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { seenIds: [] };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { seenIds: [] };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

async function fetchListingsOnce() {
  const body = {
    idTool: TOOL_ID,
    need_aggregation: false,
    page: 1,
    pageSize: 50,
    occupationModes: OCCUPATION_MODES,
    location: [BOUNDS.topLeft, BOUNDS.bottomRight],
    price: { max: MAX_PRICE_EUROS * 100 },
    area: { min: 0 },
    adaptedPmr: false,
  };

  const res = await fetch(
    `https://trouverunlogement.lescrous.fr/api/fr/search/${TOOL_ID}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    throw new Error(`Erreur API CROUS: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.results.items;
}

// Le site CROUS a occasionnellement des erreurs/timeouts transitoires ;
// on retente quelques fois avant d'abandonner pour éviter un run rouge
// à chaque blip réseau isolé.
async function fetchListings(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchListingsOnce();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Tentative ${attempt}/${retries} échouée (${err.message}), nouvel essai...`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

async function notify(item) {
  const label = item.residence?.label ?? "Logement CROUS";
  const address = item.residence?.address ?? "";
  const priceCents = item.bookingData?.amount;
  const price = typeof priceCents === "number" ? `${(priceCents / 100).toFixed(2)}€/mois` : "";
  const url = `https://trouverunlogement.lescrous.fr/tools/${TOOL_ID}/accommodations/${item.id}`;
  const lines = [address, price, url].filter(Boolean);

  const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: `Nouveau logement CROUS: ${label}`,
      Priority: "urgent",
      Tags: "house,bellhop_bell",
    },
    body: lines.join("\n"),
  });

  if (!res.ok) {
    throw new Error(`Erreur ntfy: ${res.status} ${res.statusText}`);
  }
}

async function main() {
  const state = loadState();
  const seen = new Set(state.seenIds);

  const items = await fetchListings();
  console.log(`[${new Date().toISOString()}] ${items.length} logement(s) trouvé(s) au total.`);

  const newItems = items.filter((item) => !seen.has(item.id));

  for (const item of newItems) {
    console.log(`Nouveau logement détecté: id=${item.id} ${item.residence?.label ?? ""}`);
    await notify(item);
    seen.add(item.id);
  }

  // On réécrit l'état avec les logements actuellement listés (pas un cumul
  // infini) : si un logement disparaît puis réapparaît plus tard, il sera
  // à nouveau considéré comme "nouveau" et redéclenchera une notification.
  // lastChecked change à chaque run, ce qui garantit un commit régulier et
  // évite que GitHub désactive le workflow planifié pour cause d'inactivité.
  saveState({ seenIds: items.map((item) => item.id), lastChecked: new Date().toISOString() });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
