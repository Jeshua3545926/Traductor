import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';


class TraductorViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'traductorView';

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Escuchar mensajes del webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'translateText':
                    try {
                        const translated = await translateText(data.text, data.fromLang, data.toLang);
                        webviewView.webview.postMessage({
                            command: 'translationResult',
                            result: translated
                        });
                    } catch (error) {
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
                    } catch (error) {
                        vscode.window.showErrorMessage('Error al traducir variable');
                    }
                    break;
            }
        });
    }


    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Traductor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 15px;
            margin: 0;
        }
        .section {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
        }
        .section h3 {
            margin-top: 0;
            color: var(--vscode-titleBar-activeForeground);
        }
        .language-selector {
            display: flex;
            gap: 8px;
            margin-bottom: 15px;
            align-items: center;
        }
        select, textarea, button {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 6px 8px;
            font-family: inherit;
        }
        select { flex: 1; }
        textarea {
            width: 100%;
            min-height: 80px;
            margin-bottom: 10px;
            box-sizing: border-box;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            margin-right: 8px;
            margin-bottom: 8px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .result {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-textBlockQuote-border);
            border-radius: 3px;
            padding: 10px;
            margin: 10px 0;
            min-height: 40px;
        }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="section">
        <h3>🌐 Traductor de Texto</h3>
        
        <div class="language-selector">
            <select id="fromLang">
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
            </select>
            <button onclick="swapLanguages()">⇄</button>
            <select id="toLang">
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
            </select>
        </div>
        
        <textarea id="inputText" placeholder="Escribe el texto que quieres traducir..."></textarea>
        
        <button onclick="translateText()">Traducir</button>
        <button onclick="clearText()">Limpiar</button>
        
        <div id="result" class="result hidden">Resultado aparecerá aquí...</div>
    </div>
    
    <div class="section">
        <h3>🔤 Traductor de Variables</h3>
        <p>Selecciona una variable en el editor y haz clic en el botón.</p>
        
        <button onclick="translateVariable()">Traducir Variable Seleccionada</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function translateText() {
            const text = document.getElementById('inputText').value.trim();
            if (!text) return;
            
            const fromLang = document.getElementById('fromLang').value;
            const toLang = document.getElementById('toLang').value;
            
            document.getElementById('result').textContent = 'Traduciendo...';
            document.getElementById('result').classList.remove('hidden');
            
            vscode.postMessage({
                command: 'translateText',
                text: text,
                fromLang: fromLang,
                toLang: toLang
            });
        }
        
        function clearText() {
            document.getElementById('inputText').value = '';
            document.getElementById('result').classList.add('hidden');
        }
        
        function swapLanguages() {
            const fromLang = document.getElementById('fromLang');
            const toLang = document.getElementById('toLang');
            const temp = fromLang.value;
            fromLang.value = toLang.value;
            toLang.value = temp;
        }
        
        function translateVariable() {
            vscode.postMessage({
                command: 'translateVariable'
            });
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'translationResult':
                    document.getElementById('result').textContent = message.result;
                    break;
                case 'translationError':
                    document.getElementById('result').textContent = 'Error: ' + message.error;
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}



