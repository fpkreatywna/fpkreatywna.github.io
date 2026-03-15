import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- KONFIGURACJA FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyC9g76-SeUy-rQwNy4oaMI1-TusiRhZfXo",
  authDomain: "lokalizator-a76bd.firebaseapp.com",
  projectId: "lokalizator-a76bd",
  storageBucket: "lokalizator-a76bd.appspot.com",
  messagingSenderId: "1021436619523",
  appId: "1:1021436619523:web:6591409d3f3776baee1736",
  measurementId: "G-FGXDSSBYH6"
};

// --- KLUCZ GEMINI API (ZASZYTY NA STAŁE) ---
const geminiApiKey = "AIzaSyDw0v8d_UHP1g433CzE3IVNP_Nff9LwDGs";

// --- ZMIENNE GLOBALNE ---
let itemsCollectionRef;
let localItemsCache = [];

// --- ELEMENTY INTERFEJSU ---
const micButton = document.getElementById('micButton');
const voiceStatus = document.getElementById('voiceStatus');
const itemsList = document.getElementById('itemsList');
const authStatusSpan = document.getElementById('authStatus');
const loadingMessage = document.getElementById('loadingMessage');

// --- GŁÓWNA FUNKCJA URUCHAMIAJĄCA ---
async function startApp() {
    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        setLogLevel('error');
        itemsCollectionRef = collection(db, "items");
        
        authStatusSpan.textContent = "Logowanie do bazy danych...";
        if (auth.currentUser === null) {
            await signInAnonymously(auth);
        }
        
        authStatusSpan.textContent = "Połączono ze wspólną bazą danych.";
        micButton.disabled = false;
        voiceStatus.textContent = 'Naciśnij mikrofon, aby mówić';
        setupRealtimeListener();
        setupVoiceRecognition();

    } catch (error) {
        console.error("Krytyczny błąd startu aplikacji:", error);
        authStatusSpan.textContent = "Błąd połączenia z bazą danych.";
        voiceStatus.textContent = "Nie udało się uruchomić aplikacji.";
        showToast("Błąd krytyczny. Odśwież stronę.", "error");
    }
}

document.addEventListener('DOMContentLoaded', startApp);

// --- POWIADOMIENIA (TOAST) ---
const showToast = (message, type = 'info', duration = 3000) => {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => { toast.className = toast.className.replace('show', ''); }, duration);
    }
};

// --- NASŁUCHIWANIE ZMIAN W BAZIE W CZASIE RZECZYWISTYM ---
function setupRealtimeListener() {
    if (!itemsCollectionRef) return;
    onSnapshot(itemsCollectionRef, (snapshot) => {
        localItemsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderItems(localItemsCache);
    }, (error) => { 
        console.error("Błąd nasłuchiwania zmian:", error);
        showToast("Błąd synchronizacji danych.", "error");
    });
}

// --- RENDEROWANIE LISTY PRZEDMIOTÓW ---
const renderItems = (items) => {
    itemsList.innerHTML = '';
    loadingMessage.style.display = 'none';
    if (items.length === 0) {
        itemsList.innerHTML = `<p class="text-center text-gray-500 py-8">Brak przedmiotów. Użyj mikrofonu, aby dodać pierwszy!</p>`;
        return;
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'py-4 flex flex-col md:flex-row items-start md:items-center justify-between border-b border-gray-100';
        itemElement.innerHTML = `
            <div class="flex-grow mb-4 md:mb-0">
                <p class="text-lg font-semibold text-gray-900">${item.name}</p>
                <p class="text-sm text-indigo-600 font-medium">${item.location || 'Brak lokalizacji'}</p>
            </div>
            <div class="flex-shrink-0">
                <button data-id="${item.id}" class="delete-btn p-2 text-gray-400 hover:text-red-600 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
                </button>
            </div>`;
        itemsList.appendChild(itemElement);
    });
};

// --- USUWANIE PRZEDMIOTU ---
itemsList.addEventListener('click', async (e) => {
    if (e.target.closest('.delete-btn')) {
        const button = e.target.closest('.delete-btn');
        const id = button.dataset.id;
        try {
            await deleteDoc(doc(itemsCollectionRef, id));
            showToast("Przedmiot usunięty.", "success");
        } catch (error) { 
            console.error("Błąd usuwania:", error);
            showToast("Nie udało się usunąć przedmiotu.", "error");
        }
    }
});

// --- ROZPOZNAWANIE MOWY ---
function setupVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'pl-PL';
        recognition.continuous = false;
        micButton.addEventListener('click', () => { 
            if (micButton.classList.contains('listening')) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });
        recognition.onstart = () => { 
            micButton.classList.add('listening'); 
            voiceStatus.textContent = 'Słucham...'; 
        };
        recognition.onend = () => { 
            micButton.classList.remove('listening'); 
            voiceStatus.textContent = 'Naciśnij mikrofon, aby mówić'; 
        };
        recognition.onerror = (event) => {
            voiceStatus.textContent = `Błąd: ${event.error}`;
        };
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            voiceStatus.textContent = `Przetwarzam: "${transcript}"`;
            processCommandWithAI(transcript);
        };
    } else {
        micButton.disabled = true;
        voiceStatus.textContent = 'Twoja przeglądarka nie wspiera rozpoznawania mowy.';
    }
}

