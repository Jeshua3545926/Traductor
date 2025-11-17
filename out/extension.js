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
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case "translateText":
                    try {
                        const translated = await translateText(data.text, data.fromLang, data.toLang);
                        webviewView.webview.postMessage({
                            command: "translationResult",
                            result: translated,
                        });
                    }
                    catch (error) {
                        webviewView.webview.postMessage({
                            command: "translationError",
                            error: "Error al traducir",
                        });
                    }
                    break;
                case "translateVariable":
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showInformationMessage("No hay un editor activo.");
                        return;
                    }
                    const selection = editor.selection;
                    const selectedText = editor.document.getText(selection).trim();
                    if (!selectedText) {
                        vscode.window.showInformationMessage("Selecciona una variable para traducir.");
                        return;
                    }
                    try {
                        const textoEspaciado = selectedText.replace(/([a-z])([A-Z])/g, "$1 $2");
                        const traducido = await translateText(textoEspaciado, "es", "en");
                        const camelCase = toCamelCase(traducido);
                        await editor.edit((editBuilder) => {
                            editBuilder.replace(selection, camelCase);
                        });
                        vscode.window.showInformationMessage(`✅ Variable traducida: '${selectedText}' → '${camelCase}'`);
                    }
                    catch (error) {
                        vscode.window.showErrorMessage("Error al traducir variable");
                    }
                    break;
            }
        });
    }
    _getHtmlForWebview(webview) {
        const htmlUri = vscode.Uri.joinPath(this._extensionUri, "src", "webview", "traductor.html");
        return fs.readFileSync(htmlUri.fsPath, "utf8");
    }
}
TraductorViewProvider.viewType = "traductorView";
/* ============================================================
   =================== TRADUCTOR API ==========================
   ============================================================ */
async function translateText(texto, fromLang = "es", toLang = "en") {
    try {
        // Use simple langpair format 'from|to' which is the expected form
        const langPair = `${fromLang}|${toLang}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=${langPair}`;
        console.log("translateText: requesting url", url);
        const response = await axios_1.default.get(url);
        console.log("translateText: response.data ->", JSON.stringify(response.data));
        if (response.data?.responseData?.translatedText) {
            return response.data.responseData.translatedText;
        }
        else {
            throw new Error("Sin traducción válida");
        }
    }
    catch (error) {
        console.error("Error traduciendo:", error);
        vscode.window.showErrorMessage("❌ Error al traducir. Usando texto original.");
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
        .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
}
function esEspanol(word) {
    if (/[áéíóúñ]/i.test(word))
        return true;
    const comunes = [
        "para",
        "datos",
        "usuario",
        "ingresar",
        "nombre",
        "principal",
        "funcion",
    ];
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
    const line = document.lineAt(position.line);
    const fullText = line.text;
    const trimmed = fullText.trim();
    if (!trimmed)
        return;
    console.log("Text trimmed for detection:", JSON.stringify(trimmed));
    // Detectar si hay texto significativo (letras, números o acentos)
    const contieneTexto = /[A-Za-z0-9ÁÉÍÓÚáéíóúñÑ]/.test(trimmed);
    if (!contieneTexto)
        return;
    // Preservar indentación inicial
    const leadingWhitespaceMatch = fullText.match(/^\s*/);
    const leading = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : "";
    console.log(`procesarLineaCompleta: linea ${position.line} -> '${fullText}'`);
    let traducido = trimmed;
    try {
        traducido = await translateText(trimmed, "es", "en");
        console.log("Traducción recibida:", traducido);
    }
    catch (err) {
        console.error("Error en translateText:", err);
    }
    const nuevaLinea = leading + traducido;
    await editor.edit((edit) => {
        edit.replace(line.range, nuevaLinea);
    });
}
/* ============================================================
   ====================== ACTIVATE ============================
   ============================================================ */
function activate(context) {
    console.log("Extensión Traductor con PROC activada.");
    const traductorViewProvider = new TraductorViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(TraductorViewProvider.viewType, traductorViewProvider));
    const translateTextCommand = vscode.commands.registerCommand("traductor.translateText", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();
        if (!selectedText)
            return vscode.window.showInformationMessage("Selecciona texto.");
        const traducido = await translateText(selectedText, "es", "en");
        await editor.edit((editBuilder) => {
            editBuilder.replace(selection, traducido);
        });
        vscode.window.showInformationMessage(`Traducido: ${traducido}`);
    });
    const translateVariableCommand = vscode.commands.registerCommand("traductor.translateVariable", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();
        if (!selectedText)
            return;
        const textoEspaciado = selectedText.replace(/([a-z])([A-Z])/g, "$1 $2");
        const traducido = await translateText(textoEspaciado, "es", "en");
        const camelCase = toCamelCase(traducido);
        await editor.edit((editBuilder) => {
            editBuilder.replace(selection, camelCase);
        });
    });
    context.subscriptions.push(translateTextCommand, translateVariableCommand);
    /* ============================================================
         ========== MODO PROC: detectar cuando escribe ==============
         ============================================================ */
    vscode.workspace.onDidChangeTextDocument(async (event) => {
        const editor = vscode.window.activeTextEditor;
        console.log("onDidChangeTextDocument fired. Active editor:", !!editor);
        if (!editor)
            return;
        const changes = event.contentChanges;
        if (changes.length === 0)
            return;
        const change = changes[0];
        console.log("Change text:", JSON.stringify(change.text));
        // Detectar si se insertó un salto de línea
        const saltoDetectado = change.text.includes("\n");
        console.log("saltoDetectado:", saltoDetectado);
        if (!saltoDetectado) {
            return; // no presionó ENTER
        }
        // Procesar la palabra/frase antes del salto de línea
        const position = change.range.start;
        const document = event.document;
        try {
            await procesarLineaCompleta(document, position);
        }
        catch (err) {
            console.error("Error en procesarLineaCompleta:", err);
        }
    });
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map