// Función simple para traducir usando MyMemory API (gratuita)
async function translateText(texto: string, fromLang = 'es', toLang = 'en'): Promise<string> {
    try {
        const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=${fromLang}|${toLang}`);

        if (response.data && response.data.responseData && response.data.responseData.translatedText) {
            return response.data.responseData.translatedText;
        } else {
            throw new Error('No se pudo obtener traducción');
        }
    } catch (error) {
        console.error('Error traduciendo:', error);
        vscode.window.showErrorMessage('❌ Error al traducir. Usando texto original.');
        return texto;
    }
}

// Función para convertir a camelCase
function toCamelCase(text: string): string {
    return text
        .toLowerCase()
        .split(/[\s_]+/)
        .map((word, index) =>
            index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join('');
}

export function activate(context: vscode.ExtensionContext) {
    console.log('¡Extensión Traductor VS Code está activa!');

    // Registrar el WebView Provider
    const traductorViewProvider = new TraductorViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraductorViewProvider.viewType, traductorViewProvider)
    );

    // Comando para traducir texto seleccionado
    const translateTextCommand = vscode.commands.registerCommand('traductor.translateText', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No hay un editor activo.');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();

        if (!selectedText) {
            vscode.window.showInformationMessage('Selecciona texto para traducir.');
            return;
        }

        vscode.window.showInformationMessage('Traduciendo...');

        try {
            const traducido = await translateText(selectedText, 'es', 'en');

            await editor.edit(editBuilder => {
                editBuilder.replace(selection, traducido);
            });

            vscode.window.showInformationMessage(`✅ Traducido: '${selectedText}' → '${traducido}'`);
        } catch (error) {
            vscode.window.showErrorMessage('Error al traducir: ' + error);
        }
    });

    // Comando para traducir variables a camelCase
    const translateVariableCommand = vscode.commands.registerCommand('traductor.translateVariable', async () => {
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

        vscode.window.showInformationMessage('Traduciendo variable...');

        try {
            // Separar camelCase existente
            const textoEspaciado = selectedText.replace(/([a-z])([A-Z])/g, '$1 $2');

            const traducido = await translateText(textoEspaciado, 'es', 'en');
            const camelCase = toCamelCase(traducido);

            await editor.edit(editBuilder => {
                editBuilder.replace(selection, camelCase);
            });

            vscode.window.showInformationMessage(`✅ Variable traducida: '${selectedText}' → '${camelCase}'`);
        } catch (error) {
            vscode.window.showErrorMessage('Error al traducir variable: ' + error);
        }
    });

    // Registrar los comandos
    context.subscriptions.push(translateTextCommand, translateVariableCommand);
}

// const graphicInterface = () => {
//     return `<!DOCTYPE html>
//     <html lang="es">
//     <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <title>Traductor</title>
//         <style>
//             body {
//                 font-family: var(--vscode-font-family);
//                 color: var(--vscode-foreground);
//                 background-color: var(--vscode-editor-background);
//                 padding: 15px;
//                 margin: 0;
//             }
//             .section {
//                 margin-bottom: 20px;
//                 padding: 15px;
//                 border: 1px solid var(--vscode-panel-border);
//                 border-radius: 6px;
//             }
//             .section h3 {
//                 margin-top: 0;
//                 color: var(--vscode-titleBar-activeForeground);
//             }
//             .language-selector {
//                 display: flex;
//                 gap: 8px;
//                 margin-bottom: 15px;
//                 align-items: center;
//             }
//             select, textarea, button {
//                 background-color: var(--vscode-input-background);
//                 color: var(--vscode-input-foreground);
//                 border: 1px solid var(--vscode-input-border);
//                 border-radius: 3px;
//                 padding: 6px 8px;
//                 font-family: inherit;
//             }
//             select { flex: 1; }
//             textarea {
//                 width: 100%;
//                 min-height: 80px;
//                 margin-bottom: 10px;
//                 box-sizing: border-box;
//             }
//             button {
//                 background-color: var(--vscode-button-background);
//                 color: var(--vscode-button-foreground);
//                 cursor: pointer;
//                 margin-right: 8px;
//                 margin-bottom: 8px;
//             }
//             button:hover {
//                 background-color: var(--vscode-button-hoverBackground);
//             }
//             .result {
//                 background-color: var(--vscode-textBlockQuote-background);
//                 border: 1px solid var(--vscode-textBlockQuote-border);
//                 border-radius: 3px;
//                 padding: 10px;
//                 margin: 10px 0;
//                 min-height: 40px;
//             }
//             .hidden { display: none; }
//         </style>
//     </head>
//     <body>
//         <div class="section">
//             <h3>🌐 Traductor de Texto</h3>
            
//             <div class="language-selector">
//                 <select id="fromLang">
//                     <option value="es">Español</option>
//                     <option value="en">English</option>
//                     <option value="fr">Français</option>
//                 </select>
//                 <button onclick="swapLanguages()">⇄</button>
//                 <select id="toLang">
//                     <option value="en">English</option>
//                     <option value="es">Español</option>
//                     <option value="fr">Français</option>
//                 </select>
//             </div>
            
//             <textarea id="inputText" placeholder="Escribe el texto que quieres traducir..."></textarea>
            
//             <button onclick="translateText()">Traducir</button>
//             <button onclick="clearText()">Limpiar</button>
            
//             <div id="result" class="result hidden">Resultado aparecerá aquí...</div>
//         </div>
        
//         <div class="section">
//             <h3>🔤 Traductor de Variables</h3>
//             <p>Selecciona una variable en el editor y haz clic en el botón.</p>
            
//             <button onclick="translateVariable()">Traducir Variable Seleccionada</button>
//         </div>
    
//         <script>
//             const vscode = acquireVsCodeApi();
            
//             function translateText() {
//                 const text = document.getElementById('inputText').value.trim();
//                 if (!text) return;
                
//                 const fromLang = document.getElementById('fromLang').value;
//                 const toLang = document.getElementById('toLang').value;
                
//                 document.getElementById('result').textContent = 'Traduciendo...';
//                 document.getElementById('result').classList.remove('hidden');
                
//                 vscode.postMessage({
//                     command: 'translateText',
//                     text: text,
//                     fromLang: fromLang,
//                     toLang: toLang
//                 });
//             }
            
//             function clearText() {
//                 document.getElementById('inputText').value = '';
//                 document.getElementById('result').classList.add('hidden');
//             }
            
//             function swapLanguages() {
//                 const fromLang = document.getElementById('fromLang');
//                 const toLang = document.getElementById('toLang');
//                 const temp = fromLang.value;
//                 fromLang.value = toLang.value;
//                 toLang.value = temp;
//             }
            
//             function translateVariable() {
//                 vscode.postMessage({
//                     command: 'translateVariable'
//                 });
//             }
            
//             window.addEventListener('message', event => {
//                 const message = event.data;
                
//                 switch (message.command) {
//                     case 'translationResult':
//                         document.getElementById('result').textContent = message.result;
//                         break;
//                     case 'translationError':
//                         document.getElementById('result').textContent = 'Error: ' + message.error;
//                         break;
//                 }
//             });
//         </script>
//     </body>
//     </html>`;
// }



export function deactivate() { }
