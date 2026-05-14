/**
 * Google Calendar Service for CRM
 * Handles OAuth2 authentication and Event creation
 */

// Configurações do Google Cloud (Necessário configurar no console.cloud.google.com)
// 1. Ative a "Google Calendar API"
// 2. Crie uma "Chave de API" (API_KEY)
// 3. Crie um "ID do cliente OAuth 2.0" do tipo "Aplicativo da Web" (CLIENT_ID)
// 4. Adicione seu domínio (ex: http://localhost:5502) em "Origens JavaScript autorizadas"

const CLIENT_ID = '1035486597492-lh8m7q627kh0p2oliituljq35gstved5.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAyR1EP87FI0SvMsEZ_b_zHw-icsa0I3sg';

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

// Authorization scopes required by the API
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

let tokenClient;
let gapiInited = false;
let gsisInited = false;

/**
 * Initialize Google API client and Identity Services
 */
export async function initGoogleApi() {
    return new Promise((resolve) => {
        const checkReady = () => {
            if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
                gapi.load('client', async () => {
                    await gapi.client.init({
                        apiKey: API_KEY,
                        discoveryDocs: [DISCOVERY_DOC],
                    });
                    gapiInited = true;
                    
                    tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: CLIENT_ID,
                        scope: SCOPES,
                        callback: '', // defined at request time
                    });
                    gsisInited = true;
                    console.log("Google API Inicializada");
                    resolve(true);
                });
            } else {
                setTimeout(checkReady, 500);
            }
        };
        checkReady();
    });
}

/**
 * Request access token and execute a callback
 */
async function getToken(callback) {
    if (!gsisInited) await initGoogleApi();
    
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        await callback();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({prompt: ''});
    }
}

/**
 * Create a calendar event for a payment
 */
export async function createPaymentEvent(venda, numParcela, dataVencimento, valor) {
    return new Promise((resolve, reject) => {
        getToken(async () => {
            try {
                const event = {
                    'summary': `Vencimento: Parcela ${numParcela} - ${venda.nome}`,
                    'description': `Cliente: ${venda.nome}\nCPF: ${venda.cpfCnpj}\nValor da Parcela: R$ ${valor}\nContrato: ${venda.numeroContrato || 'N/A'}\n\nLembrete automático do CRM.`,
                    'start': {
                        'date': dataVencimento, // Use 'date' for all-day event
                        'timeZone': 'America/Sao_Paulo'
                    },
                    'end': {
                        'date': dataVencimento,
                        'timeZone': 'America/Sao_Paulo'
                    },
                    'reminders': {
                        'useDefault': false,
                        'overrides': [
                            {'method': 'popup', 'minutes': 1440}, // 1 day before
                            {'method': 'popup', 'minutes': 60}     // 1 hour before
                        ]
                    }
                };

                const request = gapi.client.calendar.events.insert({
                    'calendarId': 'primary',
                    'resource': event
                });

                request.execute((event) => {
                    console.log('Evento criado: ' + event.htmlLink);
                    resolve(event);
                });
            } catch (err) {
                console.error('Erro ao criar evento:', err);
                reject(err);
            }
        }).catch(reject);
    });
}
