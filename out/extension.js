"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const fs = require("fs");
const axios_1 = require("axios");
/* ============================================================
   ========== WEBVIEW PROVIDER (TU TRADUCTOR) =================
   ============================================================ */
class TraductorViewProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'translateText':
                    try {
                        const translated = await translateText(data.text, data.fromLang, data.toLang);
                        webviewView.webview.postMessage({
                            command: 'translationResult',
                            result: translated
                        });
                    }
                    catch (error) {
                        webviewView.webview.postMessage({
                            command: 'translationError',
                            error: 'Error al traducir'
                        });
                    }
                    break;
                case 'translateVariable':
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showInformationMessage('No hay un editor activo.');
                        return;
                    }
                    const selection = editor.selection;
                    const selectedText = editor.document.getText(selection).trim();
                    if (!selectedText) {
                        vscode.window.showInformationMessage('Selecciona una variable para traducir.');
                        return;
                    }
                    try {
                        const textoEspaciado = selectedText.replace(/([a-z])([A-Z])/g, '$1 $2');
                        const traducido = await translateText(textoEspaciado, 'es', 'en');
                        const camelCase = toCamelCase(traducido);
                        await editor.edit(editBuilder => {
                            editBuilder.replace(selection, camelCase);
                        });
                        vscode.window.showInformationMessage(`✅ Variable traducida: '${selectedText}' → '${camelCase}'`);
                    }
                    catch (error) {
                        vscode.window.showErrorMessage('Error al traducir variable');
                    }
                    break;
            }
        });
    }
    _getHtmlForWebview(webview) {
        const htmlUri = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'traductor.html');
        return fs.readFileSync(htmlUri.fsPath, 'utf8');
    }
}
TraductorViewProvider.viewType = 'traductorView';
/* ============================================================
   =================== TRADUCTOR API ==========================
   ============================================================ */
async function translateText(texto, fromLang = 'es', toLang = 'en') {
    try {
        const response = await axios_1.default.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=${fromLang}|${toLang}`);
        if (response.data?.responseData?.translatedText) {
            return response.data.responseData.translatedText;
        }
        else {
            throw new Error('Sin traducción válida');
        }
    }
    catch (error) {
        console.error('Error traduciendo:', error);
        vscode.window.showErrorMessage('❌ Error al traducir. Usando texto original.');
        return texto;
    }
}
/* ============================================================
   =================== HELPERS ================================
   ============================================================ */
function toCamelCase(text) {
    return text
        .toLowerCase()
        .split(/[\s_]+/)
        .map((word, index) => index === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}
function esEspanol(word) {
    if (/[áéíóúñ]/i.test(word))
        return true;
    const comunes = ["para", "datos", "usuario", "ingresar", "nombre", "principal", "funcion"];
    if (comunes.includes(word.toLowerCase()))
        return true;
    return /^[a-zA-Z_]+$/.test(word);
}
/* ============================================================
   =============== MODO PROC: reemplazar palabra =============
   ============================================================ */
async function procesarLineaCompleta(document, position) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const lineText = document.lineAt(position.line).text.trim();
    if (!lineText)
        return;
    // Detectar español mínimo
    const contieneEspañol = /[áéíóúñ]/i.test(lineText) ||
        /\b(el|la|los|las|para|de|que|es|un|una)\b/i.test(lineText);
    if (!contieneEspañol)
        return;
    // ⬅⬅ TRADUCCIÓN COMPLETA — mantiene espacios
    const traducido = await translateText(lineText, "es", "en");
    // Reemplazar la línea tal cual, sin camelCase
    const start = new vscode.Position(position.line, 0);
    const end = new vscode.Position(position.line, lineText.length);
    await editor.edit(edit => {
        edit.replace(new vscode.Range(start, end), traducido);
    });
}
/* ============================================================
   ====================== ACTIVATE ============================
   ============================================================ */
function activate(context) {
    console.log('Extensión Traductor con PROC activada.');
    const traductorViewProvider = new TraductorViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(TraductorViewProvider.viewType, traductorViewProvider));
    const translateTextCommand = vscode.commands.registerCommand('traductor.translateText', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();
        if (!selectedText)
            return vscode.window.showInformationMessage('Selecciona texto.');
        const traducido = await translateText(selectedText, 'es', 'en');
        await editor.edit(editBuilder => {
            editBuilder.replace(selection, traducido);
        });
        vscode.window.showInformationMessage(`Traducido: ${traducido}`);
    });
    const translateVariableCommand = vscode.commands.registerCommand('traductor.translateVariable', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();
        if (!selectedText)
            return;
        const textoEspaciado = selectedText.replace(/([a-z])([A-Z])/g, '$1 $2');
        const traducido = await translateText(textoEspaciado, 'es', 'en');
        const camelCase = toCamelCase(traducido);
        await editor.edit(editBuilder => {
            editBuilder.replace(selection, camelCase);
        });
    });
    context.subscriptions.push(translateTextCommand, translateVariableCommand);
    /* ============================================================
       ========== MODO PROC: detectar cuando escribe ==============
       ============================================================ */
    vscode.workspace.onDidChangeTextDocument(async (event) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const changes = event.contentChanges;
        if (changes.length === 0)
            return;
        const change = changes[0];
        // Detectar si se insertó un salto de línea
        const saltoDetectado = change.text.includes("\n");
        if (!saltoDetectado) {
            return; // no presionó ENTER
        }
        // Procesar la palabra/frase antes del salto de línea
        const position = change.range.start;
        const document = event.document;
        procesarLineaCompleta(document, position);
    });
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map