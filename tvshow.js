const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Configurazione del logger
const log = require('debug')('streamingcommunity-addon');
log.enabled = true;

// Utilizzo delle variabili d'ambiente per configurare l'URL del backend e la porta
const PYTHON_API_BASE_URL = process.env.PYTHON_API_BASE_URL || 'https://serietvpy.onrender.com';
const PORT = process.env.PORT || 7000;

// Configurazione dell'addon
const builder = new addonBuilder({
    id: 'org.stremio.streamingcommunity',
    version: '1.0.0',
    name: 'StreamingCommunity Addon',
    description: 'Addon per StreamingCommunity per lo streaming di contenuti',
    resources: ['stream', 'meta'],
    types: ['series'], // Tipo corretto per le serie TV in Stremio
    catalogs: [],
    idPrefixes: ["tt"] // Prefisso per gli IMDb ID
});

// Funzione per pulire il link m3u8
function cleanM3u8Link(url) {
    try {
        // Log originale
        log(`Original m3u8 URL: ${url}`);

        // Rimuove parametri duplicati o errati
        const cleanedUrl = url.replace('?b=1?', '?').replace('??', '?');
        log(`Link m3u8 pulito: ${cleanedUrl}`);
        return cleanedUrl;
    } catch (error) {
        log(`Errore nella pulizia del link m3u8: ${error.message}`);
        return url; // Restituisce l'URL originale in caso di errore
    }
}

// MetaHandler per fornire dettagli del titolo
builder.defineMetaHandler(async (args) => {
    log(`Richiesta MetaHandler per titolo: ${args.id}`);
    const imdbId = args.id;

    try {
        // Chiamata all'endpoint aggiornato per ottenere il best match della serie TV
        const bestMatchResponse = await axios.get(`${PYTHON_API_BASE_URL}/get_best_match_series`, {
            params: { imdb_id: imdbId }
        });

        if (!bestMatchResponse.data || bestMatchResponse.data.error) {
            log(`MetaHandler non ha trovato informazioni per il titolo: ${imdbId}`);
            return { meta: null };
        }

        const bestMatch = bestMatchResponse.data;

        log(`MetaHandler ha trovato i dettagli per il titolo: ${imdbId}`);

        // Mappatura del tipo da 'tv' a 'series'
        const stremioType = bestMatch.type.toLowerCase() === 'tv' ? 'series' : bestMatch.type.toLowerCase();

        return {
            meta: {
                id: imdbId,
                type: stremioType, // Mappatura del tipo
                name: bestMatch.title || bestMatch.name, // Utilizza 'title' o 'name' se 'title' non è disponibile
                poster: bestMatch.images ? bestMatch.images.find(img => img.type === 'poster')?.filename : null,
                background: bestMatch.images ? bestMatch.images.find(img => img.type === 'background')?.filename : null,
                description: bestMatch.plot,
                releaseInfo: bestMatch.year,
            }
        };
    } catch (error) {
        log(`Errore durante la richiesta MetaHandler: ${error.message}`);
        return { meta: null };
    }
});

// StreamHandler per fornire il link di streaming
builder.defineStreamHandler(async (args) => {
    log(`Richiesta StreamHandler per titolo: ${args.id}`);

    // Verifica se l'ID è un episodio (formato: tt1234567:1:1)
    const episodeMatch = args.id.match(/^(tt\d{7,8}):(\d+):(\d+)$/);
    if (episodeMatch) {
        const [_, imdbId, season, episode] = episodeMatch;

        try {
            // Chiamata all'endpoint per ottenere le informazioni dell'episodio
            const episodeInfoResponse = await axios.get(`${PYTHON_API_BASE_URL}/get_episode_info`, {
                params: { imdb_season_episode: `${imdbId}:${season}:${episode}` }
            });

            const episodeInfo = episodeInfoResponse.data;

            if (episodeInfo && episodeInfo.m3u8_playlist) {
                const m3u8Link = cleanM3u8Link(episodeInfo.m3u8_playlist);
                log(`Link di streaming per serie TV trovato: ${m3u8Link}`);
                return {
                    streams: [
                        {
                            name: 'StreamingCommunity',
                            description: 'Streaming tramite StreamingCommunity',
                            url: m3u8Link,
                            behaviorHints: {
                                notWebReady: true
                            }
                        }
                    ]
                };
            } else {
                log('StreamHandler non ha trovato link m3u8 per l\'episodio.');
                return { streams: [] };
            }
        } catch (error) {
            log(`Errore durante la richiesta all'API Python per episodio: ${error.message}`);
            return { streams: [] };
        }
    } else {
        // Se non è un episodio, restituisce un array vuoto
        log(`StreamHandler non riconosce l'ID come episodio: ${args.id}`);
        return { streams: [] };
    }
});

// Avvia il server dell'addon
serveHTTP(builder.getInterface(), { port: PORT, address: '0.0.0.0' });

log(`Addon è in ascolto sulla porta ${PORT}`);
