const vscode = acquireVsCodeApi();

// Elementos del DOM
const fromLang = document.getElementById('fromLang');
const toLang = document.getElementById('toLang');
const swapLangs = document.getElementById('swapLangs');
const inputText = document.getElementById('inputText');
const translateBtn = document.getElementById('translateBtn');
const clearBtn = document.getElementById('clearBtn');
const translationResult = document.getElementById('translationResult');
const textActions = document.getElementById('textActions');

const translateVarBtn = document.getElementById('translateVarBtn');

// Event listeners para traductor de texto
translateBtn.addEventListener('click', () => {
    const text = inputText.value.trim();
    if (!text) return;
    
    translateBtn.classList.add('loading');
    translateBtn.textContent = 'Traduciendo...';
    
    vscode.postMessage({
        command: 'translateText',
        text: text,
        fromLang: fromLang.value,
        toLang: toLang.value
    });
});

clearBtn.addEventListener('click', () => {
    inputText.value = '';
    translationResult.classList.add('hidden');
    textActions.classList.add('hidden');
});

swapLangs.addEventListener('click', () => {
    const temp = fromLang.value;
    fromLang.value = toLang.value;
    toLang.value = temp;
});

// Event listener para traductor de variables (funciona con texto seleccionado)
translateVarBtn.addEventListener('click', () => {
    translateVarBtn.classList.add('loading');
    translateVarBtn.textContent = 'Traduciendo...';
    
    vscode.postMessage({
        command: 'translateVariableSelected'
    });
});

// Botones de acción para texto
document.getElementById('copyResult').addEventListener('click', () => {
    navigator.clipboard.writeText(translationResult.textContent);
});

document.getElementById('insertResult').addEventListener('click', () => {
    vscode.postMessage({
        command: 'insertAtCursor',
        text: translationResult.textContent
    });
});

document.getElementById('replaceResult').addEventListener('click', () => {
    vscode.postMessage({
        command: 'replaceSelected',
        text: translationResult.textContent
    });
});

// Manejar respuestas del backend
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'translationResult':
            translateBtn.classList.remove('loading');
            translateBtn.textContent = 'Traducir';
            translationResult.textContent = message.result;
            translationResult.classList.remove('hidden');
            textActions.classList.remove('hidden');
            break;
            
        case 'variableTranslated':
            translateVarBtn.classList.remove('loading');
            translateVarBtn.textContent = 'Traducir Variable Seleccionada';
            break;
    }
});

// Traducir con Enter
inputText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        translateBtn.click();
    }
});