// --- PRZETWARZANIE POLECENIA PRZEZ AI (GEMINI) ---
async function processCommandWithAI(command) {
    voiceStatus.textContent = `Analizuję polecenie...`;
    const systemPrompt = `Jesteś asystentem zarządzania inwentarzem dla polskojęzycznego użytkownika. Twoim zadaniem jest interpretowanie poleceń i przekształcanie ich w format JSON. ZAWSZE normalizuj nazwy przedmiotów do ich podstawowej, pojedynczej formy (mianownik liczby pojedynczej). Dostępne akcje to "add", "update", "find", "delete", "unknown", oraz "add_or_update". Używaj "add_or_update" dla niejednoznacznych poleceń jak "X jest w Y" albo "Położyłem X w Y". Używaj "add" tylko dla jawnych poleceń typu "dodaj X". Używaj "update" tylko dla jawnych poleceń typu "przenieś X". Przykłady: Użytkownik mówi "Gdzie położyłem moje stare taśmy klejące?", ty odpowiadasz {"action": "find", "itemName": "stara taśma klejąca"}. Użytkownik mówi "Taśma klejąca jest teraz w szafie", ty odpowiadasz {"action": "add_or_update", "itemName": "taśma klejąca", "location": "szafa"}. Użytkownik mówi "Przenieś wiertarki do szafy", ty odpowiadasz {"action": "update", "itemName": "wiertarka", "location": "szafa"}. Użytkownik mówi "dodaj gwoździe do pudełka", ty odpowiadasz {"action": "add", "itemName": "gwóźdź", "location": "pudełko"}.`;
    const fullPrompt = `${systemPrompt}\n\nPolecenie użytkownika: "${command}"`;
    const schema = { 
        type: "OBJECT", 
        properties: { 
            action: { type: "STRING", enum: ["add", "update", "find", "delete", "unknown", "add_or_update"] }, 
            itemName: { type: "STRING" }, 
            location: { type: "STRING" } 
        } 
    };

    try {
        // --- ADRES STABILNEGO MODELU GEMINI-2.5-FLASH ---
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: fullPrompt }] }], 
                generationConfig: { 
                    responseMimeType: "application/json", 
                    responseSchema: schema 
                } 
            })
        });

        if (!response.ok) throw new Error(`Błąd API Gemini: ${response.statusText}`);
        
        const result = await response.json();
        const jsonText = result.candidates[0].content.parts[0].text;
        const aiResponse = JSON.parse(jsonText);
        await executeDatabaseAction(aiResponse);

    } catch (error) {
        console.error("Błąd AI:", error);
        showToast("Nie udało się przetworzyć polecenia przez AI.", "error");
    }
}

// --- WYKONYWANIE AKCJI W BAZIE DANYCH ---
async function executeDatabaseAction(res) {
    if (!itemsCollectionRef) return;
    const { action, itemName, location } = res;
    
    const findBestMatch = (searchTerm) => {
        if (!searchTerm) return null;
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const candidates = localItemsCache.filter(item => 
            item.name.toLowerCase().includes(lowerCaseSearchTerm) || 
            lowerCaseSearchTerm.includes(item.name.toLowerCase())
        );
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => 
            Math.abs(a.name.length - lowerCaseSearchTerm.length) - 
            Math.abs(b.name.length - lowerCaseSearchTerm.length)
        );
        return candidates[0];
    };

    try {
        switch (action) {
            case 'add_or_update':
                const itemToFind = findBestMatch(itemName);
                if (itemToFind) {
                    await updateDoc(doc(itemsCollectionRef, itemToFind.id), { location: location });
                    showToast(`Zaktualizowano lokalizację: "${itemToFind.name}"`, 'success');
                } else {
                    await addDoc(itemsCollectionRef, { name: itemName, location: location });
                    showToast(`Dodano nowy przedmiot: "${itemName}"`, 'success');
                }
                break;

            case 'add':
                const existingItem = findBestMatch(itemName);
                if (existingItem) {
                    showToast(`"${existingItem.name}" już jest w bazie.`, 'info');
                } else {
                    await addDoc(itemsCollectionRef, { name: itemName, location: location });
                    showToast(`Dodano "${itemName}"`, 'success');
                }
                break;

            case 'update':
                const itemToUpdate = findBestMatch(itemName);
                if (itemToUpdate) {
                    await updateDoc(doc(itemsCollectionRef, itemToUpdate.id), { location: location });
                    showToast(`Przeniesiono "${itemToUpdate.name}" do "${location}"`, 'success');
                } else {
                    showToast(`Nie znalazłem przedmiotu: "${itemName}"`, 'error');
                }
                break;

            case 'delete':
                const itemToDelete = findBestMatch(itemName);
                if (itemToDelete) {
                    await deleteDoc(doc(itemsCollectionRef, itemToDelete.id));
                    showToast(`Usunięto "${itemToDelete.name}"`, 'success');
                } else {
                    showToast(`Nie znaleziono do usunięcia: "${itemName}"`, 'error');
                }
                break;

            case 'find':
                const foundItem = findBestMatch(itemName);
                if (foundItem) {
                    showToast(`"${foundItem.name}" jest w: ${foundItem.location}`, 'info', 5000);
                } else {
                    showToast(`Nie wiem, gdzie jest: "${itemName}"`, 'error');
                }
                break;
                
            default:
                showToast("Nie zrozumiałem Twojej prośby.", 'error');
                break;
        }
    } catch (e) {
        console.error("Błąd akcji bazy danych:", e);
        showToast("Wystąpił błąd podczas pracy z bazą danych.", "error");
    }
                              }
