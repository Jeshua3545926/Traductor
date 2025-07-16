import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Clase para el WebView Provider del sidebar
class TraductorViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'traductorView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Manejar mensajes del webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'translateText':
                    const translated = await translateTextWithLangs(data.text, data.fromLang, data.toLang);
                    webviewView.webview.postMessage({
                        command: 'translationResult',
                        result: translated
                    });
                    break;
                case 'translateVariableSelected':
                    await this.translateSelectedVariable();
                    webviewView.webview.postMessage({
                        command: 'variableTranslated'
                    });
                    break;
                case 'insertAtCursor':
                    this.insertAtCursor(data.text);
                    break;
                case 'replaceSelected':
                    this.replaceSelected(data.text);
                    break;
            }
        });
    }

    private insertAtCursor(text: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, text);
            });
        }
    }

    private replaceSelected(text: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
            editor.edit(editBuilder => {
                editBuilder.replace(editor.selection, text);
            });
        }
    }

    private async translateSelectedVariable() {
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

        // Separar camelCase existente
        const textoEspaciado = selectedText.replace(/([a-z])([A-Z])/g, '$1 $2');

        const traducido = await translateText(textoEspaciado);
        const camelCase = toCamelCase(traducido);

        await editor.edit(editBuilder => {
            editBuilder.replace(selection, camelCase);
        });

        vscode.window.showInformationMessage(`✅ Variable traducida: '${selectedText}' → '${camelCase}'`);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Obtener URIs para los recursos
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'script.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'styles.css'));

        // Leer el archivo HTML
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'traductor.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Reemplazar los placeholders con las URIs reales
        htmlContent = htmlContent.replace('{{cssUri}}', styleUri.toString());
        htmlContent = htmlContent.replace('{{scriptUri}}', scriptUri.toString());

        return htmlContent;
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

// Función de traducción usando Google Translate con idiomas específicos
async function translateTextWithLangs(texto: string, fromLang: string, toLang: string): Promise<string> {
    try {
        const response = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(texto)}`);
        return response.data[0][0][0];
    } catch (error) {
        vscode.window.showErrorMessage('❌ Error al traducir.');
        console.error(error);
        return texto;
    }
}

// Función de traducción usando Google Translate (versión original)
async function translateText(texto: string): Promise<string> {
    try {
        const response = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(texto)}`);
        return response.data[0][0][0];
    } catch (error) {
        vscode.window.showErrorMessage('❌ Error al traducir.');
        console.error(error);
        return texto;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('¡Extensión Traductor VS Code está activa!');

    // Registrar el WebView Provider para el sidebar
    const traductorViewProvider = new TraductorViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraductorViewProvider.viewType, traductorViewProvider)
    );

    // Comando para traducir texto seleccionado (mantener compatibilidad)
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

        const traducido = await translateText(selectedText);

        await editor.edit(editBuilder => {
            editBuilder.replace(selection, traducido);
        });

        vscode.window.showInformationMessage(`✅ Traducido: '${selectedText}' → '${traducido}'`);
    });

    // Comando para traducir variables a camelCase (mantener compatibilidad)
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

        // Separar camelCase existente
        const textoEspaciado = selectedText.replace(/([a-z])([A-Z])/g, '$1 $2');

        const traducido = await translateText(textoEspaciado);
        const camelCase = toCamelCase(traducido);

        await editor.edit(editBuilder => {
            editBuilder.replace(selection, camelCase);
        });

        vscode.window.showInformationMessage(`✅ Variable traducida: '${selectedText}' → '${camelCase}'`);
    });

    // Registrar todos los comandos
    context.subscriptions.push(translateTextCommand, translateVariableCommand);
}

export function deactivate() { }