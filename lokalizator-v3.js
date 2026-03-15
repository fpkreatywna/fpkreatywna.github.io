import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9g76-SeUy-rQwNy4oaMI1-TusiRhZfXo",
  authDomain: "lokalizator-a76bd.firebaseapp.com",
  projectId: "lokalizator-a76bd",
  storageBucket: "lokalizator-a76bd.appspot.com",
  messagingSenderId: "1021436619523",
  appId: "1:1021436619523:web:6591409d3f3776baee1736",
  measurementId: "G-FGXDSSBYH6"
};

const geminiApiKey = "AIzaSyDw0v8d_UHP1g433CzE3IVNP_Nff9LwDGs";

let itemsCollectionRef;
let localItemsCache = [];

const micButton = document.getElementById('micButton');
const voiceStatus = document.getElementById('voiceStatus');
const itemsList = document.getElementById('itemsList');
const authStatusSpan = document.getElementById('authStatus');
const loadingMessage = document.getElementById('loadingMessage');

async function startApp() {
    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        setLogLevel('error');
        itemsCollectionRef = collection(db, "items");
        authStatusSpan.textContent = "Logowanie...";
        if (auth.currentUser === null) await signInAnonymously(auth);
        authStatusSpan.textContent = "Połączono ze wspólną bazą danych.";
        micButton.disabled = false;
        voiceStatus.textContent = 'Naciśnij mikrofon, aby mówić';
        setupRealtimeListener();
        setupVoiceRecognition();
    } catch (error) {
        authStatusSpan.textContent = "Błąd połączenia.";
    }
}

document.addEventListener('DOMContentLoaded', startApp);

const showToast = (message, type = 'info') => {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
    }
};

function setupRealtimeListener() {
    if (!itemsCollectionRef) return;
    onSnapshot(itemsCollectionRef, (snapshot) => {
        localItemsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderItems(localItemsCache);
    });
}

const renderItems = (items) => {
    itemsList.innerHTML = '';
    if (loadingMessage) loadingMessage.style.display = 'none';
    if (items.length === 0) {
        itemsList.innerHTML = `<p class="text-center text-gray-500 py-8">Brak przedmiotów.</p>`;
        return;
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'py-4 flex items-center justify-between border-b border-gray-100';
        itemElement.innerHTML = `
            <div><p class="font-semibold text-gray-900">${item.name}</p><p class="text-sm text-indigo-600">${item.location || ''}</p></div>
            <button data-id="${item.id}" class="delete-btn p-2 text-gray-400 hover:text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>`;
        itemsList.appendChild(itemElement);
    });
};

itemsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-btn');
    if (btn) await deleteDoc(doc(itemsCollectionRef, btn.dataset.id));
});

function setupVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    micButton.addEventListener('click', () => { micButton.classList.contains('listening') ? recognition.stop() : recognition.start(); });
    recognition.onstart = () => { micButton.classList.add('listening'); voiceStatus.textContent = 'Słucham...'; };
    recognition.onend = () => { micButton.classList.remove('listening'); voiceStatus.textContent = 'Naciśnij mikrofon'; };
    recognition.onresult = (event) => processCommandWithAI(event.results[0][0].transcript);
}

async function processCommandWithAI(command) {
    voiceStatus.textContent = `Analizuję: "${command}"...`;
    const prompt = `Interpretuj polecenie i oddaj JSON. Akcje: add, update, find, delete, add_or_update. Przedmioty w mianowniku lp. Polecenie: "${command}"`;
    const schema = { type: "OBJECT", properties: { action: { type: "STRING" }, itemName: { type: "STRING" }, location: { type: "STRING" } } };
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } })
        });
        const result = await response.json();
        const aiResponse = JSON.parse(result.candidates[0].content.parts[0].text);
        await executeDatabaseAction(aiResponse);
    } catch (error) {
        showToast("Błąd AI. Spróbuj jeszcze raz.", "error");
    }
}

async function executeDatabaseAction(res) {
    const { action, itemName, location } = res;
    const item = localItemsCache.find(i => i.name.toLowerCase().includes(itemName.toLowerCase()));
    if (action === 'add' || (action === 'add_or_update' && !item)) {
        await addDoc(itemsCollectionRef, { name: itemName, location: location });
        showToast("Dodano!");
    } else if (item && (action === 'update' || action === 'add_or_update')) {
        await updateDoc(doc(itemsCollectionRef, item.id), { location: location });
        showToast("Zaktualizowano!");
    } else if (item && action === 'find') {
        showToast(`${item.name} jest w: ${item.location}`);
    }
}
